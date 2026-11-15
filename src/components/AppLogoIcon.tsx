interface AppLogoIconProps {
  size?: number;
  className?: string;
}

/**
 * Vector twin of the Dice Chaos Masters sibling icon:
 * Midnight-Sapphire squircle + multi-neon faceted D20 + nested Insert Blank core + hero "20".
 */
export function AppLogoIcon({ size = 32, className }: AppLogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="dcm-hdr-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14234a" />
          <stop offset="60%" stopColor="#090e1f" />
          <stop offset="100%" stopColor="#040711" />
        </linearGradient>
        <linearGradient id="dcm-hdr-rim" x1="12" y1="8" x2="52" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="30%" stopColor="#a78bfa" />
          <stop offset="56%" stopColor="#f472b6" />
          <stop offset="80%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#dcm-hdr-bg)" />
      <rect
        x="2.75"
        y="2.75"
        width="58.5"
        height="58.5"
        rx="13.25"
        stroke="#38bdf8"
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />

      {/* MSLA Raft Bar */}
      <line x1="32" y1="49" x2="32" y2="53.5" stroke="#38bdf8" strokeWidth="1.4" strokeLinecap="round" />
      <polygon points="18,53.5 46,53.5 48,56 16,56" fill="#38bdf8" fillOpacity="0.88" />

      {/* Outer Multi-Neon D20 */}
      <polygon
        points="32,9.5 51.5,20.7 51.5,43.3 32,54.5 12.5,43.3 12.5,20.7"
        fill="#101f44"
        fillOpacity="0.92"
        stroke="url(#dcm-hdr-rim)"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />

      {/* Nested Blank Core */}
      <polygon
        points="32,16 45.8,24 45.8,40 32,48 18.2,40 18.2,24"
        fill="none"
        stroke="#22d3ee"
        strokeOpacity="0.45"
        strokeWidth="0.9"
        strokeDasharray="2.5 2"
      />

      {/* Interior Crown Facets */}
      <polygon
        points="32,19 42.8,37.8 21.2,37.8"
        fill="#1c3568"
        stroke="#fbbf24"
        strokeOpacity="0.92"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <line x1="32" y1="9.5" x2="32" y2="19" stroke="#38bdf8" strokeWidth="1.2" />
      <line x1="51.5" y1="20.7" x2="32" y2="19" stroke="#a78bfa" strokeWidth="1.1" />
      <line x1="51.5" y1="43.3" x2="42.8" y2="37.8" stroke="#f472b6" strokeWidth="1.1" />
      <line x1="32" y1="54.5" x2="42.8" y2="37.8" stroke="#fbbf24" strokeWidth="1.1" />
      <line x1="12.5" y1="43.3" x2="21.2" y2="37.8" stroke="#34d399" strokeWidth="1.1" />
      <line x1="12.5" y1="20.7" x2="32" y2="19" stroke="#38bdf8" strokeWidth="1.2" />

      <text
        x="32"
        y="34.2"
        textAnchor="middle"
        fill="#f8fafc"
        fontSize="10.2"
        fontWeight="900"
        fontFamily="Segoe UI, Inter, sans-serif"
      >
        20
      </text>
    </svg>
  );
}
