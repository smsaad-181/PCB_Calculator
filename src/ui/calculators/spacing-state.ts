// Hash-state helpers shared by the three safety spacing pages. Pure. Nothing here has a default for a mandatory input:
// an absent or unrecognised key means "not entered" (the core then lists it as missing). Imported tables are never in the link.
import { COATING_CREDITS } from '../../core/spacing/gating';
import type { CoatingCredit } from '../../core/spacing/gating';
import { MAX_FIELD_CHARS } from '../components/view';
import { hasKey, readChoice, readText } from './circuit-view';
import { VOLTAGE_DEFAULTS, isBasis, isShape, isVoltageMode, type VoltageState } from './spacing-common.vm';

export const MAX_EDITION_CHARS = 200;
export const isCoating = (v: string): v is CoatingCredit => (COATING_CREDITS as readonly string[]).includes(v);

/** Writes the non-default entries of the voltage block. */
export function voltageToHash(s: VoltageState, out: Record<string, string>): void {
  if (s.voltageMode !== VOLTAGE_DEFAULTS.voltageMode) out['vm'] = s.voltageMode;
  const put = (k: string, v: string): void => {
    if (v.trim() !== '') out[k] = v.slice(0, MAX_FIELD_CHARS);
  };
  put('vp', s.peak);
  put('vr', s.rms);
  put('wv', s.waveValue);
  if (s.shape !== '') out['ws'] = s.shape;
  if (s.basis !== '') out['wb'] = s.basis;
}

export function voltageFromHash(h: Readonly<Record<string, string>>, notices: string[]): VoltageState {
  let voltageMode = VOLTAGE_DEFAULTS.voltageMode;
  if (hasKey(h, 'vm')) {
    const v = h['vm'] ?? '';
    if (isVoltageMode(v)) voltageMode = v;
    else notices.push('The working voltage entry mode was not recognised: direct entry is used instead.');
  }
  return {
    voltageMode,
    peak: readText(h, 'vp', 'Peak working voltage', notices),
    rms: readText(h, 'vr', 'RMS working voltage', notices),
    shape: readChoice(h, 'ws', isShape, 'The waveform shape was not recognised and is not chosen.', notices),
    basis: readChoice(h, 'wb', isBasis, 'The waveform value basis was not recognised and is not chosen.', notices),
    waveValue: readText(h, 'wv', 'Waveform value', notices),
  };
}

export function editionToHash(edition: string, out: Record<string, string>): void {
  if (edition.trim() !== '') out['ed'] = edition.slice(0, MAX_EDITION_CHARS);
}
export const editionFromHash = (h: Readonly<Record<string, string>>, notices: string[]): string => readText(h, 'ed', 'The data set edition', notices, MAX_EDITION_CHARS);

export function coatingFromHash(h: Readonly<Record<string, string>>, notices: string[]): CoatingCredit {
  if (!hasKey(h, 'cc')) return 'none';
  const v = h['cc'] ?? '';
  if (isCoating(v)) return v;
  notices.push('The coating credit choice was not recognised: no coating credit is used instead.');
  return 'none';
}

export const flagToHash = (v: boolean, key: string, out: Record<string, string>): void => {
  if (v) out[key] = '1';
};
export const flagFromHash = (h: Readonly<Record<string, string>>, key: string): boolean => h[key] === '1';
