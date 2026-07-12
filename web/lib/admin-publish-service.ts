import crypto from "node:crypto";
import { validateAdminPublishMarket } from "@/lib/admin-publish-market";
import { previewSummaryFromBody, getCoverImageUrl } from "@/lib/manual-post";
import {
  isSignalStatus,
  signalStatusFromForm,
  type SignalStatus,
} from "@/lib/signal-status";
import { enrichStockMatchContext } from "@/lib/stock-signal-sync";
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
  signalStatus: SignalStatus;
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
      signalStatus: signalStatusFromForm(formData.get("signal_status")),
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

function publishStockMatchContext(payload: PublishFormPayload) {
  const code = payload.stockCode.trim();
  return {
    market: payload.marketType,
    stockCode: payload.marketType === "kr" ? code : null,
    stockName: normalizePublishStockName(payload.stockName),
    ticker: payload.marketType === "us" ? code.toUpperCase() : code,
  } satisfies import("@/lib/stock-signal-sync").StockMatchContext;
}

function normalizePublishStockName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
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
    signal_status: payload.signalStatus,
    signal_updated_at: new Date().toISOString(),
  };
}

type SupabaseError = { code?: string; message?: string };

function isMissingOptionalColumnError(error: SupabaseError): boolean {
  if (error.code === "PGRST204" || error.code === "42703") return true;
  const msg = error.message ?? "";
  return (
    msg.includes("market_type") ||
    msg.includes("stock_name") ||
    msg.includes("stock_code") ||
    msg.includes("signal_status")
  );
}

function marketColumnFields(payload: PublishFormPayload) {
  return {
    market_type: payload.marketType,
    stock_name: payload.stockName,
    stock_code: payload.stockCode,
  };
}

function extendedColumnFields(payload: PublishFormPayload) {
  return marketColumnFields(payload);
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
    .insert({ ...baseRow, ...extendedColumnFields(payload) })
    .select("id, created_at")
    .maybeSingle();

  if (error && isMissingOptionalColumnError(error)) {
    console.warn(
      "[admin/publish] optional columns missing — storing market/signal in gemini_metadata + stocks"
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

  try {
    await bulkUpdateSignalStatusByStockContext(
      publishStockMatchContext(payload),
      payload.signalStatus
    );
  } catch (err) {
    console.warn("[admin/publish] post-insert stock signal sync", err);
  }

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
    .update({ ...baseRow, ...extendedColumnFields(payload) })
    .eq("id", id)
    .select("id, created_at")
    .maybeSingle();

  if (error && isMissingOptionalColumnError(error)) {
    console.warn("[admin/publish] optional columns missing on update — fallback");
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

  try {
    await bulkUpdateSignalStatusByStockContext(
      publishStockMatchContext(payload),
      payload.signalStatus
    );
  } catch (err) {
    console.warn("[admin/publish] post-update stock signal sync", err);
  }

  return data;
}

/** 동일 종목(KR: 코드+이름 / US: 티커+이름) gemini_metadata.signal_status 일괄 갱신 */
export async function bulkUpdateSignalStatusByStockContext(
  ctx: import("@/lib/stock-signal-sync").StockMatchContext,
  signalStatus: SignalStatus,
  fallbackId?: string
): Promise<{
  updatedCount: number;
  stockCode: string | null;
  stockName: string | null;
  ticker: string | null;
  market: "us" | "kr" | "unknown";
  signal_status: SignalStatus;
}> {
  const admin = createAdminClient();
  const {
    findDisclosuresByStockContext,
    matchContextIsComplete,
    normalizeStockCode,
    resolveEffectiveMarket,
  } = await import("@/lib/stock-signal-sync");

  if (!matchContextIsComplete(ctx)) {
    throw new Error("NO_STOCK_IDENTITY");
  }

  const rows = await findDisclosuresByStockContext(ctx, admin, fallbackId);

  if (rows.length === 0) {
    throw new Error("NO_MATCHING_STOCK");
  }

  const market = resolveEffectiveMarket(ctx);
  const updatedAt = new Date().toISOString();

  let updatedCount = 0;
  for (const row of rows) {
    const prev = (row.gemini_metadata ?? {}) as Record<string, unknown>;
    const gemini_metadata: Record<string, unknown> = {
      ...prev,
      signal_status: signalStatus,
      signal_updated_at: updatedAt,
      market_type: market,
    };

    if (ctx.stockName) {
      gemini_metadata.stock_name = ctx.stockName;
    }
    if (market === "kr" && ctx.stockCode) {
      gemini_metadata.stock_code = ctx.stockCode;
      gemini_metadata.ticker = ctx.stockCode;
    }
    if (market === "us" && ctx.ticker) {
      gemini_metadata.ticker = normalizeStockCode(ctx.ticker);
      gemini_metadata.stock_code = normalizeStockCode(ctx.ticker);
    }

    const { error } = await admin
      .from("disclosures")
      .update({ gemini_metadata })
      .eq("id", row.id);

    if (error) {
      console.error("[stock-signal] bulk update failed", row.id, error.code, error.message);
      throw new Error(`${error.code ?? "DB_ERROR"}: ${error.message}`);
    }
    updatedCount += 1;
  }

  console.log("[stock-signal] bulk updated", {
    market: ctx.market,
    stockCode: ctx.stockCode,
    stockName: ctx.stockName,
    ticker: ctx.ticker,
    signalStatus,
    updatedCount,
  });

  return {
    updatedCount,
    stockCode: ctx.stockCode,
    stockName: ctx.stockName,
    ticker: ctx.ticker,
    market: ctx.market,
    signal_status: signalStatus,
  };
}

/** @deprecated bulkUpdateSignalStatusByStockContext 사용 */
export async function bulkUpdateSignalStatusByStockIdentity(
  identity: import("@/lib/stock-signal-sync").StockIdentity,
  signalStatus: SignalStatus,
  fallbackId?: string
): Promise<{
  updatedCount: number;
  stockCode: string | null;
  stockName: string | null;
  ticker: string | null;
  signal_status: SignalStatus;
}> {
  const result = await bulkUpdateSignalStatusByStockContext(
    { market: "unknown", ...identity },
    signalStatus,
    fallbackId
  );
  return result;
}

/** @deprecated bulkUpdateSignalStatusByStockIdentity 사용 */
export async function bulkUpdateSignalStatusByStockCode(
  stockCode: string,
  signalStatus: SignalStatus
): Promise<{ updatedCount: number; stockCode: string; signal_status: SignalStatus }> {
  const result = await bulkUpdateSignalStatusByStockIdentity(
    { stockCode, stockName: null, ticker: null },
    signalStatus
  );
  return {
    updatedCount: result.updatedCount,
    stockCode: result.stockCode ?? stockCode,
    signal_status: result.signal_status,
  };
}

function enrichStockIdentityFromDisclosure(
  existing: DisclosureWithStock
): import("@/lib/stock-signal-sync").StockMatchContext {
  return enrichStockMatchContext(existing);
}

export async function updateAdminDisclosureSignal(
  id: string,
  signalStatus: SignalStatus
): Promise<{
  id: string;
  signal_status: SignalStatus;
  updatedCount: number;
  stockCode: string | null;
  stockName: string | null;
  ticker: string | null;
}> {
  if (!isSignalStatus(signalStatus)) {
    throw new Error("INVALID_SIGNAL");
  }

  const existing = await getAdminDisclosureById(id);
  if (!existing) throw new Error("NOT_FOUND");

  const ctx = enrichStockIdentityFromDisclosure(existing);
  const { matchContextIsComplete } = await import("@/lib/stock-signal-sync");
  if (!matchContextIsComplete(ctx)) {
    throw new Error("NO_STOCK_IDENTITY");
  }

  const result = await bulkUpdateSignalStatusByStockContext(ctx, signalStatus, id);

  return {
    id,
    signal_status: result.signal_status,
    updatedCount: result.updatedCount,
    stockCode: result.stockCode,
    stockName: result.stockName,
    ticker: result.ticker,
  };
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
