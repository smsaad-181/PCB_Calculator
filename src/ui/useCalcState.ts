import { useEffect, useRef, useState } from 'preact/hooks';
import { parseHash, serializeHash, type HashState, type Route } from '../state/hash';
import { useRafValue } from './hooks';

export interface LoadedState<S> {
  readonly state: S;
  /** Human-readable notices for settings that were not recognised and were replaced by defaults. */
  readonly notices: readonly string[];
}

interface Options<S> {
  readonly id: string;
  readonly defaultState: S;
  readonly fromHash: (h: HashState) => LoadedState<S>;
  readonly toHash: (s: S) => Record<string, string>;
  /** Called with the new state when the URL is edited while the page is open (for example to open a collapsed section). */
  readonly onExternalLoad?: (s: S) => void;
}

/**
 * Form state that lives in the URL hash. Reads the hash once on load (anything unusable becomes the defaults plus a
 * notice), writes it back one animation frame after the last edit with replaceState (no history entries), and
 * re-reads it when the user edits or pastes the URL while the page is open.
 */
export function useCalcState<S>(o: Options<S>) {
  const route: Route = { name: 'calc', id: o.id };
  const [init] = useState(() => o.fromHash(parseHash(window.location.hash).state));
  const [state, setState] = useState<S>(init.state);
  const [notices, setNotices] = useState<readonly string[]>(init.notices);
  const applied = useRafValue(state);
  const pending = applied !== state;
  const lastHash = useRef<string | null>(null);

  useEffect(() => {
    const h = serializeHash(route, o.toHash(applied));
    lastHash.current = h;
    if (window.location.hash !== h) window.history.replaceState(null, '', h);
  }, [applied]);

  useEffect(() => {
    const on = () => {
      if (window.location.hash === lastHash.current) return;
      const p = parseHash(window.location.hash);
      if (p.route.name !== 'calc' || p.route.id !== o.id) return;
      const loaded = o.fromHash(p.state);
      setState(loaded.state);
      setNotices(loaded.notices);
      o.onExternalLoad?.(loaded.state);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const patch = (p: Partial<S>) => setState((s) => ({ ...s, ...p }));
  const reset = () => {
    setState(o.defaultState);
    setNotices([]);
  };
  return { state, setState, applied, pending, notices, setNotices, patch, reset };
}
