export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

export type DieKind =
  | 'd2'
  | 'd3'
  | 'd4'
  | 'd5'
  | 'd6'
  | 'd7'
  | 'd8'
  | 'd9'
  | 'd10'
  | 'd00'
  | 'd12'
  | 'd20';

export type D2Variant =
  | 'round'
  | 'oval'
  | 'rounded_square'
  | 'hexagon'
  | 'octagon'
  | 'shield';

export type D4Variant =
  | 'classic_vertex'
  | 'classic_base'
  | 'crystal'
  | 'arch'
  | 'pendulum'
  | 'truncated';

export type D3Variant = 'truncated_barrel' | 'rounded_prism';
export type OddDieVariant = 'trapezohedron' | 'crystal' | 'prism';
export type D6Variant = 'cube' | 'rhombic' | 'truncated' | 'crystal';
export type D8Variant = 'octahedron' | 'shard' | 'crystal';
export type D10Variant = 'trapezohedron' | 'crystal';
export type D12Variant = 'pentagonal' | 'rhombic' | 'crystal';
export type D10NumberingMode = '0_9' | '1_10';
export type D00OrientationMode = 'horizontal' | 'vertical';
export type D20NumberingMode = 'balanced' | 'spindown';
export type SixNineIndicator = 'dot' | 'bar' | 'none';
export type SetPresetId = 'standard' | 'mini' | 'chonk';
export type SetTemplateId =
  | 'coin_twin_10'
  | 'rpg_7'
  | 'standard_9'
  | 'advantage_8'
  | 'maker_11'
  | 'duality_9'
  | 'rhombic_7'
  | 'crystal_7'
  | 'dcc_chain_10'
  | 'continuum_12'
  | 'd6_pool_6'
  | 'd10_pool_10';
export type ViewportMode = 'single' | 'tray' | 'xray' | 'supports';
export type InspectorTab = 'shape' | 'typography' | 'blanks' | 'export';
export type ExportScope = 'enabled' | 'selected';
export type ResinPreviewPreset = 'master_grey' | 'arcane_sapphire' | 'cure_clear' | 'obsidian_cyan';
export type ThemePreference = 'dark' | 'light' | 'system';

export interface FaceSubLabel {
  id: string;
  text: string;
  /** Normalized 2D local position offset inside the face frame (relative to face inradius) */
  offsetXFactor: number;
  offsetYFactor: number;
  /** Additional 2D local rotation in radians */
  rotationRad: number;
  /** Scale multiplier relative to single-label size */
  scaleFactor: number;
}

export interface HalfSpacePlane {
  id: string;
  normal: Vec3;
  distance: number;
  isNumbered: boolean;
  role: 'primary' | 'cap' | 'chamfer';
  faceLabel?: string;
  subLabels?: FaceSubLabel[];
  upHint?: Vec3;
}

export interface ClippedFace {
  id: string;
  normal: Vec3;
  distance: number;
  role: 'primary' | 'cap' | 'chamfer';
  vertices3D: Vec3[];
  vertices2D: Vec2[];
  tangentRight: Vec3;
  tangentUp: Vec3;
  origin3D: Vec3;
  inradius2D: number;
  opticalCenter2D: Vec2;
  isNumbered: boolean;
  faceLabel?: string;
  subLabels?: FaceSubLabel[];
}

export interface FaceOverride {
  customText?: string;
  svgId?: string | null;
  scaleMultiplier: number;
  offsetXMm: number;
  offsetYMm: number;
  rotationDeg: number;
}

export interface DieSettings {
  id: string;
  kind: DieKind;
  /** Optional maker tag such as "Logo", "Numbers", "Hope", "Fear", "Spindown" */
  customLabel?: string;
  enabled: boolean;
  /** Primary face-to-face or diameter caliper size in mm */
  sizeMm: number;
  /** Secondary caliper dimension in mm (Coin thickness, Crystal/Arch/D3 length) */
  secondarySizeMm: number;
  edgeChamferMm: number;
  d2Variant: D2Variant;
  d4Variant: D4Variant;
  d3Variant: D3Variant;
  oddVariant: OddDieVariant;
  d6Variant: D6Variant;
  d8Variant: D8Variant;
  d10Variant: D10Variant;
  d12Variant: D12Variant;
  d10Numbering: D10NumberingMode;
  d00Orientation: D00OrientationMode;
  d20Numbering: D20NumberingMode;
  /** Per-die font scale multiplier (1.0 = global) */
  fontScaleMultiplier: number;
  /** Optional per-die font override (null = use global activeFontId) */
  fontIdOverride: string | null;
  /** Optional per-die engraving depth override in mm (null = use global engravingDepthMm) */
  engravingDepthOverrideMm: number | null;
  /** Optional per-die high-face emblem toggle override (null = use global useHighFaceEmblem) */
  useHighFaceEmblemOverride: boolean | null;
  /** Optional per-die high-face emblem SVG asset id override (null = use global highFaceSvgId) */
  highFaceSvgIdOverride: string | null;
  /** Optional per-die blank clearance override in mm (null = use global blank clearance) */
  blankClearanceOverrideMm: number | null;
  /** Per-face overrides keyed by face id (e.g. "face_20") */
  faceOverrides: Record<string, FaceOverride>;
}

export interface FontEntry {
  id: string;
  name: string;
  family: string;
  source: 'bundled' | 'system' | 'uploaded';
  url?: string;
  systemPath?: string;
  dataBase64?: string;
}

export interface SvgAsset {
  id: string;
  name: string;
  svgContent: string;
  builtIn?: boolean;
}

export interface TypographyConfig {
  activeFontId: string;
  fontScalePct: number;
  engravingDepthMm: number;
  draftAngleDeg: number;
  sixNineIndicator: SixNineIndicator;
  twoDigitTrackingEm: number;
  useHighFaceEmblem: boolean;
  highFaceSvgId: string;
}

export interface BlankConfig {
  includeBlanksOnExport: boolean;
  clearanceMm: number;
  bubbleBevelMm: number;
}

export interface SupportConfig {
  enabled: boolean;
  pointDown: boolean;
  bumperContactWidthMm: number;
  finThicknessMm: number;
  raftThicknessMm: number;
  liftHeightMm: number;
  bumperGapMm: number;
}

export interface ExportConfig {
  exportStl: boolean;
  export3mf: boolean;
  exportSpecSheet: boolean;
  shrinkageCompensationPct: number;
}

export interface DiceProjectState {
  version: 1;
  setName: string;
  presetId: SetPresetId;
  dieOrder: string[];
  activeDie: string;
  selectedDice: string[];
  selectedFaceId: string | null;
  viewportMode: ViewportMode;
  activeTab: InspectorTab;
  typography: TypographyConfig;
  blanks: BlankConfig;
  supports: SupportConfig;
  exportConfig: ExportConfig;
  dice: Record<string, DieSettings>;
  uploadedFonts: Array<{ id: string; name: string; dataBase64: string }>;
  svgAssets: SvgAsset[];
}

export interface MeshBufferData {
  positions: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  boundsMin: Vec3;
  boundsMax: Vec3;
  triangleCount: number;
  volumeMm3: number;
  manifoldStatus: string;
}

export interface FacePreviewInfo {
  id: string;
  label: string;
  origin3D: Vec3;
  normal: Vec3;
  inradius2D: number;
  isNumbered: boolean;
}

export interface BlankBreachReport {
  hasBreach: boolean;
  breachVolumeMm3: number;
  minimumWallClearanceMm: number;
  blankFitsInsideMaster: boolean;
}

export interface CaliperMetrics {
  masterFaceToFaceMm: number;
  masterHeightMm: number;
  blankFaceToFaceMm: number;
  blankHeightMm: number;
  masterSlicerF2FMm: number;
  blankSlicerF2FMm: number;
  effectiveClearanceMm: number;
}

export interface GeneratedDieResult {
  dieId: string;
  kind: DieKind;
  masterMesh: MeshBufferData;
  blankMesh: MeshBufferData | null;
  supportMesh: MeshBufferData | null;
  faces: FacePreviewInfo[];
  calipers: CaliperMetrics;
  breach: BlankBreachReport;
  generationMs: number;
}

export interface ExportFileEntry {
  relativePath: string;
  bytes: Uint8Array;
}
