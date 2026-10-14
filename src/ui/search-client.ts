// Typed client for the pair-search worker. No engineering math, no DOM beyond the Worker constructor.
// - Every request has an id; a response whose id is not the current request is dropped.
// - A newer request cancels the older one. If the older one is still running in the worker, the worker is terminated
//   (a running search cannot be interrupted any other way) and a fresh one is started for the next request.
// - If a Worker cannot be created (tests, node, old browser) or fails, the same task runs synchronously on the page.
import { runTask, type SearchReply, type SearchRequest, type SearchResponse, type SearchTask } from '../workers/pair-search.protocol';

export interface WorkerLike {
  onmessage: ((e: { readonly data: SearchResponse }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  postMessage(request: SearchRequest): void;
  terminate(): void;
}

/** Returns a worker, or null when none can be made. */
export type WorkerFactory = () => WorkerLike | null;

export type SearchOutcome = { readonly status: 'done'; readonly reply: SearchReply; readonly via: 'worker' | 'sync' } | { readonly status: 'cancelled' };

export interface SearchClient {
  /** Resolves 'cancelled' when a newer request, `cancel` or `dispose` replaced this one. */
  search(task: SearchTask): Promise<SearchOutcome>;
  cancel(): void;
  dispose(): void;
}

/** The production factory. The literal `new Worker(new URL(...), { type: 'module' })` form is what Vite bundles as a separate chunk. */
export function defaultWorkerFactory(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('../workers/pair-search.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
  } catch {
    return null;
  }
}

interface Pending {
  readonly id: number;
  readonly task: SearchTask;
  readonly resolve: (o: SearchOutcome) => void;
}

export function createSearchClient(factory: WorkerFactory = defaultWorkerFactory, run: (t: SearchTask) => SearchReply = runTask): SearchClient {
  let seq = 0;
  let current: Pending | null = null;
  let worker: WorkerLike | null = null;
  let broken = false;

  const dropWorker = (): void => {
    if (worker !== null) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      worker = null;
    }
  };

  const supersede = (): void => {
    if (current === null) return;
    const old = current;
    current = null;
    old.resolve({ status: 'cancelled' });
    // The worker is busy with the old request: stop it, a new one is started on demand.
    dropWorker();
  };

  const runSync = (p: Pending): void => {
    void Promise.resolve().then(() => {
      if (current !== p) return;
      current = null;
      p.resolve({ status: 'done', reply: run(p.task), via: 'sync' });
    });
  };

  const fail = (): void => {
    broken = true;
    dropWorker();
    if (current !== null) runSync(current);
  };

  const ensureWorker = (): WorkerLike | null => {
    if (broken) return null;
    if (worker !== null) return worker;
    const w = ((): WorkerLike | null => {
      try {
        return factory();
      } catch {
        return null;
      }
    })();
    if (w === null) {
      broken = true;
      return null;
    }
    w.onmessage = (e): void => {
      const r = e.data;
      const p = current;
      if (p === null || r.id !== p.id) return; // a late response of a superseded request
      if ('failure' in r) {
        fail();
        return;
      }
      current = null;
      p.resolve({ status: 'done', reply: r.reply, via: 'worker' });
    };
    w.onerror = (): void => fail();
    worker = w;
    return w;
  };

  return {
    search(task: SearchTask): Promise<SearchOutcome> {
      supersede();
      return new Promise<SearchOutcome>((resolve) => {
        const p: Pending = { id: ++seq, task, resolve };
        current = p;
        const w = ensureWorker();
        if (w === null) {
          runSync(p);
          return;
        }
        try {
          w.postMessage({ id: p.id, task });
        } catch {
          fail();
        }
      });
    },
    cancel: supersede,
    dispose(): void {
      supersede();
      dropWorker();
    },
  };
}
