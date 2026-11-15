import type { Font } from 'opentype.js';
import type {
  DiceProjectState,
  DieSettings,
  ExportFileEntry,
} from '../../types/dice';
import { generateExportManifold, resolveDieTypography } from '../generator';
import {
  getDieInstanceLabel,
  getDieInstanceShortTag,
  getProjectDieOrder,
} from '../presets';
import { generateCaliperSpecSheet, type DieSpecRow } from './specSheetGenerator';
import { encodeBinaryStl } from './stlExporter';
import { encodeThreeMf } from './threeMfExporter';

export function formatDieVariantLabel(settings: DieSettings): string {
  switch (settings.kind) {
    case 'd2':
      switch (settings.d2Variant) {
        case 'oval':
          return 'Oval Coin';
        case 'rounded_square':
          return 'Rounded Square';
        case 'hexagon':
          return 'Hex Medallion';
        case 'octagon':
          return 'Octagon Coin';
        case 'shield':
          return 'Shield Crest';
        default:
          return 'Round Coin';
      }
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
    case 'd5':
    case 'd7':
    case 'd9':
      if (settings.oddVariant === 'crystal') return 'Crystal Barrel (2x)';
      if (settings.oddVariant === 'prism') return 'Zocchi Prism';
      return 'Trapezohedron (2x)';
    case 'd6':
      switch (settings.d6Variant) {
        case 'rhombic':
          return 'Rhombic Diamond';
        case 'truncated':
          return 'Truncated Cube';
        case 'crystal':
          return 'Crystal Barrel';
        default:
          return 'Standard Cube';
      }
    case 'd8':
      switch (settings.d8Variant) {
        case 'shard':
          return 'Gem Shard';
        case 'crystal':
          return 'Crystal Barrel';
        default:
          return 'Standard Octahedron';
      }
    case 'd10': {
      const range = settings.d10Numbering === '1_10' ? '1-10' : '0-9';
      return settings.d10Variant === 'crystal' ? `Crystal (${range})` : `Standard (${range})`;
    }
    case 'd00': {
      const orient = settings.d00Orientation === 'vertical' ? 'Vertical' : 'Horizontal';
      return settings.d10Variant === 'crystal' ? `Crystal ${orient}` : `Percentile ${orient}`;
    }
    case 'd12':
      switch (settings.d12Variant) {
        case 'rhombic':
          return 'Rhombic D12';
        case 'crystal':
          return 'Crystal Barrel';
        default:
          return 'Pentagonal D12';
      }
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
  fontOrMap: Font | Record<string, Font>,
  fontDisplayNameOrMap: string | Record<string, string>,
  onProgress?: (info: BatchProgressInfo) => void,
  targetDice?: string[],
): Promise<{ files: ExportFileEntry[]; specMarkdown: string; breachedDice: string[] }> {
  const isFontInstance = typeof (fontOrMap as Font).getPath === 'function';
  const fontMap = isFontInstance ? null : (fontOrMap as Record<string, Font>);
  const fontNameMap = typeof fontDisplayNameOrMap === 'string' ? null : fontDisplayNameOrMap;
  const fallbackFont = isFontInstance
    ? (fontOrMap as Font)
    : fontMap![project.typography.activeFontId] ?? Object.values(fontMap!)[0];
  const fallbackFontName =
    typeof fontDisplayNameOrMap === 'string'
      ? fontDisplayNameOrMap
      : fontNameMap![project.typography.activeFontId] ??
        Object.values(fontNameMap!)[0] ??
        project.typography.activeFontId;

  const targetSet = targetDice ? new Set<string>(targetDice) : null;
  const exportDice = getProjectDieOrder(project).filter((id) =>
    targetSet ? targetSet.has(id) : Boolean(project.dice[id]?.enabled),
  );
  const modesPerDie = project.blanks.includeBlanksOnExport ? 2 : 1;
  const totalSteps = exportDice.length * modesPerDie + 1;
  let currentStep = 0;

  const slug = sanitizeSlug(project.setName);
  const candidateCounts = new Map<string, number>();
  const candidateForId = new Map<string, string>();
  for (const dieId of exportDice) {
    const settings = project.dice[dieId];
    const kind = settings.kind;
    const variantSuffix =
      kind === 'd2' && settings.d2Variant !== 'round'
        ? `_${settings.d2Variant}`
        : kind === 'd3'
          ? `_${settings.d3Variant}`
          : kind === 'd4'
            ? `_${settings.d4Variant}`
            : kind === 'd5' || kind === 'd7' || kind === 'd9'
              ? `_${settings.oddVariant}`
              : kind === 'd6' && settings.d6Variant !== 'cube'
                ? `_${settings.d6Variant}`
                : kind === 'd8' && settings.d8Variant !== 'octahedron'
                  ? `_${settings.d8Variant}`
                  : (kind === 'd10' || kind === 'd00') && settings.d10Variant !== 'trapezohedron'
                    ? `_${settings.d10Variant}`
                    : kind === 'd12' && settings.d12Variant !== 'pentagonal'
                      ? `_${settings.d12Variant}`
                      : '';
    const rawLabel = settings.customLabel?.trim();
    const labelSuffix = rawLabel ? `_${sanitizeSlug(rawLabel)}` : '';
    const candidate = `${slug}_${kind.toUpperCase()}${variantSuffix}${labelSuffix}`;
    candidateForId.set(dieId, candidate);
    candidateCounts.set(candidate, (candidateCounts.get(candidate) ?? 0) + 1);
  }
  const seenCandidateIndex = new Map<string, number>();

  const files: ExportFileEntry[] = [];
  const specRows: DieSpecRow[] = [];
  const breachedDice: string[] = [];

  for (const dieId of exportDice) {
    const settings = project.dice[dieId];
    const kind = settings.kind;
    const shortTag = getDieInstanceShortTag(settings, project);
    const dieLabel = getDieInstanceLabel(settings, project);
    const effectiveTypography = resolveDieTypography(project.typography, settings);
    const dieFont = isFontInstance
      ? (fontOrMap as Font)
      : fontMap![effectiveTypography.activeFontId] ?? fallbackFont;
    const dieFontName =
      typeof fontDisplayNameOrMap === 'string'
        ? fontDisplayNameOrMap
        : fontNameMap![effectiveTypography.activeFontId] ?? fallbackFontName;

    const baseCandidate = candidateForId.get(dieId)!;
    const freq = candidateCounts.get(baseCandidate) ?? 1;
    let diePrefix = baseCandidate;
    if (freq > 1) {
      const nextIdx = (seenCandidateIndex.get(baseCandidate) ?? 0) + 1;
      seenCandidateIndex.set(baseCandidate, nextIdx);
      diePrefix = `${baseCandidate}_${nextIdx}`;
    }

    currentStep++;
    onProgress?.({
      currentStep,
      totalSteps,
      label: `Building ${shortTag} Master (${settings.sizeMm.toFixed(1)} mm)...`,
    });

    const masterRes = await generateExportManifold(dieId, project, dieFont, 'master');

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
        label: `Building ${shortTag} Matched Blank...`,
      });

      const blankRes = await generateExportManifold(dieId, project, dieFont, 'blank');
      hasBreach = blankRes.breach.hasBreach;
      if (hasBreach) breachedDice.push(shortTag);

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

    const baseVariantLabel = formatDieVariantLabel(settings);
    const variantLabel =
      settings.useHighFaceEmblemOverride === true
        ? `${baseVariantLabel} · Emblem`
        : settings.useHighFaceEmblemOverride === false
          ? `${baseVariantLabel} · Numbers Only`
          : baseVariantLabel;

    specRows.push({
      kind,
      dieLabel,
      variantLabel,
      calipers: masterRes.calipers,
      hasBreach,
      fontName: dieFontName,
      engravingDepthMm: effectiveTypography.engravingDepthMm,
    });
  }

  currentStep++;
  onProgress?.({
    currentStep,
    totalSteps,
    label: 'Writing Caliper Specs & packaging...',
  });

  const specMarkdown = generateCaliperSpecSheet(project, fallbackFontName, specRows);
  if (project.exportConfig.exportSpecSheet) {
    files.push({
      relativePath: 'Caliper_Specs.md',
      bytes: new TextEncoder().encode(specMarkdown),
    });
  }

  return { files, specMarkdown, breachedDice };
}
