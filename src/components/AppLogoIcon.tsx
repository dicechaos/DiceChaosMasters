import { useId } from 'react';

interface AppLogoIconProps {
  size?: number;
  className?: string;
}

/**
 * Vector twin of the Dice Chaos Masters sibling icon:
 * Midnight-Sapphire squircle + MSLA support raft + 2/3 printed multi-neon faceted D20
 * + nested Insert Blank core + active cure scanline + top 1/3 dashed CAD wireframe.
 */
export function AppLogoIcon({ size = 32, className }: AppLogoIconProps) {
  const uid = useId().replace(/:/g, '');
  const bgId = `dcm-hdr-${uid}-bg`;
  const rimId = `dcm-hdr-${uid}-rim`;
  const cureId = `dcm-hdr-${uid}-cure`;
  const wireId = `dcm-hdr-${uid}-wire`;
  const solidId = `dcm-hdr-${uid}-solid`;

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
        <linearGradient id={bgId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14234a" />
          <stop offset="60%" stopColor="#090e1f" />
          <stop offset="100%" stopColor="#040711" />
        </linearGradient>
        <linearGradient id={rimId} x1="12" y1="8" x2="52" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="30%" stopColor="#a78bfa" />
          <stop offset="56%" stopColor="#f472b6" />
          <stop offset="80%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
        <linearGradient id={cureId} x1="12.75" y1="23.5" x2="51.25" y2="23.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="38%" stopColor="#e0f2fe" />
          <stop offset="50%" stopColor="#f8fafc" />
          <stop offset="68%" stopColor="#e879f9" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <clipPath id={wireId}>
          <rect x="0" y="0" width="64" height="23.5" />
        </clipPath>
        <clipPath id={solidId}>
          <rect x="0" y="23.5" width="64" height="40.5" />
        </clipPath>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="14" fill={`url(#${bgId})`} />
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

      {/* MSLA Raft & Micro Struts */}
      <line x1="32" y1="50.75" x2="32" y2="53.75" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" />
      <line
        x1="26.25"
        y1="47.75"
        x2="24.5"
        y2="53.75"
        stroke="#38bdf8"
        strokeOpacity="0.7"
        strokeWidth="0.95"
        strokeLinecap="round"
      />
      <line
        x1="37.75"
        y1="47.75"
        x2="39.5"
        y2="53.75"
        stroke="#38bdf8"
        strokeOpacity="0.7"
        strokeWidth="0.95"
        strokeLinecap="round"
      />
      <polygon points="19.25,53.75 44.75,53.75 46.75,55.75 17.25,55.75" fill="#38bdf8" fillOpacity="0.9" />

      {/* Top 1/3: Unprinted Dashed CAD Wireframe */}
      <g clipPath={`url(#${wireId})`}>
        <polygon
          points="32,9.75 49.75,20 49.75,40.5 32,50.75 14.25,40.5 14.25,20"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="1.35"
          strokeDasharray="2.4 1.8"
          strokeOpacity="0.72"
          strokeLinejoin="round"
        />
        <polygon
          points="32,20 41.53,36.5 22.47,36.5"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="0.95"
          strokeDasharray="2 1.6"
          strokeOpacity="0.55"
          strokeLinejoin="round"
        />
        <line
          x1="32"
          y1="9.75"
          x2="32"
          y2="20"
          stroke="#38bdf8"
          strokeWidth="0.95"
          strokeDasharray="2 1.6"
          strokeOpacity="0.55"
        />
        <line
          x1="49.75"
          y1="20"
          x2="32"
          y2="20"
          stroke="#a78bfa"
          strokeWidth="0.95"
          strokeDasharray="2 1.6"
          strokeOpacity="0.55"
        />
        <line
          x1="49.75"
          y1="20"
          x2="41.53"
          y2="36.5"
          stroke="#a78bfa"
          strokeWidth="0.95"
          strokeDasharray="2 1.6"
          strokeOpacity="0.55"
        />
        <line
          x1="14.25"
          y1="20"
          x2="32"
          y2="20"
          stroke="#38bdf8"
          strokeWidth="0.95"
          strokeDasharray="2 1.6"
          strokeOpacity="0.55"
        />
        <line
          x1="14.25"
          y1="20"
          x2="22.47"
          y2="36.5"
          stroke="#38bdf8"
          strokeWidth="0.95"
          strokeDasharray="2 1.6"
          strokeOpacity="0.55"
        />
      </g>

      {/* Bottom 2/3: Solid Printed Master */}
      <g clipPath={`url(#${solidId})`}>
        <polygon points="32,9.75 49.75,20 49.75,40.5 32,50.75 14.25,40.5 14.25,20" fill="#102046" />
        <polygon points="32,20 41.53,36.5 22.47,36.5" fill="#1f3f77" />

        {/* Nested Blank Core */}
        <polygon
          points="32,15.5 44.77,22.88 44.77,37.63 32,45 19.23,37.63 19.23,22.88"
          fill="none"
          stroke="#22d3ee"
          strokeOpacity="0.55"
          strokeWidth="0.9"
          strokeDasharray="2.4 1.8"
        />

        {/* Interior Multi-Neon Ridges */}
        <line x1="49.75" y1="20" x2="41.53" y2="36.5" stroke="#a78bfa" strokeWidth="1.05" />
        <line x1="49.75" y1="40.5" x2="41.53" y2="36.5" stroke="#f472b6" strokeWidth="1.05" />
        <line x1="32" y1="50.75" x2="41.53" y2="36.5" stroke="#f472b6" strokeWidth="1.05" />
        <line x1="32" y1="50.75" x2="22.47" y2="36.5" stroke="#fbbf24" strokeWidth="1.05" />
        <line x1="14.25" y1="40.5" x2="22.47" y2="36.5" stroke="#34d399" strokeWidth="1.05" />
        <line x1="14.25" y1="20" x2="22.47" y2="36.5" stroke="#34d399" strokeWidth="1.05" />

        {/* Center Crown Triangle */}
        <polygon
          points="32,20 41.53,36.5 22.47,36.5"
          fill="none"
          stroke="#fbbf24"
          strokeOpacity="0.92"
          strokeWidth="1.15"
          strokeLinejoin="round"
        />

        {/* Outer Multi-Neon Rim */}
        <polygon
          points="32,9.75 49.75,20 49.75,40.5 32,50.75 14.25,40.5 14.25,20"
          fill="none"
          stroke={`url(#${rimId})`}
          strokeWidth="2.05"
          strokeLinejoin="round"
        />
      </g>

      {/* Active 2/3 Cure Scanline */}
      <line
        x1="12.75"
        y1="23.5"
        x2="51.25"
        y2="23.5"
        stroke={`url(#${cureId})`}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <line x1="14.25" y1="23.5" x2="49.75" y2="23.5" stroke="#f8fafc" strokeWidth="0.9" strokeLinecap="round" />
      <circle cx="14.25" cy="23.5" r="1.2" fill="#f8fafc" />
      <circle cx="49.75" cy="23.5" r="1.2" fill="#f8fafc" />
    </svg>
  );
}
