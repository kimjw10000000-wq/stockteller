"use client";

import { useMemo } from "react";
import { SIGNAL_LABELS, type SignalStatus } from "@/lib/signal-status";

type SignalGaugeProps = {
  status: SignalStatus;
};

/** 가로 반원 게이지 — 0°=위(주의), -90°=왼쪽(긍정), +90°=오른쪽(위험) */
const NEEDLE_ROTATE: Record<SignalStatus, number> = {
  positive: -90,
  caution: 0,
  danger: 90,
};

const CX = 140;
const CY = 132;
const R = 96;
const STROKE = 16;

/** 0°=오른쪽, 90°=위, 180°=왼쪽 (속도계·압력계 좌표계) */
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

export function SignalGauge({ status }: SignalGaugeProps) {
  const needleDeg = NEEDLE_ROTATE[status];
  const label = SIGNAL_LABELS[status];

  const zones = useMemo(
    () => [
      { d: arcPath(180, 120), color: "#22c55e", opacity: 0.95 },
      { d: arcPath(120, 60), color: "#eab308", opacity: 0.95 },
      { d: arcPath(60, 0), color: "#ef4444", opacity: 0.95 },
    ],
    []
  );

  const tickAngles = [150, 120, 90, 60, 30];

  return (
    <div className="flex w-full max-w-md flex-col items-center" aria-live="polite">
      <div className="relative w-full max-w-[320px]">
        <svg
          viewBox="0 0 280 150"
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

          {/* 바닥 베이스 라인 */}
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

          {/* 배경 트랙 — 왼쪽(초록) → 위(돔) → 오른쪽(빨강) */}
          <path
            d={arcPath(180, 0)}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE + 6}
            strokeLinecap="round"
            className="text-muted/30"
          />

          {/* 3구역 무지개 게이지 */}
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
          {tickAngles.map((deg) => {
            const outerR = R + STROKE / 2 + 4;
            const rad = (deg * Math.PI) / 180;
            const outer = {
              x: CX + outerR * Math.cos(rad),
              y: CY - outerR * Math.sin(rad),
            };
            const innerR = R - STROKE / 2 - 2;
            const innerPt = {
              x: CX + innerR * Math.cos(rad),
              y: CY - innerR * Math.sin(rad),
            };
            return (
              <line
                key={deg}
                x1={innerPt.x}
                y1={innerPt.y}
                x2={outer.x}
                y2={outer.y}
                stroke="currentColor"
                strokeWidth={deg === 90 ? 2 : 1}
                className="text-foreground/25"
              />
            );
          })}

          {/* 구역 라벨 */}
          <text x={polar(165).x} y={polar(165).y + 4} textAnchor="middle" className="fill-green-600 text-[9px] font-medium">
            긍정
          </text>
          <text x={polar(90).x} y={polar(90).y - 10} textAnchor="middle" className="fill-yellow-600 text-[9px] font-medium">
            주의
          </text>
          <text x={polar(15).x} y={polar(15).y + 4} textAnchor="middle" className="fill-red-600 text-[9px] font-medium">
            위험
          </text>

          {/* 바늘 — 기본 방향 위(0°), 좌/우로 회전 */}
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

          {/* 중앙 허브 */}
          <circle cx={CX} cy={CY} r={10} className="fill-card stroke-foreground/20" strokeWidth={2} />
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
              cy={CY - R + 14}
              r={5}
              className="fill-emerald-500/30 animate-ping"
              style={{ animationDuration: "2s" }}
            />
            <circle cx={CX} cy={CY - R + 14} r={3} className="fill-foreground/60" />
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
