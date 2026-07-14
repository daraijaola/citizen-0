"use client";

type Item = { label: string; href?: string };

export function MarqueeStrip({ items, reverse }: { items: Item[]; reverse?: boolean }) {
  const row = [...items, ...items];
  return (
    <div className="c0-marquee-track">
      <div className={`c0-marquee-scroll${reverse ? " c0-marquee-scroll--rev" : ""}`}>
        {row.map((item, i) => (
          <span key={`${item.label}-${i}`} className="c0-marquee-pill">
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}