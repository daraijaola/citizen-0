"use client";

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <svg className="c0-spark" viewBox="0 0 200 50" preserveAspectRatio="none" aria-hidden>
        <path
          d="M0 40 C40 38,80 35,120 28 C150 22,175 15,200 10"
          fill="none"
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 200;
      const y = 45 - ((v - min) / range) * 35;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="c0-spark" viewBox="0 0 200 50" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M0 50 L${pts.replace(/ /g, " L")} L200 50 Z`} fill="url(#sparkFill)" />
      <polyline
        points={pts}
        fill="none"
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}