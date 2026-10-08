import { createClient } from "@supabase/supabase-js";
import { getWashoutCatalog, type WashoutBoardPayload } from "@/lib/us-market/washout-live";

const BUCKET = "washout-catalog";
const OBJECT_PATH = "current.json";

export type PublishedWashout = {
  builtAt: string;
  boards: Record<string, WashoutBoardPayload>;
};

function alreadyExists(message: string): boolean {
  return /already exists|duplicate/i.test(message);
}

/** Next가 저장소 읽기를 오래 캐시하면 첫 표가 계속 나간다. */
function storageAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

async function ensureBucket(): Promise<void> {
  const admin = storageAdmin();
  const { error } = await admin.storage.createBucket(BUCKET, { public: false });
  if (error && !alreadyExists(error.message)) throw error;
  const { error: publicErr } = await admin.storage.updateBucket(BUCKET, { public: true });
  if (publicErr) throw publicErr;
}

export async function savePublishedWashout(
  boards: Record<string, WashoutBoardPayload>
): Promise<string> {
  await ensureBucket();
  const builtAt = new Date().toISOString();
  const body = JSON.stringify({ builtAt, boards } satisfies PublishedWashout);
  const admin = storageAdmin();
  const { error } = await admin.storage.from(BUCKET).upload(OBJECT_PATH, Buffer.from(body, "utf8"), {
    upsert: true,
    contentType: "application/json",
    cacheControl: "15",
  });
  if (error) throw error;
  return builtAt;
}

export async function loadPublishedWashout(): Promise<PublishedWashout | null> {
  try {
    const admin = storageAdmin();
    const { data, error } = await admin.storage.from(BUCKET).download(OBJECT_PATH);
    if (error || !data) return null;
    const parsed = JSON.parse(await data.text()) as PublishedWashout;
    if (!parsed?.boards || typeof parsed.boards !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 방문과 무관하게 점수표 한 장을 만들어 저장한다. Polygon은 호출하지 않는다. */
export async function publishWashoutCatalog(): Promise<{
  builtAt: string;
  boards: Record<string, WashoutBoardPayload>;
}> {
  const boards = await getWashoutCatalog();
  const builtAt = await savePublishedWashout(boards);
  return { builtAt, boards };
}
