// Web Worker entry: runs the E-series pair searches off the main thread. All logic is in pair-search.protocol.ts.
import { handleRequest, type SearchRequest, type SearchResponse } from './pair-search.protocol';

interface WorkerScope {
  onmessage: ((e: { readonly data: SearchRequest }) => void) | null;
  postMessage(message: SearchResponse): void;
}

const scope = self as unknown as WorkerScope;
scope.onmessage = (e) => {
  scope.postMessage(handleRequest(e.data));
};
