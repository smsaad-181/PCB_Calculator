import { useEffect, useState } from 'preact/hooks';
import { isoDayUtc } from './today';

/** Today as YYYY-MM-DD (UTC), read once when the page mounts. The only place the UI reads the clock; the core receives it as a value. */
export function useToday(): string {
  const [t] = useState(() => isoDayUtc(new Date()));
  return t;
}

/**
 * Returns `value` one animation frame after it last changed (requestAnimationFrame debounce). Rapid changes inside
 * one frame collapse into the last one. The caller compares the returned value with the live one to know a newer
 * input is still waiting, so a stale result is never presented as final.
 */
export function useRafValue<T>(value: T): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return v;
}
