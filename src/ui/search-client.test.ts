import { describe, expect, it } from 'vitest';
import { q, DIM } from '../core/units';
import { handleRequest, runTask, type SearchReply, type SearchRequest, type SearchResponse, type SearchTask } from '../workers/pair-search.protocol';
import clientSrc from './search-client.ts?raw';
import workerSrc from '../workers/pair-search.worker.ts?raw';
import protocolSrc from '../workers/pair-search.protocol.ts?raw';
import { createSearchClient, defaultWorkerFactory, type WorkerLike } from './search-client';

const FEEDBACK: SearchTask = { kind: 'feedback', inputs: { vref: q(0.8, DIM.VOLTAGE), vout: q(3.3, DIM.VOLTAGE), series: 'E24', pairs: 3 } };
const EPAIRS: SearchTask = { kind: 'e-pairs', target: 0.25, series: 'E12', topology: 'divider-ratio', count: 3 };
const strip = (t: string): string => t.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  posted: SearchRequest[] = [];
  terminated = false;
  postMessage(r: SearchRequest): void {
    this.posted.push(r);
  }
  terminate(): void {
    this.terminated = true;
  }
  /** Answer a request the way the real worker would. */
  answer(r: SearchRequest): void {
    this.onmessage?.({ data: handleRequest(r) });
  }
  say(m: SearchResponse): void {
    this.onmessage?.({ data: m });
  }
}
const factoryOf = (made: FakeWorker[]) => () => {
  const w = new FakeWorker();
  made.push(w);
  return w;
};

describe('protocol', () => {
  it('runs the feedback calculator and the core pair search, and survives structured cloning', () => {
    const a = runTask(FEEDBACK);
    expect(a.kind).toBe('feedback');
    if (a.kind === 'feedback') {
      expect(a.outcome.ok).toBe(true);
      const cloned = structuredClone(a);
      expect(cloned).toEqual(a);
    }
    const b = runTask(EPAIRS);
    expect(b.kind === 'e-pairs' && b.result.ok && b.result.value.length).toBe(3);
  });
  it('handleRequest echoes the id and never throws', () => {
    expect(handleRequest({ id: 7, task: EPAIRS })).toMatchObject({ id: 7 });
    const bad = handleRequest({ id: 8, task: { kind: 'feedback', inputs: null as never } });
    expect('reply' in bad || 'failure' in bad).toBe(true);
  });
});

describe('client with a worker', () => {
  it('posts a request with an id and resolves with the worker reply', async () => {
    const made: FakeWorker[] = [];
    const c = createSearchClient(factoryOf(made));
    const p = c.search(FEEDBACK);
    expect(made).toHaveLength(1);
    const req = made[0]?.posted[0] as SearchRequest;
    expect(req.task).toBe(FEEDBACK);
    made[0]?.answer(req);
    const o = await p;
    expect(o.status === 'done' && o.via).toBe('worker');
    c.dispose();
  });
  it('reuses one worker for consecutive requests', async () => {
    const made: FakeWorker[] = [];
    const c = createSearchClient(factoryOf(made));
    for (let i = 0; i < 3; i++) {
      const p = c.search(EPAIRS);
      const w = made[0] as FakeWorker;
      w.answer(w.posted[i] as SearchRequest);
      await p;
    }
    expect(made).toHaveLength(1);
    expect(made[0]?.terminated).toBe(false);
    c.dispose();
    expect(made[0]?.terminated).toBe(true);
  });
  it('a newer request cancels the older one, terminates the busy worker and ignores its late answer', async () => {
    const made: FakeWorker[] = [];
    const c = createSearchClient(factoryOf(made));
    const first = c.search(FEEDBACK);
    const firstReq = made[0]?.posted[0] as SearchRequest;
    const second = c.search(EPAIRS);
    expect((await first).status).toBe('cancelled');
    expect(made[0]?.terminated).toBe(true);
    expect(made).toHaveLength(2);
    // The old worker answers late: nothing happens.
    made[0]?.answer(firstReq);
    const secondReq = made[1]?.posted[0] as SearchRequest;
    expect(secondReq.id).toBeGreaterThan(firstReq.id);
    made[1]?.answer(secondReq);
    const o = await second;
    expect(o.status).toBe('done');
    if (o.status === 'done') expect(o.reply.kind).toBe('e-pairs');
    c.dispose();
  });
  it('a response with another id never resolves the current request', async () => {
    const made: FakeWorker[] = [];
    const c = createSearchClient(factoryOf(made));
    const p = c.search(EPAIRS);
    const req = made[0]?.posted[0] as SearchRequest;
    made[0]?.say({ id: req.id + 100, reply: runTask(EPAIRS) });
    let settled = false;
    void p.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    made[0]?.answer(req);
    expect((await p).status).toBe('done');
    c.dispose();
  });
  it('cancel resolves the request as cancelled and stops the worker', async () => {
    const made: FakeWorker[] = [];
    const c = createSearchClient(factoryOf(made));
    const p = c.search(FEEDBACK);
    c.cancel();
    expect((await p).status).toBe('cancelled');
    expect(made[0]?.terminated).toBe(true);
    c.dispose();
  });
  it('a worker error falls back to the synchronous path for this and later requests', async () => {
    const made: FakeWorker[] = [];
    const c = createSearchClient(factoryOf(made));
    const p = c.search(EPAIRS);
    made[0]?.onerror?.(new Error('boom'));
    const o = await p;
    expect(o.status === 'done' && o.via).toBe('sync');
    const o2 = await c.search(EPAIRS);
    expect(o2.status === 'done' && o2.via).toBe('sync');
    expect(made).toHaveLength(1);
  });
  it('a worker failure message also falls back to the page', async () => {
    const made: FakeWorker[] = [];
    const c = createSearchClient(factoryOf(made));
    const p = c.search(EPAIRS);
    const req = made[0]?.posted[0] as SearchRequest;
    made[0]?.say({ id: req.id, failure: 'broken' });
    const o = await p;
    expect(o.status === 'done' && o.via).toBe('sync');
  });
});

describe('client without a worker', () => {
  it('computes synchronously when the factory gives nothing, and the answer equals the direct core answer', async () => {
    const c = createSearchClient(() => null);
    const o = await c.search(FEEDBACK);
    expect(o.status === 'done' && o.via).toBe('sync');
    if (o.status === 'done') expect(o.reply).toEqual(runTask(FEEDBACK) satisfies SearchReply);
  });
  it('a factory that throws is the same as none', async () => {
    const c = createSearchClient(() => {
      throw new Error('no worker');
    });
    const o = await c.search(EPAIRS);
    expect(o.status === 'done' && o.via).toBe('sync');
  });
  it('a newer request replaces a pending synchronous one', async () => {
    const c = createSearchClient(() => null);
    const a = c.search(FEEDBACK);
    const b = c.search(EPAIRS);
    expect((await a).status).toBe('cancelled');
    expect((await b).status).toBe('done');
  });
  it('the default factory finds no Worker under node', () => {
    expect(defaultWorkerFactory()).toBeNull();
  });
});

describe('source scans', () => {
  it('the worker entry imports only the protocol; the protocol imports only the core', () => {
    const w = strip(workerSrc);
    expect([...w.matchAll(/from '([^']+)'/g)].map((m) => m[1])).toEqual(['./pair-search.protocol']);
    const p = strip(protocolSrc);
    for (const m of p.matchAll(/from '([^']+)'/g)) expect(m[1], String(m[1])).toMatch(/^\.\.\/core\//);
    expect(p).not.toMatch(/\bwindow\b|\bdocument\b|fetch\(|setTimeout|Date\.now|Math\.random/);
  });
  it('the client uses the literal module-worker form Vite bundles, with no blob and no network', () => {
    const c = strip(clientSrc);
    expect(c).toContain("new Worker(new URL('../workers/pair-search.worker.ts', import.meta.url), { type: 'module' })");
    expect(c).not.toMatch(/blob:|createObjectURL|fetch\(|XMLHttpRequest|importScripts|eval\(/);
  });
});
