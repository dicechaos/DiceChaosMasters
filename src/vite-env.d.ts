/// <reference types="vite/client" />

declare module 'manifold-3d/manifold.wasm?url' {
  const wasmUrl: string;
  export default wasmUrl;
}

declare module 'opentype.js' {
  export type PathCommand =
    | { type: 'M'; x: number; y: number }
    | { type: 'L'; x: number; y: number }
    | { type: 'Q'; x1: number; y1: number; x: number; y: number }
    | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: 'Z' };

  export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  export interface Path {
    commands: PathCommand[];
    getBoundingBox(): BoundingBox;
  }

  export interface Glyph {
    advanceWidth?: number;
    getPath(x: number, y: number, fontSize: number): Path;
  }

  export interface Font {
    unitsPerEm: number;
    names?: Record<string, Record<string, string>>;
    stringToGlyphs(text: string): Glyph[];
    getPath(text: string, x: number, y: number, fontSize: number): Path;
    getKerningValue(leftGlyph: Glyph, rightGlyph: Glyph): number;
  }

  export function parse(buffer: ArrayBuffer): Font;
}

interface Window {
  api?: import('./types/desktop').DesktopBridgeAPI;
}
