// Message protocol and pure task runner for the pair-search worker. Pure: no DOM, no globals, no timers.
// The worker (pair-search.worker.ts) and the synchronous fallback in the UI client both call `runTask`, so the
// two paths cannot give different answers. It imports only the core calculator and the core E-series search.
import { compute as computeFeedback, type Inputs as FeedbackInputs } from '../core/calculators/feedback-divider/calc';
import { bestPairs, type Pair, type SeriesName, type Topology } from '../core/eseries';
import type { CalcError, CalcOutcome, Result } from '../core/result';

/** One unit of search work. */
export type SearchTask =
  | { readonly kind: 'feedback'; readonly inputs: FeedbackInputs }
  | { readonly kind: 'e-pairs'; readonly target: number; readonly series: SeriesName; readonly topology: Topology; readonly count: number };

export type SearchReply =
  | { readonly kind: 'feedback'; readonly outcome: CalcOutcome }
  | { readonly kind: 'e-pairs'; readonly result: Result<Pair[], CalcError> };

/** Page to worker. The id ties a response to its request so a late response of a superseded request is dropped. */
export interface SearchRequest {
  readonly id: number;
  readonly task: SearchTask;
}

/** Worker to page. `failure` means the worker itself broke (the core never throws): the client then computes on the page. */
export type SearchResponse = { readonly id: number; readonly reply: SearchReply } | { readonly id: number; readonly failure: string };

export function runTask(task: SearchTask): SearchReply {
  if (task.kind === 'feedback') return { kind: 'feedback', outcome: computeFeedback(task.inputs) };
  return { kind: 'e-pairs', result: bestPairs(task.target, task.series, task.topology, task.count) };
}

/** Request in, response out. Never throws. */
export function handleRequest(req: SearchRequest): SearchResponse {
  try {
    return { id: req.id, reply: runTask(req.task) };
  } catch (e) {
    return { id: req.id, failure: e instanceof Error ? e.message : String(e) };
  }
}
