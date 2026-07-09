export type AdminMarketType = "us" | "kr";

export function normalizeMarketType(raw: string | null | undefined): AdminMarketType | null {
  const v = raw?.trim().toLowerCase();
  if (v === "us" || v === "kr") return v;
  return null;
}

export function normalizeStockName(raw: string): string {
  return raw.trim();
}

export function normalizeStockCode(raw: string, market: AdminMarketType): string {
  const trimmed = raw.trim();
  if (market === "us") return trimmed.toUpperCase();
  return trimmed.replace(/\D/g, "");
}

export function validateAdminPublishMarket(
  marketTypeRaw: string | null | undefined,
  stockNameRaw: string | null | undefined,
  stockCodeRaw: string | null | undefined
): { ok: true; marketType: AdminMarketType; stockName: string; stockCode: string } | { ok: false; error: string } {
  const marketType = normalizeMarketType(marketTypeRaw);
  if (!marketType) {
    return { ok: false, error: "미국주식 또는 한국주식을 선택해 주세요." };
  }

  const stockName = normalizeStockName(String(stockNameRaw ?? ""));
  if (!stockName) {
    return { ok: false, error: "주식 이름을 입력해 주세요." };
  }

  const stockCode = normalizeStockCode(String(stockCodeRaw ?? ""), marketType);
  if (!stockCode) {
    return { ok: false, error: marketType === "us" ? "티커를 입력해 주세요." : "종목 코드를 입력해 주세요." };
  }

  if (marketType === "us") {
    if (!/^[A-Z0-9.-]{1,12}$/.test(stockCode)) {
      return { ok: false, error: "미국 티커 형식이 올바르지 않습니다. (예: AAPL)" };
    }
  } else if (!/^\d{4,6}$/.test(stockCode)) {
    return { ok: false, error: "한국 종목 코드는 4~6자리 숫자만 입력할 수 있습니다. (예: 005930)" };
  }

  return { ok: true, marketType, stockName, stockCode };
}
