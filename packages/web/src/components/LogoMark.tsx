type Props = {
  size?: number;
  className?: string;
  title?: string;
};

export function LogoMark({ size = 32, className, title = "CITIZEN-0" }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect x="4" y="4" width="56" height="56" rx="15" fill="currentColor" />
      <rect
        x="5.5"
        y="5.5"
        width="53"
        height="53"
        rx="13.5"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="1.25"
        strokeDasharray="5 4"
      />
      <circle
        cx="32"
        cy="32"
        r="17.25"
        fill="none"
        stroke="var(--logo-ring, #fafafa)"
        strokeWidth="5.25"
        strokeLinecap="round"
      />
      <circle
        cx="32"
        cy="32"
        r="9.25"
        fill="none"
        stroke="var(--logo-ring, #fafafa)"
        strokeOpacity="0.28"
        strokeWidth="2"
      />
      <path
        d="M32 13.5v5.5"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <circle cx="47" cy="17" r="3" fill="var(--logo-ring, #fafafa)" />
    </svg>
  );
}