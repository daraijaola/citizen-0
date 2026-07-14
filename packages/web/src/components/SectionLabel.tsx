export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="c0-eyebrow">
      {children}
      <svg
        className="c0-eyebrow-line"
        viewBox="0 0 120 8"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M2 6 C30 2, 50 7, 80 3 S110 5, 118 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}