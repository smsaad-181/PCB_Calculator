import { useEffect, useRef, useState } from 'preact/hooks';
import type { SearchReply, SearchTask } from '../workers/pair-search.protocol';
import { createSearchClient, type SearchClient } from './search-client';

export type SearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'searching' }
  | { readonly status: 'done'; readonly reply: SearchReply; readonly via: 'worker' | 'sync' };

/**
 * Runs a search task off the main thread (with a synchronous fallback) and reports its state.
 * Pass the same task object while the inputs are unchanged (memoise it): a new object starts a new search and cancels
 * the previous one. A reply is only ever returned for the task it answers, so a stale result is never shown.
 */
export function useSearch(task: SearchTask | null): SearchState {
  const client = useRef<SearchClient | null>(null);
  const [done, setDone] = useState<{ readonly task: SearchTask; readonly reply: SearchReply; readonly via: 'worker' | 'sync' } | null>(null);

  useEffect(() => {
    if (task === null) {
      client.current?.cancel();
      return;
    }
    let live = true;
    client.current ??= createSearchClient();
    void client.current.search(task).then((o) => {
      if (live && o.status === 'done') setDone({ task, reply: o.reply, via: o.via });
    });
    return () => {
      live = false;
    };
  }, [task]);

  useEffect(
    () => () => {
      client.current?.dispose();
      client.current = null;
    },
    [],
  );

  if (task === null) return { status: 'idle' };
  if (done !== null && done.task === task) return { status: 'done', reply: done.reply, via: done.via };
  return { status: 'searching' };
}
