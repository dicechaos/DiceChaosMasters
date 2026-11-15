import type { CaliperMetrics, DiceProjectState, DieKind } from '../../types/dice';
import { DIE_DISPLAY_NAMES } from '../presets';

export interface DieSpecRow {
  kind: DieKind;
  variantLabel: string;
  calipers: CaliperMetrics;
  hasBreach: boolean;
}

export function generateCaliperSpecSheet(
  project: DiceProjectState,
  fontDisplayName: string,
  rows: DieSpecRow[],
): string {
  const lines: string[] = [
    `# ${project.setName} — Master & Matched Insert Blank Caliper Specs`,
    ``,
    `Generated with **Dice Chaos Masters** (free community studio by https://dicechaos.com/)`,
    ``,
    `## Global Set Parameters`,
    `- **Font:** ${fontDisplayName}`,
    `- **Engraving Depth:** ${project.typography.engravingDepthMm.toFixed(2)} mm`,
    `- **Anti-Tear Draft Angle:** ${project.typography.draftAngleDeg.toFixed(1)} deg`,
    `- **Default Blank Clearance:** ${project.blanks.clearanceMm.toFixed(2)} mm (per-side)`,
    `- **Blank Bubble-Relief Bevel:** ${project.blanks.bubbleBevelMm.toFixed(2)} mm`,
    `- **Resin Shrinkage Compensation:** +${project.exportConfig.shrinkageCompensationPct.toFixed(2)}%`,
    `- **Print Pre-Supports Included:** ${project.supports.enabled ? `Yes (Point-Down=${project.supports.pointDown}, Contact=${project.supports.bumperContactWidthMm.toFixed(2)}mm)` : 'No (Clean Slicer-Ready Meshes)'}`,
    ``,
    `## Matched Insert Blank Formula`,
    `\`\`\``,
    `Blank F2F = Master F2F - 2 * (EngravingDepth + Clearance)`,
    `\`\`\``,
    ``,
    `## Caliper Reference Table (mm)`,
    `| Die | Shape Variant | Master F2F (CAD) | Master Height | Blank F2F (CAD) | Blank Height | Clearance | Slicer Master F2F | Slicer Blank F2F | Status |`,
    `| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |`,
  ];

  for (const row of rows) {
    const c = row.calipers;
    const status = row.hasBreach ? 'WARNING: Check clearance' : 'Matched OK';
    lines.push(
      `| ${DIE_DISPLAY_NAMES[row.kind]} | ${row.variantLabel} | ${c.masterFaceToFaceMm.toFixed(2)} | ${c.masterHeightMm.toFixed(2)} | ${c.blankFaceToFaceMm.toFixed(2)} | ${c.blankHeightMm.toFixed(2)} | ${c.effectiveClearanceMm.toFixed(2)} | ${c.masterSlicerF2FMm.toFixed(2)} | ${c.blankSlicerF2FMm.toFixed(2)} | ${status} |`,
    );
  }

  lines.push(
    ``,
    `## Mold & Casting Notes`,
    `1. Verify post-cure physical resin dimensions using digital calipers against the **Master F2F (CAD)** column before pouring silicone.`,
    `2. Always print matched insert blanks on the same printer and resin batch as your numbered masters so dimensional shrinkage matches.`,
    `3. Pour a drop of clear resin into the mold before inserting the cured blank to lubricate seating against the raised silicone numbers.`,
  );

  return lines.join('\n');
}
