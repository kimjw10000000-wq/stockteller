"use client";

import { useMemo } from "react";
import {
  SIGNAL_LABELS,
  SIGNAL_NEEDLE_DEG,
  type SignalStatus,
} from "@/lib/signal-status";

type SignalGaugeProps = {
  status: SignalStatus;
};

const CX = 120;
const CY = 118;
const R = 88;
const STROKE = 18;

function arcPath(startDeg: number, endDeg: number): string {
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = CX + R * Math.cos(toRad(startDeg));
  const y1 = CY + R * Math.sin(toRad(startDeg));
  const x2 = CX + R * Math.cos(toRad(endDeg));
  const y2 = CY + R * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
}

export function SignalGauge({ status }: SignalGaugeProps) {
  const needleDeg = SIGNAL_NEEDLE_DEG[status];
  const label = SIGNAL_LABELS[status];

  const zones = useMemo(
    () => [
      { d: arcPath(180, 240), color: "#22c55e", opacity: 0.95 },
      { d: arcPath(240, 300), color: "#eab308", opacity: 0.95 },
      { d: arcPath(300, 360), color: "#ef4444", opacity: 0.95 },
    ],
    []
  );

  return (
    <div className="flex w-full max-w-sm flex-col items-center" aria-live="polite">
      <div className="relative w-full max-w-[280px]">
        <svg
          viewBox="0 0 240 150"
          className="h-auto w-full drop-shadow-sm"
          role="img"
          aria-label={`공시·뉴스 시그널: ${label}`}
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

          {/* 배경 트랙 */}
          <path
            d={arcPath(180, 360)}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE + 6}
            strokeLinecap="round"
            className="text-muted/30"
          />

          {/* 3구역 게이지 */}
          {zones.map((z, i) => (
            <path
              key={i}
              d={z.d}
              fill="none"
              stroke={z.color}
              strokeWidth={STROKE}
              strokeLinecap="butt"
              opacity={z.opacity}
            />
          ))}

          {/* 눈금 */}
          {[210, 240, 270, 300, 330].map((deg) => {
            const rad = ((deg - 90) * Math.PI) / 180;
            const inner = R - STROKE / 2 - 4;
            const outer = R + STROKE / 2 + 2;
            return (
              <line
                key={deg}
                x1={CX + inner * Math.cos(rad)}
                y1={CY + inner * Math.sin(rad)}
                x2={CX + outer * Math.cos(rad)}
                y2={CY + outer * Math.sin(rad)}
                stroke="currentColor"
                strokeWidth={deg === 270 ? 2 : 1}
                className="text-foreground/25"
              />
            );
          })}

          {/* 바늘 — CSS transition으로 스르륵 회전 */}
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
              y2={CY - R + 14}
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              className="text-foreground"
            />
            <polygon
              points={`${CX},${CY - R + 8} ${CX - 5},${CY - R + 22} ${CX + 5},${CY - R + 22}`}
              className="fill-foreground"
            />
          </g>

          {/* 중앙 허브 */}
          <circle cx={CX} cy={CY} r={9} className="fill-card stroke-foreground/20" strokeWidth={2} />
          <circle cx={CX} cy={CY} r={4} className="fill-foreground/80" />

          {/* 바늘 끝 ping */}
          <g
            style={{
              transform: `rotate(${needleDeg}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: "transform 700ms cubic-bezier(0.34, 1.2, 0.64, 1)",
            }}
          >
            <circle
              cx={CX}
              cy={CY - R + 12}
              r={5}
              className="fill-emerald-500/30 animate-ping"
              style={{ animationDuration: "2s" }}
            />
            <circle cx={CX} cy={CY - R + 12} r={3} className="fill-foreground/60" />
          </g>
        </svg>
      </div>

      <p className="mt-1 text-center text-sm font-semibold tracking-tight text-foreground">
        공시·뉴스 시그널
      </p>
      <p className="text-center text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
