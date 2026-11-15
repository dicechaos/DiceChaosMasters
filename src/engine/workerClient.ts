import type {
  DiceProjectState,
  DieKind,
  ExportFileEntry,
  GeneratedDieResult,
} from '../types/dice';
import type { BatchProgressInfo } from './exporters/batchExporter';

interface PendingTask {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  onProgress?: (info: BatchProgressInfo) => void;
}

class DiceWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingTask>();

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./diceWorker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (event: MessageEvent) => {
        const data = event.data;
        const task = this.pending.get(data.requestId);
        if (!task) return;

        if (data.type === 'exportProgress') {
          task.onProgress?.(data.progress);
          return;
        }

        this.pending.delete(data.requestId);
        if (data.type === 'error') {
          task.reject(new Error(data.message));
        } else if (data.type === 'generateDieResult') {
          task.resolve(data.result);
        } else if (data.type === 'exportBatchResult') {
          task.resolve({
            files: data.files,
            specMarkdown: data.specMarkdown,
            breachedDice: data.breachedDice,
          });
        }
      };
      this.worker.onerror = (err) => {
        for (const task of this.pending.values()) {
          task.reject(new Error(err.message || 'CAD Worker crashed'));
        }
        this.pending.clear();
        this.worker = null;
      };
    }
    return this.worker;
  }

  generateDie(
    kind: DieKind,
    project: DiceProjectState,
    fontBytes: ArrayBuffer,
    includeBlank: boolean,
    includeSupports: boolean,
  ): Promise<GeneratedDieResult> {
    const worker = this.ensureWorker();
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      // Clone slice so caller buffer remains reusable in cache
      const cloned = fontBytes.slice(0);
      worker.postMessage(
        {
          type: 'generateDie',
          requestId,
          kind,
          project,
          fontBytes: cloned,
          includeBlank,
          includeSupports,
        },
        [cloned],
      );
    });
  }

  exportBatch(
    project: DiceProjectState,
    fontBytes: ArrayBuffer,
    fontDisplayName: string,
    onProgress?: (info: BatchProgressInfo) => void,
  ): Promise<{ files: ExportFileEntry[]; specMarkdown: string; breachedDice: DieKind[] }> {
    const worker = this.ensureWorker();
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        onProgress,
      });
      const cloned = fontBytes.slice(0);
      worker.postMessage(
        {
          type: 'exportBatch',
          requestId,
          project,
          fontBytes: cloned,
          fontDisplayName,
        },
        [cloned],
      );
    });
  }
}

export const diceWorkerClient = new DiceWorkerClient();
