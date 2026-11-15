import type { Font } from 'opentype.js';
import type {
  DiceProjectState,
  DieKind,
  DieSettings,
  ExportFileEntry,
} from '../../types/dice';
import { generateExportManifold } from '../generator';
import { DIE_ORDER } from '../presets';
import { generateCaliperSpecSheet, type DieSpecRow } from './specSheetGenerator';
import { encodeBinaryStl } from './stlExporter';
import { encodeThreeMf } from './threeMfExporter';

export function formatDieVariantLabel(settings: DieSettings): string {
  switch (settings.kind) {
    case 'd3':
      return settings.d3Variant === 'truncated_barrel' ? 'Truncated Barrel' : 'Rounded Prism';
    case 'd4':
      switch (settings.d4Variant) {
        case 'classic_vertex':
          return 'Classic Vertex-Read';
        case 'classic_base':
          return 'Classic Base-Read';
        case 'crystal':
          return 'Crystal Shard';
        case 'arch':
          return 'Arch / Barrel';
        case 'pendulum':
          return 'Pendulum / Teardrop';
        case 'truncated':
          return 'Truncated Tetrahedron';
      }
      break;
    case 'd10':
      return settings.d10Numbering === '1_10' ? 'Standard (1-10)' : 'Standard (0-9)';
    case 'd00':
      return settings.d00Orientation === 'vertical' ? 'Percentile Vertical' : 'Percentile Horizontal';
    case 'd20':
      return settings.d20Numbering === 'spindown' ? 'Spindown Counter' : 'Balanced RPG';
    default:
      return 'Standard';
  }
}

function sanitizeSlug(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'DiceChaos';
}

export interface BatchProgressInfo {
  currentStep: number;
  totalSteps: number;
  label: string;
}

export async function buildBatchExportFiles(
  project: DiceProjectState,
  font: Font,
  fontDisplayName: string,
  onProgress?: (info: BatchProgressInfo) => void,
): Promise<{ files: ExportFileEntry[]; specMarkdown: string; breachedDice: DieKind[] }> {
  const enabledDice = DIE_ORDER.filter((k) => project.dice[k].enabled);
  const modesPerDie = project.blanks.includeBlanksOnExport ? 2 : 1;
  const totalSteps = enabledDice.length * modesPerDie + 1;
  let currentStep = 0;

  const slug = sanitizeSlug(project.setName);
  const files: ExportFileEntry[] = [];
  const specRows: DieSpecRow[] = [];
  const breachedDice: DieKind[] = [];

  for (const kind of enabledDice) {
    const settings = project.dice[kind];
    const variantSuffix =
      kind === 'd4'
        ? `_${settings.d4Variant}`
        : kind === 'd3'
          ? `_${settings.d3Variant}`
          : '';
    const diePrefix = `${slug}_${kind.toUpperCase()}${variantSuffix}`;

    currentStep++;
    onProgress?.({
      currentStep,
      totalSteps,
      label: `Building ${kind.toUpperCase()} Master (${settings.sizeMm.toFixed(1)} mm)...`,
    });

    const masterRes = await generateExportManifold(kind, project, font, 'master');

    if (project.exportConfig.exportStl) {
      files.push({
        relativePath: `Masters/${diePrefix}_Master.stl`,
        bytes: encodeBinaryStl(masterRes.mesh, `${diePrefix} Master`),
      });
    }
    if (project.exportConfig.export3mf) {
      files.push({
        relativePath: `Masters/${diePrefix}_Master.3mf`,
        bytes: await encodeThreeMf(masterRes.mesh, `${diePrefix}_Master`),
      });
    }

    let hasBreach = false;
    if (project.blanks.includeBlanksOnExport) {
      currentStep++;
      onProgress?.({
        currentStep,
        totalSteps,
        label: `Building ${kind.toUpperCase()} Matched Blank...`,
      });

      const blankRes = await generateExportManifold(kind, project, font, 'blank');
      hasBreach = blankRes.breach.hasBreach;
      if (hasBreach) breachedDice.push(kind);

      if (project.exportConfig.exportStl) {
        files.push({
          relativePath: `Blanks/${diePrefix}_Blank.stl`,
          bytes: encodeBinaryStl(blankRes.mesh, `${diePrefix} Matched Blank`),
        });
      }
      if (project.exportConfig.export3mf) {
        files.push({
          relativePath: `Blanks/${diePrefix}_Blank.3mf`,
          bytes: await encodeThreeMf(blankRes.mesh, `${diePrefix}_Blank`),
        });
      }
    }

    specRows.push({
      kind,
      variantLabel: formatDieVariantLabel(settings),
      calipers: masterRes.calipers,
      hasBreach,
    });
  }

  currentStep++;
  onProgress?.({
    currentStep,
    totalSteps,
    label: 'Writing Caliper Specs & packaging...',
  });

  const specMarkdown = generateCaliperSpecSheet(project, fontDisplayName, specRows);
  if (project.exportConfig.exportSpecSheet) {
    files.push({
      relativePath: 'Caliper_Specs.md',
      bytes: new TextEncoder().encode(specMarkdown),
    });
  }

  return { files, specMarkdown, breachedDice };
}
