// Import help for the safety tables: plain-language format notes per table and the FAKE worked example. Lazy-loaded by the spacing pages
// only (never part of a route's first load). Selector lists come from the core specs, so this text cannot drift from the validator.
// Every number in the example is a made-up value that exists for the file format only.
import { COATING_APPLIES_TO, RULE_IDS, SCHEMA_ID, SELECTOR_VALUES, SET_SCHEMA_ID, TABLE_SPECS, type TableId } from '../../core/spacing/tables';

export const FAKE_LABEL = 'FAKE, for format only, not a standard value';
export const EXAMPLE_FILE_NAME = 'safety-tables-worked-example-FAKE.json';

const sel = (id: TableId): string =>
  TABLE_SPECS[id].selectors.map((s) => `${s} (${(SELECTOR_VALUES[s] ?? []).join(' | ')})`).join('; ') || 'none (one column with empty selectors)';

export const COMMON_HELP: readonly string[] = [
  `One table per object, or a bundle { "schema": "${SET_SCHEMA_ID}", "schemaVersion": 1, "tables": [...] }. A table has "schema": "${SCHEMA_ID}", "schemaVersion": 1, "table" (T1 to T8), standard, source, edition, clause, tableNumber, ledgerIds, status (UNVERIFIED while you enter), entered (true), bannerRequired (true), enteredBy, enteredDate (YYYY-MM-DD, not in the future), units { row, cell }, interpolation ("none", or "linear" with interpolationSource), notes.`,
  'Grid tables (T1 to T5, T8): rows [{ key, value }]; columns [{ key, selectors }]; cells [{ row, col, value, unit, source, printed (as printed), enteredBy, enteredDate }] with optional page and checkedBy + checkedDate (both or neither). Leave out any value the standard does not give; nothing is read as zero. A request is read from the first row at or above it, so give each row its own value (the upper bound of a band). Above the last row: OUT OF TABLE RANGE, except T8 with one { "perVolt": true } row (cells in mm/V).',
  'Edition: the same text, letter for letter, in every table a calculation uses and in the page field "Data set edition".',
  'VERIFIED claim: status "VERIFIED", bannerRequired false, verifiedBy, verifiedDate and checkedBy + checkedDate on every record. verifiedBy must be a second person: different (ignoring case and spaces) from the table enteredBy and every record enteredBy and checkedBy, else the import is refused ("needs a second person"). The app cannot verify values; it passes the claim on.',
];

export const TABLE_HELP: readonly { readonly id: TableId; readonly text: string }[] = [
  { id: 'T1', text: `Rows: supply voltage (V). Cells: impulse voltage (V or kV). Selectors: ${sel('T1')}.` },
  { id: 'T2', text: `Rows: impulse voltage. Cells: clearance. Selectors: ${sel('T2')}.` },
  { id: 'T3', text: `Rows: steady-state or recurring peak voltage. Cells: clearance. Selectors: ${sel('T3')}.` },
  { id: 'T4', text: `Rows: altitude (m or km). Cells: factor, unit "1", at least 1. Selectors: ${sel('T4')}.` },
  { id: 'T5', text: `Rows: RMS voltage (V). Cells: creepage. Selectors: ${sel('T5')}.` },
  { id: 'T6', text: '"groups" [{ group (I | II | IIIa | IIIb), ctiMin and/or ctiMax with minInclusive / maxInclusive, unit "V", source, printed, enteredBy, enteredDate }].' },
  {
    id: 'T7',
    text: `"rules" [{ rule, clauseText, source, enteredBy, enteredDate, ... }] from ${RULE_IDS.join(', ')}. Multipliers: value at least 1, unit "1". reinforced-clearance: mode "next-preferred-impulse-step" with "series" (preferred impulse voltages, strictly increasing, unit V or kV, no value; the required impulse must be a series value) or mode "multiplier". reinforced-clearance-steady-state: mode "multiplier", needed when T3 is filled. scope-max-frequency (Hz, kHz, MHz): needed when the frequency is above 0. coating-credit: coatingType type1 or type2, appliesTo (${COATING_APPLIES_TO.join(' | ')}, default creepage), value above 0 up to 1; used only if T7 is VERIFIED.`,
  },
  { id: 'T8', text: `Rows: voltage (band upper bounds) and one perVolt row. Cells: spacing. Selectors: ${sel('T8')}. Also "elevationBreakpoint" { value, unit m | km, source, printed, enteredBy, enteredDate }.` },
];

const D = '2000-01-01';
const who = { enteredBy: 'Example Person A', enteredDate: D };
const prov = { source: FAKE_LABEL, printed: 'FAKE', ...who };
const head = {
  schema: SCHEMA_ID,
  schemaVersion: 1,
  standard: 'IEC 60664-1',
  source: FAKE_LABEL,
  edition: 'FAKE-EDITION-0',
  clause: 'FAKE',
  tableNumber: 'FAKE',
  status: 'UNVERIFIED',
  entered: true,
  bannerRequired: true,
  verifiedBy: '',
  verifiedDate: '',
  notes: [FAKE_LABEL],
  ...who,
};

/** A tiny two-table bundle of made-up numbers: it shows the format and nothing else. */
export function exampleJson(): string {
  const rule = { clauseText: FAKE_LABEL, source: FAKE_LABEL, ...who };
  return JSON.stringify(
    {
      schema: SET_SCHEMA_ID,
      schemaVersion: 1,
      tables: [
        {
          ...head,
          table: 'T2',
          ledgerIds: ['S-030b', 'S-030d'],
          units: { row: 'kV', cell: 'mm' },
          rows: [
            { key: 'row-a', value: 1.11 },
            { key: 'row-b', value: 2.22 },
          ],
          columns: [{ key: 'col-a', selectors: { pollutionDegree: 2, fieldCondition: 'inhomogeneous' } }],
          cells: [
            { row: 'row-a', col: 'col-a', value: 1.23, unit: 'mm', ...prov },
            { row: 'row-b', col: 'col-a', value: 4.56, unit: 'mm', ...prov },
          ],
        },
        {
          ...head,
          table: 'T7',
          ledgerIds: ['S-030a', 'S-030f', 'S-031a'],
          units: { row: 'V', cell: '1' },
          rules: [
            { rule: 'reinforced-clearance', mode: 'next-preferred-impulse-step', series: [1.11, 2.22, 3.33], unit: 'kV', ...rule },
            { rule: 'scope-max-frequency', value: 7.77, unit: 'kHz', ...rule },
          ],
        },
      ],
    },
    null,
    2,
  );
}
