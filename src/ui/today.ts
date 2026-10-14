// The calendar day the UI hands to the core (the core never reads a clock). Pure: the Date is passed in.

/** YYYY-MM-DD of a Date in UTC (the core measures profile age in whole UTC days). */
export function isoDayUtc(d: Date): string {
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
