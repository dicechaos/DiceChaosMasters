import { DEFAULT_SVG_ASSETS } from '../assets/diceChaosEmblem';
import type {
  DiceProjectState,
  DieKind,
  DieSettings,
  FontEntry,
  SetPresetId,
} from '../types/dice';

export const DIE_ORDER: DieKind[] = ['d2', 'd3', 'd4', 'd6', 'd8', 'd10', 'd00', 'd12', 'd20'];

export const DIE_DISPLAY_NAMES: Record<DieKind, string> = {
  d2: 'D2 Coin',
  d3: 'D3 Prism',
  d4: 'D4',
  d6: 'D6',
  d8: 'D8',
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
      d6: { sizeMm: 16.0, secondarySizeMm: 16.0, edgeChamferMm: 0.2 },
      d8: { sizeMm: 16.5, secondarySizeMm: 16.5, edgeChamferMm: 0.2 },
      d10: { sizeMm: 16.5, secondarySizeMm: 16.5, edgeChamferMm: 0.2 },
      d00: { sizeMm: 16.5, secondarySizeMm: 16.5, edgeChamferMm: 0.2 },
      d12: { sizeMm: 18.5, secondarySizeMm: 18.5, edgeChamferMm: 0.2 },
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
      d6: { sizeMm: 11.2, secondarySizeMm: 11.2, edgeChamferMm: 0.12 },
      d8: { sizeMm: 11.6, secondarySizeMm: 11.6, edgeChamferMm: 0.12 },
      d10: { sizeMm: 11.6, secondarySizeMm: 11.6, edgeChamferMm: 0.12 },
      d00: { sizeMm: 11.6, secondarySizeMm: 11.6, edgeChamferMm: 0.12 },
      d12: { sizeMm: 13.0, secondarySizeMm: 13.0, edgeChamferMm: 0.12 },
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
      d6: { sizeMm: 24.0, secondarySizeMm: 24.0, edgeChamferMm: 0.3 },
      d8: { sizeMm: 24.8, secondarySizeMm: 24.8, edgeChamferMm: 0.3 },
      d10: { sizeMm: 24.8, secondarySizeMm: 24.8, edgeChamferMm: 0.3 },
      d00: { sizeMm: 24.8, secondarySizeMm: 24.8, edgeChamferMm: 0.3 },
      d12: { sizeMm: 27.8, secondarySizeMm: 27.8, edgeChamferMm: 0.3 },
      d20: { sizeMm: 31.0, secondarySizeMm: 31.0, edgeChamferMm: 0.3 },
    },
  },
};

export function createDefaultDieSettings(
  kind: DieKind,
  presetId: SetPresetId = 'standard',
): DieSettings {
  const presetSizes = SET_PRESETS[presetId].sizes[kind];
  return {
    kind,
    enabled: true,
    sizeMm: presetSizes.sizeMm,
    secondarySizeMm: presetSizes.secondarySizeMm,
    edgeChamferMm: presetSizes.edgeChamferMm,
    d4Variant: 'crystal',
    d3Variant: 'truncated_barrel',
    d10Numbering: '0_9',
    d00Orientation: 'horizontal',
    d20Numbering: 'balanced',
    fontScaleMultiplier: 1.0,
    blankClearanceOverrideMm: null,
    faceOverrides: {},
  };
}

export function createDefaultProjectState(presetId: SetPresetId = 'standard'): DiceProjectState {
  return {
    version: 1,
    setName: 'DiceChaos_Master_Set',
    presetId,
    activeDie: 'd20',
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
      d2: createDefaultDieSettings('d2', presetId),
      d3: createDefaultDieSettings('d3', presetId),
      d4: createDefaultDieSettings('d4', presetId),
      d6: createDefaultDieSettings('d6', presetId),
      d8: createDefaultDieSettings('d8', presetId),
      d10: createDefaultDieSettings('d10', presetId),
      d00: createDefaultDieSettings('d00', presetId),
      d12: createDefaultDieSettings('d12', presetId),
      d20: createDefaultDieSettings('d20', presetId),
    },
    uploadedFonts: [],
    svgAssets: [...DEFAULT_SVG_ASSETS],
  };
}
