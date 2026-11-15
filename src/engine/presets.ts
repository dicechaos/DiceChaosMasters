import { DEFAULT_SVG_ASSETS } from '../assets/diceChaosEmblem';
import type {
  D10Variant,
  D12Variant,
  D2Variant,
  D3Variant,
  D4Variant,
  D6Variant,
  D8Variant,
  DiceProjectState,
  DieKind,
  DieSettings,
  FontEntry,
  OddDieVariant,
  SetPresetId,
  SetTemplateId,
} from '../types/dice';

export const DEFAULT_STUDIO_DICE: DieKind[] = [
  'd2',
  'd3',
  'd4',
  'd6',
  'd8',
  'd10',
  'd00',
  'd12',
  'd20',
];

export const DIE_ORDER: DieKind[] = [
  'd2',
  'd3',
  'd4',
  'd5',
  'd6',
  'd7',
  'd8',
  'd9',
  'd10',
  'd00',
  'd12',
  'd20',
];

export const RPG_SEVEN_DICE: DieKind[] = ['d4', 'd6', 'd8', 'd10', 'd00', 'd12', 'd20'];

export function getProjectDieOrder(
  project: Pick<DiceProjectState, 'dice'> & { dieOrder?: readonly string[] },
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  if (Array.isArray(project.dieOrder) && project.dieOrder.length > 0) {
    for (const id of project.dieOrder) {
      if (id in project.dice && !seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
    }
  } else {
    for (const kind of DIE_ORDER) {
      if (kind in project.dice && !seen.has(kind)) {
        seen.add(kind);
        ordered.push(kind);
      }
    }
  }

  for (const id of Object.keys(project.dice)) {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }

  return ordered;
}

export function normalizeSelectedDice(
  selected: readonly string[] | undefined,
  fallbackActive = 'd20',
  dieOrder?: readonly string[],
): string[] {
  const order = dieOrder && dieOrder.length > 0 ? dieOrder : DIE_ORDER;
  const orderSet = new Set<string>(order);
  const validSet = new Set<string>(
    (selected ?? []).filter((id): id is string => orderSet.has(id)),
  );
  if (validSet.size === 0 && order.length > 0) {
    validSet.add(orderSet.has(fallbackActive) ? fallbackActive : order[0]);
  }
  return order.filter((id) => validSet.has(id));
}

export function nextDieInstanceId(
  kind: DieKind,
  existingDice: Record<string, DieSettings>,
): string {
  if (!(kind in existingDice)) {
    return kind;
  }
  let n = 2;
  while (`${kind}-${n}` in existingDice) {
    n++;
  }
  return `${kind}-${n}`;
}

export function getDieOrdinalInKind(
  dieId: string,
  project: Pick<DiceProjectState, 'dice'> & { dieOrder?: readonly string[] },
): { index: number; count: number } {
  const target = project.dice[dieId];
  if (!target) return { index: 0, count: 0 };
  const order = getProjectDieOrder(project);
  const sameKind = order.filter((id) => project.dice[id]?.kind === target.kind);
  const index = sameKind.indexOf(dieId);
  return {
    index: index >= 0 ? index : 0,
    count: sameKind.length,
  };
}

export function getDieInstanceLabel(
  die: DieSettings,
  project: Pick<DiceProjectState, 'dice'> & { dieOrder?: readonly string[] },
): string {
  const base = DIE_DISPLAY_NAMES[die.kind];
  const tag = die.customLabel?.trim();
  if (tag) {
    return `${base} · ${tag}`;
  }
  const { index, count } = getDieOrdinalInKind(die.id, project);
  if (count > 1) {
    return `${base} #${index + 1}`;
  }
  return base;
}

export function getDieInstanceShortTag(
  die: DieSettings,
  project: Pick<DiceProjectState, 'dice'> & { dieOrder?: readonly string[] },
): string {
  const short = die.kind.toUpperCase();
  const tag = die.customLabel?.trim();
  if (tag) {
    return `${short} (${tag})`;
  }
  const { index, count } = getDieOrdinalInKind(die.id, project);
  if (count > 1) {
    return `${short} #${index + 1}`;
  }
  return short;
}

export const DIE_DISPLAY_NAMES: Record<DieKind, string> = {
  d2: 'D2 Coin',
  d3: 'D3 Prism',
  d4: 'D4',
  d5: 'D5',
  d6: 'D6',
  d7: 'D7',
  d8: 'D8',
  d9: 'D9',
  d10: 'D10',
  d00: 'D00 %',
  d12: 'D12',
  d20: 'D20',
};

export const BUNDLED_FONTS: FontEntry[] = [
  {
    id: 'bundled-cinzel-decorative',
    name: 'Cinzel Decorative Bold',
    family: 'Cinzel Decorative',
    source: 'bundled',
    url: './fonts/CinzelDecorative-Bold.ttf',
  },
  {
    id: 'bundled-medieval-sharp',
    name: 'Medieval Sharp',
    family: 'MedievalSharp',
    source: 'bundled',
    url: './fonts/MedievalSharp-Regular.ttf',
  },
  {
    id: 'bundled-uncial-antiqua',
    name: 'Uncial Antiqua',
    family: 'Uncial Antiqua',
    source: 'bundled',
    url: './fonts/UncialAntiqua-Regular.ttf',
  },
  {
    id: 'bundled-chakra-petch',
    name: 'Chakra Petch Bold',
    family: 'Chakra Petch',
    source: 'bundled',
    url: './fonts/ChakraPetch-Bold.ttf',
  },
  {
    id: 'bundled-russo-one',
    name: 'Russo One Bold',
    family: 'Russo One',
    source: 'bundled',
    url: './fonts/RussoOne-Regular.ttf',
  },
];

export interface SetSizingPreset {
  id: SetPresetId;
  label: string;
  description: string;
  sizes: Record<DieKind, { sizeMm: number; secondarySizeMm: number; edgeChamferMm: number }>;
}

export const SET_PRESETS: Record<SetPresetId, SetSizingPreset> = {
  standard: {
    id: 'standard',
    label: 'Standard RPG',
    description: 'Classic balanced 16 mm D6 / 20.5 mm D20 master set',
    sizes: {
      d2: { sizeMm: 26.0, secondarySizeMm: 3.6, edgeChamferMm: 0.25 },
      d3: { sizeMm: 16.0, secondarySizeMm: 22.0, edgeChamferMm: 0.2 },
      d4: { sizeMm: 19.0, secondarySizeMm: 28.0, edgeChamferMm: 0.2 },
      d5: { sizeMm: 16.5, secondarySizeMm: 24.0, edgeChamferMm: 0.2 },
      d6: { sizeMm: 16.0, secondarySizeMm: 24.0, edgeChamferMm: 0.2 },
      d7: { sizeMm: 17.0, secondarySizeMm: 25.0, edgeChamferMm: 0.2 },
      d8: { sizeMm: 16.5, secondarySizeMm: 25.0, edgeChamferMm: 0.2 },
      d9: { sizeMm: 17.5, secondarySizeMm: 26.0, edgeChamferMm: 0.2 },
      d10: { sizeMm: 16.5, secondarySizeMm: 25.0, edgeChamferMm: 0.2 },
      d00: { sizeMm: 16.5, secondarySizeMm: 25.0, edgeChamferMm: 0.2 },
      d12: { sizeMm: 18.5, secondarySizeMm: 27.5, edgeChamferMm: 0.2 },
      d20: { sizeMm: 20.5, secondarySizeMm: 20.5, edgeChamferMm: 0.2 },
    },
  },
  mini: {
    id: 'mini',
    label: 'Mini Set (0.7×)',
    description: 'Compact travel masters (~11 mm D6 / ~14.5 mm D20)',
    sizes: {
      d2: { sizeMm: 18.0, secondarySizeMm: 2.8, edgeChamferMm: 0.15 },
      d3: { sizeMm: 11.5, secondarySizeMm: 16.0, edgeChamferMm: 0.12 },
      d4: { sizeMm: 13.5, secondarySizeMm: 20.0, edgeChamferMm: 0.12 },
      d5: { sizeMm: 11.6, secondarySizeMm: 17.0, edgeChamferMm: 0.12 },
      d6: { sizeMm: 11.2, secondarySizeMm: 17.0, edgeChamferMm: 0.12 },
      d7: { sizeMm: 12.0, secondarySizeMm: 18.0, edgeChamferMm: 0.12 },
      d8: { sizeMm: 11.6, secondarySizeMm: 18.0, edgeChamferMm: 0.12 },
      d9: { sizeMm: 12.4, secondarySizeMm: 18.5, edgeChamferMm: 0.12 },
      d10: { sizeMm: 11.6, secondarySizeMm: 18.0, edgeChamferMm: 0.12 },
      d00: { sizeMm: 11.6, secondarySizeMm: 18.0, edgeChamferMm: 0.12 },
      d12: { sizeMm: 13.0, secondarySizeMm: 19.5, edgeChamferMm: 0.12 },
      d20: { sizeMm: 14.5, secondarySizeMm: 14.5, edgeChamferMm: 0.12 },
    },
  },
  chonk: {
    id: 'chonk',
    label: 'Chonk (1.5×)',
    description: 'Oversized statement masters (~24 mm D6 / ~31 mm D20)',
    sizes: {
      d2: { sizeMm: 38.0, secondarySizeMm: 5.0, edgeChamferMm: 0.35 },
      d3: { sizeMm: 24.0, secondarySizeMm: 33.0, edgeChamferMm: 0.3 },
      d4: { sizeMm: 28.5, secondarySizeMm: 42.0, edgeChamferMm: 0.3 },
      d5: { sizeMm: 24.5, secondarySizeMm: 36.0, edgeChamferMm: 0.3 },
      d6: { sizeMm: 24.0, secondarySizeMm: 36.0, edgeChamferMm: 0.3 },
      d7: { sizeMm: 25.5, secondarySizeMm: 38.0, edgeChamferMm: 0.3 },
      d8: { sizeMm: 24.8, secondarySizeMm: 37.5, edgeChamferMm: 0.3 },
      d9: { sizeMm: 26.0, secondarySizeMm: 39.0, edgeChamferMm: 0.3 },
      d10: { sizeMm: 24.8, secondarySizeMm: 37.5, edgeChamferMm: 0.3 },
      d00: { sizeMm: 24.8, secondarySizeMm: 37.5, edgeChamferMm: 0.3 },
      d12: { sizeMm: 27.8, secondarySizeMm: 41.5, edgeChamferMm: 0.3 },
      d20: { sizeMm: 31.0, secondarySizeMm: 31.0, edgeChamferMm: 0.3 },
    },
  },
};

export function createDefaultDieSettings(
  kind: DieKind,
  presetId: SetPresetId = 'standard',
  id?: string,
  customLabel = '',
): DieSettings {
  const presetSizes = SET_PRESETS[presetId].sizes[kind];
  return {
    id: id ?? kind,
    kind,
    customLabel,
    enabled: true,
    sizeMm: presetSizes.sizeMm,
    secondarySizeMm: presetSizes.secondarySizeMm,
    edgeChamferMm: presetSizes.edgeChamferMm,
    d2Variant: 'round',
    d4Variant: 'crystal',
    d3Variant: 'truncated_barrel',
    oddVariant: 'trapezohedron',
    d6Variant: 'cube',
    d8Variant: 'octahedron',
    d10Variant: 'trapezohedron',
    d12Variant: 'pentagonal',
    d10Numbering: '0_9',
    d00Orientation: 'horizontal',
    d20Numbering: 'balanced',
    fontScaleMultiplier: 1.0,
    fontIdOverride: null,
    engravingDepthOverrideMm: null,
    useHighFaceEmblemOverride: null,
    highFaceSvgIdOverride: null,
    blankClearanceOverrideMm: null,
    faceOverrides: {},
  };
}

export interface SetTemplateItemSpec {
  kind: DieKind;
  customLabel?: string;
  useHighFaceEmblemOverride?: boolean | null;
  d2Variant?: D2Variant;
  d3Variant?: D3Variant;
  d4Variant?: D4Variant;
  oddVariant?: OddDieVariant;
  d6Variant?: D6Variant;
  d8Variant?: D8Variant;
  d10Variant?: D10Variant;
  d12Variant?: D12Variant;
}

export interface SetTemplateSpec {
  id: SetTemplateId;
  label: string;
  shortLabel: string;
  description: string;
  focusKind: DieKind;
  items: SetTemplateItemSpec[];
}

export const SET_TEMPLATES: Record<SetTemplateId, SetTemplateSpec> = {
  coin_twin_10: {
    id: 'coin_twin_10',
    label: 'Coin + Twin D6/D20 Set',
    shortLabel: '10 Dice · 2×D6 + 2×D20',
    description: 'D2, D4, D8, D10, D00, D12 + 2× D6 & 2× D20 (1 Logo + 1 Numbers each)',
    focusKind: 'd20',
    items: [
      { kind: 'd2' },
      { kind: 'd4' },
      { kind: 'd6', customLabel: 'Logo', useHighFaceEmblemOverride: true },
      { kind: 'd6', customLabel: 'Numbers', useHighFaceEmblemOverride: false },
      { kind: 'd8' },
      { kind: 'd10' },
      { kind: 'd00' },
      { kind: 'd12' },
      { kind: 'd20', customLabel: 'Logo', useHighFaceEmblemOverride: true },
      { kind: 'd20', customLabel: 'Numbers', useHighFaceEmblemOverride: false },
    ],
  },
  advantage_8: {
    id: 'advantage_8',
    label: 'Advantage RPG 8-Set',
    shortLabel: '8 Dice · 2×D20',
    description: 'RPG 7 + twin D20 pair (1 Logo + 1 Numbers Only)',
    focusKind: 'd20',
    items: [
      { kind: 'd4' },
      { kind: 'd6' },
      { kind: 'd8' },
      { kind: 'd10' },
      { kind: 'd00' },
      { kind: 'd12' },
      { kind: 'd20', customLabel: 'Logo', useHighFaceEmblemOverride: true },
      { kind: 'd20', customLabel: 'Numbers', useHighFaceEmblemOverride: false },
    ],
  },
  maker_11: {
    id: 'maker_11',
    label: 'Deluxe Maker 11-Set',
    shortLabel: '11 Dice · 4×D6 + 2×D20',
    description: '4× D6 + twin D20 Logo/Numbers + D4, D8, D10, D00, D12',
    focusKind: 'd20',
    items: [
      { kind: 'd4' },
      { kind: 'd6', customLabel: 'Logo', useHighFaceEmblemOverride: true },
      { kind: 'd6', customLabel: 'Numbers', useHighFaceEmblemOverride: false },
      { kind: 'd6', customLabel: 'Numbers', useHighFaceEmblemOverride: false },
      { kind: 'd6', customLabel: 'Numbers', useHighFaceEmblemOverride: false },
      { kind: 'd8' },
      { kind: 'd10' },
      { kind: 'd00' },
      { kind: 'd12' },
      { kind: 'd20', customLabel: 'Logo', useHighFaceEmblemOverride: true },
      { kind: 'd20', customLabel: 'Numbers', useHighFaceEmblemOverride: false },
    ],
  },
  duality_9: {
    id: 'duality_9',
    label: 'Duality 2D12 + Advantage Set',
    shortLabel: '9 Dice · 2×D12 + 2×D20',
    description: 'RPG core with Hope/Fear D12 pair and twin D20s',
    focusKind: 'd12',
    items: [
      { kind: 'd4' },
      { kind: 'd6' },
      { kind: 'd8' },
      { kind: 'd10' },
      { kind: 'd00' },
      { kind: 'd12', customLabel: 'Hope', useHighFaceEmblemOverride: true },
      { kind: 'd12', customLabel: 'Fear', useHighFaceEmblemOverride: false },
      { kind: 'd20', customLabel: 'Logo', useHighFaceEmblemOverride: true },
      { kind: 'd20', customLabel: 'Numbers', useHighFaceEmblemOverride: false },
    ],
  },
  rhombic_7: {
    id: 'rhombic_7',
    label: 'Rhombic Geometric 7-Set',
    shortLabel: '7 Dice · Rhombic',
    description: 'Truncated D4, Rhombic Diamond D6 & Catalan Rhombic D12 RPG set',
    focusKind: 'd12',
    items: [
      { kind: 'd4', d4Variant: 'truncated' },
      { kind: 'd6', d6Variant: 'rhombic' },
      { kind: 'd8', d8Variant: 'octahedron' },
      { kind: 'd10', d10Variant: 'trapezohedron' },
      { kind: 'd00', d10Variant: 'trapezohedron' },
      { kind: 'd12', d12Variant: 'rhombic' },
      { kind: 'd20' },
    ],
  },
  crystal_7: {
    id: 'crystal_7',
    label: 'Crystal Apothecary 7-Set',
    shortLabel: '7 Dice · Crystal',
    description: 'Pointed crystal barrels across D4, D6, D8, D10, D00 & D12 + D20',
    focusKind: 'd12',
    items: [
      { kind: 'd4', d4Variant: 'crystal' },
      { kind: 'd6', d6Variant: 'crystal' },
      { kind: 'd8', d8Variant: 'crystal' },
      { kind: 'd10', d10Variant: 'crystal' },
      { kind: 'd00', d10Variant: 'crystal' },
      { kind: 'd12', d12Variant: 'crystal' },
      { kind: 'd20' },
    ],
  },
  dcc_chain_10: {
    id: 'dcc_chain_10',
    label: 'DCC / Odd-Chain 10-Set',
    shortLabel: '10 Dice · D3–D20 Odd',
    description: 'Dungeon crawl chain adding D3, D5 & D7 to the RPG core',
    focusKind: 'd7',
    items: (['d3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd10', 'd00', 'd12', 'd20'] as DieKind[]).map(
      (kind) => ({ kind }),
    ),
  },
  continuum_12: {
    id: 'continuum_12',
    label: 'Complete 12-Shape Continuum',
    shortLabel: '12 Dice · D2–D20',
    description: 'Every shape in the studio including D5, D7 & D9',
    focusKind: 'd9',
    items: DIE_ORDER.map((kind) => ({ kind })),
  },
  rpg_7: {
    id: 'rpg_7',
    label: 'Classic RPG 7-Set',
    shortLabel: '7 Dice · D4–D20',
    description: 'Standard tabletop polyhedral 7-die set',
    focusKind: 'd20',
    items: RPG_SEVEN_DICE.map((kind) => ({ kind })),
  },
  standard_9: {
    id: 'standard_9',
    label: 'Complete Studio 9-Set',
    shortLabel: '9 Dice · D2–D20',
    description: 'Full studio set including D2 Coin & D3 Prism',
    focusKind: 'd20',
    items: DEFAULT_STUDIO_DICE.map((kind) => ({ kind })),
  },
  d6_pool_6: {
    id: 'd6_pool_6',
    label: '6× D6 Wargame / Pool Set',
    shortLabel: '6 Dice · 6×D6',
    description: '6× D6 pool (1 Logo + 5 plain Numbers Only)',
    focusKind: 'd6',
    items: [
      { kind: 'd6', customLabel: 'Logo', useHighFaceEmblemOverride: true },
      { kind: 'd6', customLabel: 'Numbers', useHighFaceEmblemOverride: false },
      { kind: 'd6', customLabel: 'Numbers', useHighFaceEmblemOverride: false },
      { kind: 'd6', customLabel: 'Numbers', useHighFaceEmblemOverride: false },
      { kind: 'd6', customLabel: 'Numbers', useHighFaceEmblemOverride: false },
      { kind: 'd6', customLabel: 'Numbers', useHighFaceEmblemOverride: false },
    ],
  },
  d10_pool_10: {
    id: 'd10_pool_10',
    label: '10× D10 Storyteller Pool',
    shortLabel: '10 Dice · 10×D10',
    description: '10× D10 pool (1 Logo + 9 plain Numbers Only)',
    focusKind: 'd10',
    items: [
      { kind: 'd10', customLabel: 'Logo', useHighFaceEmblemOverride: true },
      ...Array.from({ length: 9 }, () => ({
        kind: 'd10' as DieKind,
        customLabel: 'Numbers',
        useHighFaceEmblemOverride: false,
      })),
    ],
  },
};

export const SET_TEMPLATE_LIST: SetTemplateSpec[] = [
  SET_TEMPLATES.coin_twin_10,
  SET_TEMPLATES.advantage_8,
  SET_TEMPLATES.maker_11,
  SET_TEMPLATES.duality_9,
  SET_TEMPLATES.rhombic_7,
  SET_TEMPLATES.crystal_7,
  SET_TEMPLATES.dcc_chain_10,
  SET_TEMPLATES.continuum_12,
  SET_TEMPLATES.rpg_7,
  SET_TEMPLATES.standard_9,
  SET_TEMPLATES.d6_pool_6,
  SET_TEMPLATES.d10_pool_10,
];

/**
 * Builds a complete multi-instance die map & order for a game set template,
 * inheriting size preset, edge bevel, and shape variants from the current project.
 */
export function buildSetFromTemplate(
  templateId: SetTemplateId,
  currentProject: DiceProjectState,
): {
  dieOrder: string[];
  dice: Record<string, DieSettings>;
  activeDie: string;
  label: string;
} {
  const spec = SET_TEMPLATES[templateId];
  const existingOrder = getProjectDieOrder(currentProject);
  const templateByKind = new Map<DieKind, DieSettings>();
  for (const id of existingOrder) {
    const existing = currentProject.dice[id];
    if (existing && !templateByKind.has(existing.kind)) {
      templateByKind.set(existing.kind, existing);
    }
  }

  const dice: Record<string, DieSettings> = {};
  const dieOrder: string[] = [];

  for (const item of spec.items) {
    const id = nextDieInstanceId(item.kind, dice);
    const base = createDefaultDieSettings(
      item.kind,
      currentProject.presetId,
      id,
      item.customLabel ?? '',
    );
    const prev = templateByKind.get(item.kind);
    if (prev) {
      base.d2Variant = prev.d2Variant;
      base.d4Variant = prev.d4Variant;
      base.d3Variant = prev.d3Variant;
      base.oddVariant = prev.oddVariant;
      base.d6Variant = prev.d6Variant;
      base.d8Variant = prev.d8Variant;
      base.d10Variant = prev.d10Variant;
      base.d12Variant = prev.d12Variant;
      base.d10Numbering = prev.d10Numbering;
      base.d00Orientation = prev.d00Orientation;
      base.d20Numbering = prev.d20Numbering;
      base.edgeChamferMm = prev.edgeChamferMm;
      base.sizeMm = prev.sizeMm;
      base.secondarySizeMm = prev.secondarySizeMm;
    }
    if (item.d2Variant !== undefined) base.d2Variant = item.d2Variant;
    if (item.d3Variant !== undefined) base.d3Variant = item.d3Variant;
    if (item.d4Variant !== undefined) base.d4Variant = item.d4Variant;
    if (item.oddVariant !== undefined) base.oddVariant = item.oddVariant;
    if (item.d6Variant !== undefined) base.d6Variant = item.d6Variant;
    if (item.d8Variant !== undefined) base.d8Variant = item.d8Variant;
    if (item.d10Variant !== undefined) base.d10Variant = item.d10Variant;
    if (item.d12Variant !== undefined) base.d12Variant = item.d12Variant;
    if (item.useHighFaceEmblemOverride !== undefined) {
      base.useHighFaceEmblemOverride = item.useHighFaceEmblemOverride;
    }
    dice[id] = base;
    dieOrder.push(id);
  }

  const focusId =
    dieOrder.find((id) => dice[id].kind === spec.focusKind) ?? dieOrder[0];

  return {
    dieOrder,
    dice,
    activeDie: focusId,
    label: spec.label,
  };
}

export function createDefaultProjectState(presetId: SetPresetId = 'standard'): DiceProjectState {
  return {
    version: 1,
    setName: 'DiceChaos_Master_Set',
    presetId,
    dieOrder: [...DEFAULT_STUDIO_DICE],
    activeDie: 'd20',
    selectedDice: ['d20'],
    selectedFaceId: null,
    viewportMode: 'single',
    activeTab: 'shape',
    typography: {
      activeFontId: BUNDLED_FONTS[0].id,
      fontScalePct: 58,
      engravingDepthMm: 0.75,
      draftAngleDeg: 14,
      sixNineIndicator: 'dot',
      twoDigitTrackingEm: -0.04,
      useHighFaceEmblem: false,
      highFaceSvgId: DEFAULT_SVG_ASSETS[0].id,
    },
    blanks: {
      includeBlanksOnExport: true,
      clearanceMm: 0.08,
      bubbleBevelMm: 0.15,
    },
    supports: {
      enabled: false,
      pointDown: true,
      bumperContactWidthMm: 0.26,
      finThicknessMm: 0.9,
      raftThicknessMm: 1.5,
      liftHeightMm: 4.5,
      bumperGapMm: 0.0,
    },
    exportConfig: {
      exportStl: true,
      export3mf: true,
      exportSpecSheet: true,
      shrinkageCompensationPct: 0.0,
    },
    dice: {
      d2: createDefaultDieSettings('d2', presetId, 'd2'),
      d3: createDefaultDieSettings('d3', presetId, 'd3'),
      d4: createDefaultDieSettings('d4', presetId, 'd4'),
      d6: createDefaultDieSettings('d6', presetId, 'd6'),
      d8: createDefaultDieSettings('d8', presetId, 'd8'),
      d10: createDefaultDieSettings('d10', presetId, 'd10'),
      d00: createDefaultDieSettings('d00', presetId, 'd00'),
      d12: createDefaultDieSettings('d12', presetId, 'd12'),
      d20: createDefaultDieSettings('d20', presetId, 'd20'),
    },
    uploadedFonts: [],
    svgAssets: [...DEFAULT_SVG_ASSETS],
  };
}
