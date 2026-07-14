"use client";

import { useEffect, useState } from "react";

export function SplitText({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span
          key={`${w}-${i}`}
          style={{
            display: "inline-block",
            marginRight: "0.22em",
            opacity: on ? 1 : 0,
            transform: on ? "translateY(0)" : "translateY(1.1em)",
            transition: `opacity 0.55s ease ${delay + i * 0.06}s, transform 0.55s cubic-bezier(.16,1,.3,1) ${delay + i * 0.06}s`,
          }}
        >
          {w}
        </span>
      ))}
    </span>
  );
}