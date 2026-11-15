import type { Font } from 'opentype.js';
import type { DiceProjectState, DieKind, ExportFileEntry, GeneratedDieResult } from '../types/dice';
import { buildBatchExportFiles } from './exporters/batchExporter';
import { generateDieGeometry } from './generator';
import { parseFontBuffer } from './typography/glyphBuilder';

type WorkerRequest =
  | {
      type: 'generateDie';
      requestId: number;
      kind: DieKind;
      project: DiceProjectState;
      fontBytes: ArrayBuffer;
      includeBlank: boolean;
      includeSupports: boolean;
    }
  | {
      type: 'exportBatch';
      requestId: number;
      project: DiceProjectState;
      fontBytes: ArrayBuffer;
      fontDisplayName: string;
    };

const fontCache = new WeakMap<ArrayBuffer, Font>();

function getParsedFont(bytes: ArrayBuffer): Font {
  let font = fontCache.get(bytes);
  if (!font) {
    font = parseFontBuffer(bytes);
    fontCache.set(bytes, font);
  }
  return font;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    const font = getParsedFont(msg.fontBytes);
    if (msg.type === 'generateDie') {
      const result: GeneratedDieResult = await generateDieGeometry(
        msg.kind,
        msg.project,
        font,
        {
          includeBlank: msg.includeBlank,
          includeSupports: msg.includeSupports,
          applyShrinkageOnMesh: false,
        },
      );
      self.postMessage({ type: 'generateDieResult', requestId: msg.requestId, result });
    } else if (msg.type === 'exportBatch') {
      const batch = await buildBatchExportFiles(
        msg.project,
        font,
        msg.fontDisplayName,
        (progress) => {
          self.postMessage({
            type: 'exportProgress',
            requestId: msg.requestId,
            progress,
          });
        },
      );
      self.postMessage({
        type: 'exportBatchResult',
        requestId: msg.requestId,
        files: batch.files as ExportFileEntry[],
        specMarkdown: batch.specMarkdown,
        breachedDice: batch.breachedDice,
      });
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
