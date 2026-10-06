/** Typed errors of the units engine. Pure TypeScript, no DOM. */

export class UnitsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnitsError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** NaN, +/-Infinity, non-integer where an integer is required, out of range, or overflow (rule 10). */
export class InvalidValueError extends UnitsError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidValueError';
  }
}

/** Operation mixes incompatible dimensions (including absolute temperature vs temperature difference). */
export class DimensionError extends UnitsError {
  constructor(message: string) {
    super(message);
    this.name = 'DimensionError';
  }
}

/** Unknown or malformed unit string. */
export class UnitError extends UnitsError {
  constructor(message: string) {
    super(message);
    this.name = 'UnitError';
  }
}
