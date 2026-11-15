export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

export type DieKind = 'd2' | 'd3' | 'd4' | 'd6' | 'd8' | 'd10' | 'd00' | 'd12' | 'd20';

export type D4Variant =
  | 'classic_vertex'
  | 'classic_base'
  | 'crystal'
  | 'arch'
  | 'pendulum'
  | 'truncated';

export type D3Variant = 'truncated_barrel' | 'rounded_prism';
export type D10NumberingMode = '0_9' | '1_10';
export type D00OrientationMode = 'horizontal' | 'vertical';
export type D20NumberingMode = 'balanced' | 'spindown';
export type SixNineIndicator = 'dot' | 'bar' | 'none';
export type SetPresetId = 'standard' | 'mini' | 'chonk';
export type ViewportMode = 'single' | 'tray' | 'xray' | 'supports';
export type InspectorTab = 'shape' | 'typography' | 'blanks' | 'export';
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
  kind: DieKind;
  enabled: boolean;
  /** Primary face-to-face or diameter caliper size in mm */
  sizeMm: number;
  /** Secondary caliper dimension in mm (Coin thickness, Crystal/Arch/D3 length) */
  secondarySizeMm: number;
  edgeChamferMm: number;
  d4Variant: D4Variant;
  d3Variant: D3Variant;
  d10Numbering: D10NumberingMode;
  d00Orientation: D00OrientationMode;
  d20Numbering: D20NumberingMode;
  /** Per-die font scale multiplier (1.0 = global) */
  fontScaleMultiplier: number;
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
  activeDie: DieKind;
  selectedFaceId: string | null;
  viewportMode: ViewportMode;
  activeTab: InspectorTab;
  typography: TypographyConfig;
  blanks: BlankConfig;
  supports: SupportConfig;
  exportConfig: ExportConfig;
  dice: Record<DieKind, DieSettings>;
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
