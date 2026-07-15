"use client";

import { useMemo } from "react";
import {
  SIGNAL_LABELS,
  SIGNAL_NEEDLE_ROTATE,
  SIGNAL_SHORT_LABELS,
  type SignalStatus,
} from "@/lib/signal-status";

type SignalGaugeProps = {
  status: SignalStatus;
};

const CX = 140;
const CY = 132;
const R = 96;
const STROKE = 14;

function polar(deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad) };
}

function arcPath(startDeg: number, endDeg: number): string {
  const start = polar(startDeg);
  const end = polar(endDeg);
  const large = Math.abs(startDeg - endDeg) > 180 ? 1 : 0;
  const sweep = startDeg > endDeg ? 1 : 0;
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${large} ${sweep} ${end.x} ${end.y}`;
}

const ZONE_DEFS: { start: number; end: number; color: string; key: SignalStatus }[] = [
  { start: 180, end: 135, color: "#22c55e", key: "positive" },
  { start: 135, end: 90, color: "#e2e8f0", key: "neutral" },
  { start: 90, end: 45, color: "#eab308", key: "caution" },
  { start: 45, end: 0, color: "#ef4444", key: "danger" },
];

const TICK_ANGLES = [157.5, 112.5, 67.5, 22.5];

export function SignalGauge({ status }: SignalGaugeProps) {
  const needleDeg = SIGNAL_NEEDLE_ROTATE[status];
  const label = SIGNAL_LABELS[status];

  const zones = useMemo(
    () => ZONE_DEFS.map((z) => ({ d: arcPath(z.start, z.end), ...z })),
    []
  );

  return (
    <div className="flex w-full max-w-lg flex-col items-center" aria-live="polite">
      <div className="relative w-full max-w-[340px]">
        {/* 실시간 스트리밍형 LIVE 배지 — 계기판 상단 우측 */}
        <div
          className="absolute right-0 top-0 z-10 flex items-center gap-1.5 rounded-md bg-white/90 px-2 py-1 shadow-sm ring-1 ring-black/5"
          aria-label="실시간"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 animate-pulse rounded-full bg-green-500" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-green-700">
            LIVE
          </span>
        </div>

        <svg
          viewBox="0 0 280 165"
          className="h-auto w-full drop-shadow-sm"
          role="img"
          aria-label={`실시간 시그널: ${label}`}
        >
          <defs>
            <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <line
            x1={CX - R - 8}
            y1={CY + 2}
            x2={CX + R + 8}
            y2={CY + 2}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="text-muted/40"
          />

          <path
            d={arcPath(180, 0)}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE + 6}
            strokeLinecap="round"
            className="text-muted/30"
          />

          {zones.map((z, i) => (
            <path
              key={i}
              d={z.d}
              fill="none"
              stroke={z.color}
              strokeWidth={STROKE}
              strokeLinecap="butt"
              opacity={z.color === "#e2e8f0" ? 1 : 0.95}
            />
          ))}

          {TICK_ANGLES.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const innerR = R - STROKE / 2 - 2;
            const outerR = R + STROKE / 2 + 4;
            return (
              <line
                key={deg}
                x1={CX + innerR * Math.cos(rad)}
                y1={CY - innerR * Math.sin(rad)}
                x2={CX + outerR * Math.cos(rad)}
                y2={CY - outerR * Math.sin(rad)}
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-foreground/25"
              />
            );
          })}

          {zones.map((z) => {
            const mid = (z.start + z.end) / 2;
            const pt = polar(mid);
            const text = SIGNAL_SHORT_LABELS[z.key];
            return (
              <g key={z.key}>
                <rect
                  x={pt.x - 18}
                  y={pt.y + (mid > 90 ? -2 : -14)}
                  width={36}
                  height={14}
                  rx={3}
                  fill="white"
                  fillOpacity={0.92}
                />
                <text
                  x={pt.x}
                  y={pt.y + (mid > 90 ? 9 : -3)}
                  textAnchor="middle"
                  fill="#000000"
                  fontSize={10}
                  fontWeight={700}
                >
                  {text}
                </text>
              </g>
            );
          })}

          <g
            style={{
              transform: `rotate(${needleDeg}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: "transform 700ms cubic-bezier(0.34, 1.2, 0.64, 1)",
            }}
            filter="url(#gauge-glow)"
          >
            <line
              x1={CX}
              y1={CY}
              x2={CX}
              y2={CY - R + 18}
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              className="text-foreground"
            />
            <polygon
              points={`${CX},${CY - R + 10} ${CX - 5},${CY - R + 24} ${CX + 5},${CY - R + 24}`}
              className="fill-foreground"
            />
          </g>

          <circle cx={CX} cy={CY} r={10} className="fill-card stroke-foreground/20" strokeWidth={2} />
          <circle cx={CX} cy={CY} r={4} className="fill-foreground/80" />

          <g
            style={{
              transform: `rotate(${needleDeg}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: "transform 700ms cubic-bezier(0.34, 1.2, 0.64, 1)",
            }}
          >
            <circle
              cx={CX}
              cy={CY - R + 14}
              r={5}
              className="fill-sky-500/30 animate-ping"
              style={{ animationDuration: "2s" }}
            />
            <circle cx={CX} cy={CY - R + 14} r={3} className="fill-foreground/60" />
          </g>
        </svg>
      </div>

      <p className="mt-1 text-center text-sm font-semibold tracking-tight text-foreground">
        실시간 시그널
      </p>
      <p className="text-center text-sm font-medium text-foreground">{label}</p>
      <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        본 계기판은 현재 주가, 차트, 뉴스 등을 종합적으로 판단하여 실시간으로 표시됩니다.
      </p>
      <p className="mt-2 max-w-md text-center text-xs leading-relaxed text-muted-foreground">
        * 본 알고리즘 시그널은 데이터 수집 및 연산 환경에 따라 수 분의 지연이 발생할 수 있습니다.
      </p>
    </div>
  );
}
