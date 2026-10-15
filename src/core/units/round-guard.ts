/**
 * Shared float-noise guard for display rounding. A scaled value t within ROUND_GUARD (4 ulp, relative) of a rounding
 * boundary is taken as exactly on it, so an exact decimal that arrived as 64.00000000000001 prints as 64. Anything
 * larger than that noise rounds the conservative way as before. Pure, allocation-free.
 */
export const ROUND_GUARD = 4 * Number.EPSILON;

/** ceil(t), except t within the guard of an integer is that integer. */
export function ceilGuarded(t: number): number {
  const r = Math.round(t);
  return Math.abs(t - r) <= ROUND_GUARD * Math.abs(t) ? r : Math.ceil(t);
}

/** floor(t), except t within the guard of an integer is that integer. */
export function floorGuarded(t: number): number {
  const r = Math.round(t);
  return Math.abs(t - r) <= ROUND_GUARD * Math.abs(t) ? r : Math.floor(t);
}

/**
 * v with a value within the guard of a round-to-nearest tie at `dec` decimals moved just past the tie, away from zero
 * (the half-away-from-zero result of the exact decimal), so toFixed/toPrecision cannot go either way on noise.
 */
export function tieNudged(v: number, dec: number): number {
  const s = dec >= 0 ? v * 10 ** dec : v / 10 ** -dec;
  if (!Number.isFinite(s)) return v;
  const a = Math.abs(s);
  const half = Math.floor(a) + 0.5;
  return Math.abs(a - half) <= ROUND_GUARD * a ? v * (1 + 16 * Number.EPSILON) : v;
}
