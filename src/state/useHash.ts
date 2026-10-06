import { useEffect, useState } from 'preact/hooks';
import { parseHash, type ParsedHash } from './hash';

/** Subscribes to location.hash. Parsing is pure and never throws. `hash` is the raw string parsed. */
export function useParsedHash(): ParsedHash & { readonly hash: string } {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return { ...parseHash(hash), hash };
}
