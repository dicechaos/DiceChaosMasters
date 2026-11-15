/**
 * Built-in Dice Chaos SVG emblem for high-face customization (e.g. D20 "20", D6 "6", D2 "2").
 * Clean closed compound vector path optimized for smooth 3D boolean engraving.
 */
export const DICE_CHAOS_EMBLEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <polygon points="50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27" fill="#000000"/>
  <polygon points="50,15 80.3,32.5 80.3,67.5 50,85 19.7,67.5 19.7,32.5" fill="#ffffff"/>
  <polygon points="50,21 58,41 79,39 62,53 71,74 50,61 29,74 38,53 21,39 42,41" fill="#000000"/>
  <circle cx="50" cy="50" r="7.5" fill="#ffffff"/>
</svg>`;

export const D20_CRIT_CROWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <polygon points="14,76 14,34 34,50 50,20 66,50 86,34 86,76" fill="#000000"/>
  <rect x="14" y="80" width="72" height="9" rx="2" fill="#000000"/>
</svg>`;

export const DEFAULT_SVG_ASSETS = [
  {
    id: 'dice-chaos-emblem',
    name: 'Dice Chaos Emblem',
    svgContent: DICE_CHAOS_EMBLEM_SVG,
    builtIn: true,
  },
  {
    id: 'crit-crown',
    name: 'Crit Crown',
    svgContent: D20_CRIT_CROWN_SVG,
    builtIn: true,
  },
];
