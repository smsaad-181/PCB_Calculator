// Presentation-only emphasis for resistor voltage on the divider pages. Pure: no DOM, no engineering math.
// The core decides what is a caution; this file only decides what is shown as an Important block.
import type { AccuracyClass } from '../../core/confidence';
import { formatResult } from '../../core/format-result';
import type { CalcResult } from '../../core/result';

/**
 * Presentation threshold, in volts: above this nominal voltage across one resistor, and with no rated working voltage
 * entered, the page shows an Important callout. It is a display trigger for emphasis only. It is not a fab limit, not a
 * standard limit and not a resistor rating, and it never enters a calculation.
 */
export const HIGH_VOLTAGE_DISPLAY_THRESHOLD_V = 100;

export interface DividerCallout {
  readonly heading: string;
  readonly text: string;
}

export const HIGH_VOLTAGE_HEADING = 'high voltage across one resistor: enter its rated working voltage';
export const FEEDBACK_HIGH_VOLTAGE_HEADING = 'high voltage across one resistor: check its rated working voltage';
export const OVER_RATING_HEADING = 'resistor voltage exceeds the rated working voltage you entered';

const NAMES = [
  ['voltage across r1', 'R1'],
  ['voltage across r2', 'R2'],
] as const;

function highest(raw: CalcResult): { readonly name: string; readonly value: CalcResult['results'][number] } | undefined {
  let best: { name: string; value: CalcResult['results'][number] } | undefined;
  for (const [key, name] of NAMES) {
    const r = raw.results.find((x) => x.name === key);
    if (r !== undefined && (best === undefined || r.value.si > best.value.value.si)) best = { name, value: r };
  }
  return best;
}

/**
 * Important blocks for the resistor-divider page.
 * - a core RESISTOR_VOLTAGE caution (voltage over the entered rating) becomes an Important block with the core message;
 * - no rating entered and a voltage above the presentation threshold: the "enter its rated working voltage" block.
 */
export function resistorDividerCallouts(raw: CalcResult, ratingEntered: boolean, accuracyClass: AccuracyClass): DividerCallout[] {
  const over = raw.warnings.find((w) => w.code === 'RESISTOR_VOLTAGE');
  if (over !== undefined) return [{ heading: OVER_RATING_HEADING, text: over.message }];
  if (ratingEntered) return [];
  const top = highest(raw);
  if (top === undefined || top.value.value.si <= HIGH_VOLTAGE_DISPLAY_THRESHOLD_V) return [];
  const shown = formatResult(top.value, { accuracyClass });
  return [
    {
      heading: HIGH_VOLTAGE_HEADING,
      text: `The nominal voltage across ${top.name} is ${shown}. No rated working voltage is entered, so it is not checked against any resistor rating. Enter the rated working voltage of the resistor you will use (from its datasheet) in the field provided.`,
    },
  ];
}

/** The feedback divider page has no rating field: the block asks the reader to check the datasheet. */
export function feedbackDividerCallouts(raw: CalcResult, accuracyClass: AccuracyClass): DividerCallout[] {
  const top = highest(raw);
  if (top === undefined || top.value.value.si <= HIGH_VOLTAGE_DISPLAY_THRESHOLD_V) return [];
  const shown = formatResult(top.value, { accuracyClass });
  return [
    {
      heading: FEEDBACK_HIGH_VOLTAGE_HEADING,
      text: `The nominal voltage across ${top.name} is ${shown}. This page has no rated-voltage field and does not check any resistor rating: take the rated working voltage of the resistor from its datasheet and compare it yourself.`,
    },
  ];
}
