/** Geometric CITIZEN-0 mark — still a 0, sharper brand mark. */
export function CitizenZeroMark({
  size = 32,
  className,
  title = "CITIZEN-0",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const id = "c0m";
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={`${id}-bg`} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#18181B" />
          <stop offset="1" stopColor="#09090B" />
        </linearGradient>
        <linearGradient id={`${id}-ring`} x1="18" y1="14" x2="46" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#E4E4E7" />
          <stop offset="1" stopColor="#A1A1AA" />
        </linearGradient>
        <linearGradient id={`${id}-glow`} x1="32" y1="10" x2="32" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A855F7" stopOpacity="0.55" />
          <stop offset="1" stopColor="#A855F7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id}-bg)`} />
      <rect
        x="2.75"
        y="2.75"
        width="58.5"
        height="58.5"
        rx="15.25"
        stroke={`url(#${id}-ring)`}
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <ellipse cx="32" cy="28" rx="18" ry="16" fill={`url(#${id}-glow)`} />
      <circle
        cx="32"
        cy="32"
        r="15.5"
        stroke={`url(#${id}-ring)`}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="8.25" stroke="#27272A" strokeWidth="3.25" />
      <path
        d="M42.5 22.5c2.8 2.6 4.5 6.3 4.5 10.5"
        stroke="#A855F7"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
