import { useEffect, useState } from 'preact/hooks';
import { parseHash, type ParsedHash } from './hash';

/** Subscribes to location.hash. Parsing is pure and never throws. */
export function useParsedHash(): ParsedHash {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parseHash(hash);
}
