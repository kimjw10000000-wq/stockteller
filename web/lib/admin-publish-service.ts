import crypto from "node:crypto";
import { validateAdminPublishMarket } from "@/lib/admin-publish-market";
import { previewSummaryFromBody, getCoverImageUrl } from "@/lib/manual-post";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DisclosureWithStock } from "@/lib/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type PublishFormPayload = {
  title: string;
  body: string;
  marketType: "us" | "kr";
  stockName: string;
  stockCode: string;
  coverImageUrl: string | null;
};

export function parsePublishFormData(formData: FormData): {
  ok: true;
  data: Omit<PublishFormPayload, "coverImageUrl"> & { image: File | null; removeImage: boolean };
} | { ok: false; error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const image = formData.get("image");
  const removeImage = String(formData.get("remove_image") ?? "") === "1";

  if (!title) return { ok: false, error: "제목을 입력해 주세요." };
  if (!body) return { ok: false, error: "본문을 입력해 주세요." };

  const marketCheck = validateAdminPublishMarket(
    String(formData.get("market_type") ?? ""),
    String(formData.get("stock_name") ?? ""),
    String(formData.get("stock_code") ?? "")
  );
  if (!marketCheck.ok) return { ok: false, error: marketCheck.error };

  return {
    ok: true,
    data: {
      title,
      body,
      marketType: marketCheck.marketType,
      stockName: marketCheck.stockName,
      stockCode: marketCheck.stockCode,
      image: image instanceof File && image.size > 0 ? image : null,
      removeImage,
    },
  };
}

async function upsertStockId(
  admin: ReturnType<typeof createAdminClient>,
  stockName: string,
  stockCode: string,
  marketType: "us" | "kr"
): Promise<string | null> {
  const { data, error } = await admin
    .from("stocks")
    .upsert({ name: stockName, ticker: stockCode, market: marketType }, { onConflict: "ticker" })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin/publish] stock upsert", error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function uploadCoverImage(image: File): Promise<string | null> {
  if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
    throw new Error("IMAGE_TYPE");
  }
  if (image.size > MAX_IMAGE_BYTES) {
    throw new Error("IMAGE_SIZE");
  }

  const admin = createAdminClient();
  const ext = image.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await image.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("news-images")
    .upload(path, buffer, { contentType: image.type, upsert: false });

  if (uploadError) {
    console.error("[admin/publish] upload", uploadError.message);
    throw new Error("IMAGE_UPLOAD");
  }

  const { data: publicUrl } = admin.storage.from("news-images").getPublicUrl(path);
  return publicUrl.publicUrl;
}

function buildGeminiMetadata(
  payload: PublishFormPayload,
  authorEmail: string,
  existing?: DisclosureWithStock | null
) {
  const prev = { ...(existing?.gemini_metadata ?? {}) } as Record<string, unknown>;
  delete prev.membership_type;
  return {
    ...prev,
    source: "admin_publish",
    cover_image: payload.coverImageUrl,
    author_email: authorEmail,
    market_type: payload.marketType,
    stock_name: payload.stockName,
    stock_code: payload.stockCode,
  };
}

type SupabaseError = { code?: string; message?: string };

/** DB에 market_type 등 컬럼이 아직 없을 때(PGRST204) fallback insert */
function isMissingMarketColumnError(error: SupabaseError): boolean {
  if (error.code === "PGRST204") return true;
  const msg = error.message ?? "";
  return (
    msg.includes("market_type") ||
    msg.includes("stock_name") ||
    msg.includes("stock_code")
  );
}

function marketColumnFields(payload: PublishFormPayload) {
  return {
    market_type: payload.marketType,
    stock_name: payload.stockName,
    stock_code: payload.stockCode,
  };
}

export async function insertAdminDisclosure(
  payload: PublishFormPayload,
  authorEmail: string
): Promise<{ id: string; created_at: string }> {
  const admin = createAdminClient();
  const stockId = await upsertStockId(
    admin,
    payload.stockName,
    payload.stockCode,
    payload.marketType
  );
  const summary = previewSummaryFromBody(payload.body);
  const externalId = `admin:${crypto.randomUUID()}`;

  const baseRow = {
    stock_id: stockId,
    external_id: externalId,
    title: payload.title,
    raw_content: payload.body,
    summary,
    sentiment: null,
    analysis_score: null,
    gemini_metadata: buildGeminiMetadata(payload, authorEmail),
  };

  let { data, error } = await admin
    .from("disclosures")
    .insert({ ...baseRow, ...marketColumnFields(payload) })
    .select("id, created_at")
    .maybeSingle();

  if (error && isMissingMarketColumnError(error)) {
    console.warn(
      "[admin/publish] disclosures.market_type columns missing — storing market/stock in gemini_metadata + stocks only"
    );
    ({ data, error } = await admin
      .from("disclosures")
      .insert(baseRow)
      .select("id, created_at")
      .maybeSingle());
  }

  if (error) {
    console.error("[admin/publish] insert", error.code, error.message);
    throw new Error(error.message);
  }
  if (!data?.id) throw new Error("INSERT_FAILED");
  return data;
}

export async function updateAdminDisclosure(
  id: string,
  payload: PublishFormPayload,
  authorEmail: string,
  existing: DisclosureWithStock
): Promise<{ id: string; created_at: string }> {
  const admin = createAdminClient();
  const stockId = await upsertStockId(
    admin,
    payload.stockName,
    payload.stockCode,
    payload.marketType
  );
  const summary = previewSummaryFromBody(payload.body);

  const baseRow = {
    stock_id: stockId,
    title: payload.title,
    raw_content: payload.body,
    summary,
    gemini_metadata: buildGeminiMetadata(payload, authorEmail, existing),
  };

  let { data, error } = await admin
    .from("disclosures")
    .update({ ...baseRow, ...marketColumnFields(payload) })
    .eq("id", id)
    .select("id, created_at")
    .maybeSingle();

  if (error && isMissingMarketColumnError(error)) {
    console.warn("[admin/publish] market columns missing on update — fallback");
    ({ data, error } = await admin
      .from("disclosures")
      .update(baseRow)
      .eq("id", id)
      .select("id, created_at")
      .maybeSingle());
  }

  if (error) {
    console.error("[admin/publish] update", error.code, error.message);
    throw new Error(error.message);
  }
  if (!data?.id) throw new Error("UPDATE_FAILED");
  return data;
}

export async function getAdminDisclosureById(id: string): Promise<DisclosureWithStock | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("disclosures")
    .select("*, stocks(name, ticker, sector, market)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[admin/publish] get", error.message);
    return null;
  }
  return data as DisclosureWithStock | null;
}

export function resolveCoverImageUrl(
  parsed: { image: File | null; removeImage: boolean },
  existing: DisclosureWithStock | null
): string | null {
  if (parsed.removeImage) return null;
  if (parsed.image) return null;
  return existing ? getCoverImageUrl(existing) : null;
}
