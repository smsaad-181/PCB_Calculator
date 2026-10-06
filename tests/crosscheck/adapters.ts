/**
 * Adapter map for the cross-check runner.
 *
 * Key = `calculator` id used in tests/crosscheck/*.json cases.
 * Value = function mapping the case `inputs` (as recorded, tool units as stated
 * in the record) to our calculator's outputs, keyed by the same names as the
 * record's `toolOutputs`.
 *
 * Empty in Phase 0: no calculators exist yet. A case with real (non-null) tool
 * data and no adapter here FAILS the runner, by design.
 */
export type CrosscheckInputs = Readonly<Record<string, unknown>>;
export type CrosscheckAdapter = (inputs: CrosscheckInputs) => Record<string, number>;

export const CROSSCHECK_ADAPTERS: Record<string, CrosscheckAdapter> = {};
