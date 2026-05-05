"use client";

import { useEffect, useRef, useState } from "react";

export interface WheelSegment {
  label: string;
  subLabel?: string;
  color: string;
  glowColor: string;
  emoji: string;
}

interface SpinWheelProps {
  segments: WheelSegment[];
  /** Cumulative rotation in degrees (controlled externally) */
  targetRotation: number;
  isSpinning: boolean;
  onSpinEnd?: () => void;
  size?: number;
}

export function SpinWheel({
  segments,
  targetRotation,
  isSpinning,
  onSpinEnd,
  size = 340,
}: SpinWheelProps) {
  const numSegments = segments.length;
  const segAngle = 360 / numSegments;
  const radius = size / 2;
  const center = radius;

  // Track current display rotation for animation
  const [displayRotation, setDisplayRotation] = useState(0);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const startRotRef = useRef(0);
  const SPIN_DURATION_MS = 3500;

  useEffect(() => {
    if (!isSpinning) return;

    startRotRef.current = displayRotation;
    startTimeRef.current = null;

    const totalDelta = targetRotation - startRotRef.current;

    const animate = (now: number) => {
      if (!startTimeRef.current) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const t = Math.min(elapsed / SPIN_DURATION_MS, 1);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplayRotation(startRotRef.current + totalDelta * eased);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayRotation(startRotRef.current + totalDelta);
        onSpinEnd?.();
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpinning, targetRotation]);

  // Build SVG path for each segment
  const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
  };

  const innerRadius = radius * 0.3;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>

      {/* Outer glow ring */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: -6,
          background: "transparent",
          boxShadow: "0 0 40px 8px rgba(0,240,255,0.25), 0 0 80px 16px rgba(255,0,127,0.15)",
          borderRadius: "50%",
        }}
      />

      {/* Wheel SVG */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: `rotate(${displayRotation}deg)`, transition: "none" }}
      >
        <defs>
          {segments.map((seg, i) => (
            <radialGradient key={`grad-${i}`} id={`seg-grad-${i}`} cx="30%" cy="30%" r="80%">
              <stop offset="0%" stopColor={seg.color} stopOpacity="1" />
              <stop offset="100%" stopColor={seg.color} stopOpacity="0.7" />
            </radialGradient>
          ))}
          <filter id="seg-glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Segments */}
        {segments.map((seg, i) => {
          const startAngle = i * segAngle;
          const endAngle = startAngle + segAngle;
          const midAngle = startAngle + segAngle / 2;
          const midRad = ((midAngle - 90) * Math.PI) / 180;
          const labelR = radius * 0.65;
          const emojiR = radius * 0.52;
          const lx = center + labelR * Math.cos(midRad);
          const ly = center + labelR * Math.sin(midRad);
          const ex = center + emojiR * Math.cos(midRad);
          const ey = center + emojiR * Math.sin(midRad);
          const textRotation = midAngle;

          return (
            <g key={i}>
              {/* Segment fill */}
              <path
                d={describeArc(center, center, radius - 4, startAngle, endAngle)}
                fill={`url(#seg-grad-${i})`}
                stroke="rgba(0,0,0,0.6)"
                strokeWidth="2"
              />
              {/* Segment inner arc separator */}
              <path
                d={describeArc(center, center, innerRadius + 2, startAngle, endAngle)}
                fill="rgba(0,0,0,0)"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="1"
              />

              {/* Emoji */}
              <text
                x={ex}
                y={ey}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={radius * 0.11}
                transform={`rotate(${textRotation}, ${ex}, ${ey})`}
              >
                {seg.emoji}
              </text>

              {/* Label */}
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={radius * 0.075}
                fontWeight="900"
                fill="white"
                filter="url(#seg-glow)"
                transform={`rotate(${textRotation}, ${lx}, ${ly})`}
                style={{ fontFamily: "system-ui, sans-serif", letterSpacing: "0.02em" }}
              >
                {seg.label}
              </text>
              {seg.subLabel && (
                <text
                  x={lx}
                  y={ly + radius * 0.09}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={radius * 0.06}
                  fontWeight="700"
                  fill="rgba(255,255,255,0.75)"
                  transform={`rotate(${textRotation}, ${lx}, ${ly + radius * 0.09})`}
                  style={{ fontFamily: "system-ui, sans-serif" }}
                >
                  {seg.subLabel}
                </text>
              )}
            </g>
          );
        })}

        {/* Divider lines */}
        {segments.map((_, i) => {
          const angle = i * segAngle;
          const rad = ((angle - 90) * Math.PI) / 180;
          const x2 = center + (radius - 4) * Math.cos(rad);
          const y2 = center + (radius - 4) * Math.sin(rad);
          const xi = center + innerRadius * Math.cos(rad);
          const yi = center + innerRadius * Math.sin(rad);
          return (
            <line
              key={`line-${i}`}
              x1={xi}
              y1={yi}
              x2={x2}
              y2={y2}
              stroke="rgba(0,0,0,0.5)"
              strokeWidth="2"
            />
          );
        })}

        {/* Outer rim */}
        <circle
          cx={center}
          cy={center}
          r={radius - 2}
          fill="none"
          stroke="rgba(0,240,255,0.5)"
          strokeWidth="3"
        />
        <circle
          cx={center}
          cy={center}
          r={radius - 6}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />

        {/* Inner hub */}
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill="rgba(6,3,15,0.95)"
          stroke="rgba(0,240,255,0.6)"
          strokeWidth="3"
        />
        <circle cx={center} cy={center} r={8} fill="rgba(0,240,255,0.9)" />
        <circle cx={center} cy={center} r={4} fill="white" />
      </svg>

      {/* Pointer arrow (fixed, doesn't rotate) */}
      <div
        className="absolute pointer-events-none"
        style={{ top: -14, left: "50%", transform: "translateX(-50%)" }}
      >
        <svg width="28" height="36" viewBox="0 0 28 36">
          <defs>
            <filter id="ptr-glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <polygon
            points="14,34 2,4 26,4"
            fill="#00f0ff"
            stroke="white"
            strokeWidth="2"
            strokeLinejoin="round"
            filter="url(#ptr-glow)"
          />
          <circle cx="14" cy="4" r="4" fill="white" />
        </svg>
      </div>
    </div>
  );
}
