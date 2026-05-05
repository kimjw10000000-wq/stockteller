# 글로벌 시세 엔진 & Supabase Realtime 연동

## 1. 데이터베이스

1. Supabase SQL Editor에서 `supabase/high_volatility_stocks.sql` 실행.
2. **Database → Replication** (또는 **Publication**)에서 `supabase_realtime` publication에  
   테이블 `high_volatility_stocks` 추가.
3. (대시보드 UI) **Realtime** 메뉴에서 해당 테이블이 구독 가능한지 확인.

> RLS: `anon`은 `SELECT`만 허용. `INSERT`/`UPDATE`는 **Service Role** 엔진 프로세스만 수행합니다.

## 2. 환경 변수 (`web/.env.local`)

- `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` — 프론트 + 엔진 URL 정규화용  
- `SUPABASE_SERVICE_ROLE_KEY` — 엔진이 `upsert` 할 때 필수  
- `FINNHUB_API_KEY` — 미국 WebSocket  
- 한국 KIS: `KIS_APP_KEY`, `KIS_APP_SECRET`, 선택 `KIS_MODE`, `KIS_WS_URL`, `KIS_REST_BASE`  
- 일본: `JQUANTS_MAIL`, `JQUANTS_PASSWORD`, 선택 `JQUANTS_API_BASE`

엔진 전용 목록:

- `ENGINE_US_SYMBOLS` — 예: `AAPL,NVDA,TSLA`
- `ENGINE_US_THRESHOLD_PCT` — 기본 `20`
- `ENGINE_KR_CODES` — 예: `005930,000660`
- `ENGINE_KR_PREV_CLOSE_JSON` — **전일 종가** 맵 JSON (예: `{"005930":70000,"000660":50000}`)  
  KIS 체결가와 비교해 등락률 계산에 사용합니다. 장전 갱신 또는 별도 배치로 채우는 것을 권장합니다.
- `ENGINE_KR_THRESHOLD_PCT` — 기본 `15`
- `ENGINE_JP_CODES` — J-Quants 종목 코드
- `ENGINE_JP_POLL_MS` — 폴링 주기(ms), 기본 30000
- `ENGINE_JP_THRESHOLD_PCT` — 기본 `15`
- `ENGINE_UPSERT_MIN_MS` — 동일 종목 Supabase upsert 최소 간격, 기본 15000

## 3. 엔진 실행

장시간 프로세스입니다. **Vercel이 아닌** 로컬·VPS·Docker에서 실행하세요.

```bash
cd web
npm run engine
```

## 4. 프론트 (`/volatile`)

- `VolatileStocksLive` 컴포넌트가 `high_volatility_stocks`를 조회하고 Realtime 채널을 구독합니다.
- Realtime이 안 붙으면 Supabase에서 replication 설정과 RLS `SELECT` 정책을 다시 확인하세요.

## 5. API 제한·면책

- Finnhub / KIS / J-Quants는 **각 약관·요금·지연·세션 제한**을 따릅니다. 본 코드는 연동 예시이며 투자 조언이 아닙니다.
