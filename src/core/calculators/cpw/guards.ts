import type { CalcError, Result } from '../../result';
import { validateCoplanar } from '../cpw-shared';
import type { CoplanarValid } from '../cpw-shared';

export type ValidInputs = CoplanarValid;

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  return validateCoplanar(raw, 'length (substrate thickness; there is no lower ground plane in this model)');
}
