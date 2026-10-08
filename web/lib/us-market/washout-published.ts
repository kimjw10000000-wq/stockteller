import { createAdminClient } from "@/lib/supabase/admin";
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

async function ensureBucket(): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage.createBucket(BUCKET, { public: false });
  if (error && !alreadyExists(error.message)) throw error;
}

export async function savePublishedWashout(
  boards: Record<string, WashoutBoardPayload>
): Promise<string> {
  await ensureBucket();
  const builtAt = new Date().toISOString();
  const body = JSON.stringify({ builtAt, boards } satisfies PublishedWashout);
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(OBJECT_PATH, Buffer.from(body, "utf8"), {
    upsert: true,
    contentType: "application/json",
    cacheControl: "0",
  });
  if (error) throw error;
  return builtAt;
}

export async function loadPublishedWashout(): Promise<PublishedWashout | null> {
  try {
    const admin = createAdminClient();
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
