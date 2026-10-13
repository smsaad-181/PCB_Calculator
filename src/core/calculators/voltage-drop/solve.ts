/**
 * Pure DC solver for one source feeding one load through a series resistance R_path (S-019 (a), (b)). SI numbers in, SI
 * numbers out; no Quantity, no I/O. Re-usable by the path calculator (task 6).
 *
 * Constant-power load: R_path I^2 - V_s I + P = 0. The physical root is the low-current one,
 * I = (V_s - sqrt(V_s^2 - 4 R_path P)) / (2 R_path), written here as I = 2P / (V_s + sqrt(disc)), which is the same
 * number without cancellation. No real root (disc < 0) means P exceeds V_s^2 / (4 R_path): the load cannot be supplied.
 */
export type LoadKind = 'current' | 'power' | 'resistance' | 'voltage';

export interface LoadSpec {
  readonly kind: LoadKind;
  readonly si: number;
}

export interface PathSolution {
  readonly current: number;
  readonly loadVoltage: number;
  readonly loadPower: number;
  readonly loadResistance: number;
  /** Maximum power a load could draw through this path from this source: V_s^2 / (4 R_path). */
  readonly maxDeliverablePower: number;
}

export type SolveOutcome = { readonly ok: true; readonly value: PathSolution } | { readonly ok: false; readonly reason: string; readonly maxDeliverablePower: number };

const g = (x: number): string => String(Number(x.toPrecision(4)));

/** Solve the self-consistent state. rPath and vs must be finite and > 0 (callers guard); returns a reason instead of numbers when infeasible. */
export function solvePath(vs: number, rPath: number, load: LoadSpec): SolveOutcome {
  const pMax = (vs * vs) / (4 * rPath);
  let current: number;
  let loadVoltage: number;
  switch (load.kind) {
    case 'current':
      current = load.si;
      loadVoltage = vs - current * rPath;
      if (!(loadVoltage > 0)) {
        return { ok: false, maxDeliverablePower: pMax, reason: `The drop ${g(current * rPath)} V at ${g(current)} A is not below the source voltage ${g(vs)} V: the load cannot be supplied.` };
      }
      break;
    case 'resistance':
      current = vs / (rPath + load.si);
      loadVoltage = current * load.si;
      break;
    case 'voltage':
      if (!(load.si < vs)) {
        return { ok: false, maxDeliverablePower: pMax, reason: `The load voltage ${g(load.si)} V must be below the source voltage ${g(vs)} V.` };
      }
      current = (vs - load.si) / rPath;
      loadVoltage = load.si;
      break;
    case 'power': {
      const disc = vs * vs - 4 * rPath * load.si;
      if (disc < 0) {
        return {
          ok: false,
          maxDeliverablePower: pMax,
          reason: `No real solution: the load power ${g(load.si)} W exceeds the maximum power this source and path can deliver, ${g(pMax)} W (V_source^2 / (4 R_path)); the load cannot be supplied.`,
        };
      }
      current = (2 * load.si) / (vs + Math.sqrt(disc));
      loadVoltage = load.si / current;
      break;
    }
  }
  return {
    ok: true,
    value: { current, loadVoltage, loadPower: loadVoltage * current, loadResistance: loadVoltage / current, maxDeliverablePower: pMax },
  };
}
