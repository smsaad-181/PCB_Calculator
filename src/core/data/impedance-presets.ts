import type { CalcError, Result } from '../result';
import { DIM, q, sameDim } from '../units';
import type { Quantity } from '../units';
import type { LedgerStatus } from './ledger';

/**
 * Protocol impedance presets (Phase 2 part B). Source: docs/research/impedance-presets-and-data.md and
 * docs/sources/notes/impedance-presets-and-data.md, retrieved 2026-10-18 (ledger rows S-026, S-026a, S-026c, S-026d, S-026e,
 * S-026f). Every value is a DESIGN TARGET taken from an application note or layout guide; none of the interface standards was
 * read, so no preset claims that anything satisfies a standard (CLAUDE.md rule 2). A preset sets a target and an optional
 * tolerance band for a comparison only; it never changes er, Df, geometry or the stackup.
 *
 * Decisions applied (docs/validation/OPEN_RISKS.md, Phase 2 research decisions):
 *  Q-10 USB 2.0 90 ohm is offered with NO default tolerance: the sources' stated values (15 %, 10 %) are separate labelled
 *       entries and the user chooses one;
 *  Q-11 USB 3.x SuperSpeed is NOT offered (S-026b CONFLICT: 90 or 95 ohm, +/-7 % or +/-7 ohm or +/-5 %, device-specific);
 *  Q-12/Q-13 CAN and RS-485 are informational termination/cable notes, not controlled-impedance PCB targets; RS-485 UNVERIFIED;
 *  Q-14 single-source, device-family-specific presets (PCIe, HDMI, SATA, SGMII, MIPI CSI, eUSB2, DisplayPort) are NOT offered.
 *  LVDS has no published PCB tolerance, so its tolerance list is empty: none is invented.
 * Each entry's `status` mirrors the ledger status of its `ledgerId`; src/core/data/impedance-presets.test.ts fails on drift.
 */

export const DESIGN_TARGET_DISCLAIMER = 'Design target, not a compliance statement: taken from application notes and layout guides; the interface standard was not read.';

export type PresetKind = 'differential-target' | 'termination-note';
export type PresetScopeKind = 'pcb-trace' | 'cable-and-termination';

export interface PresetSource {
  /** Document, revision or date, and section as read. */
  readonly document: string;
  /** The wording of the source as recorded in the research note. */
  readonly quote: string;
}

/** One tolerance the sources state. Never defaulted: the user selects one by id. */
export interface ToleranceOption {
  readonly id: string;
  readonly value: number;
  readonly unit: 'percent';
  readonly source: string;
  readonly ledgerId: string;
  readonly status: LedgerStatus;
}

/** A range shown for information only (an interconnect or termination range, not a PCB tolerance). */
export interface InformationalRange {
  readonly label: string;
  readonly minOhm: number;
  readonly maxOhm: number;
  readonly scope: string;
  readonly source: string;
  readonly ledgerId: string;
  readonly status: LedgerStatus;
}

export interface ImpedancePreset {
  readonly id: string;
  readonly label: string;
  readonly interface: string;
  readonly kind: PresetKind;
  readonly nominalOhm: number;
  readonly ledgerId: string;
  readonly status: LedgerStatus;
  readonly scopeKind: PresetScopeKind;
  /** What the value applies to, as the source states it: PCB trace, cable or termination resistor. */
  readonly scope: string;
  readonly sources: readonly PresetSource[];
  readonly tolerances: readonly ToleranceOption[];
  readonly info: readonly InformationalRange[];
  readonly note: string;
  readonly disclaimer: string;
  readonly retrieved: string;
}

const RETRIEVED = '2026-10-18';

function deepFreeze<T extends object>(o: T): T {
  for (const v of Object.values(o) as unknown[]) if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) deepFreeze(v);
  return Object.freeze(o);
}

const PRESETS: readonly ImpedancePreset[] = [
  {
    id: 'usb2-hs-90',
    label: 'USB 2.0 high-speed DP/DM, 90 ohm differential',
    interface: 'USB 2.0 high-speed',
    kind: 'differential-target',
    nominalOhm: 90,
    ledgerId: 'S-026',
    status: 'VERIFIED',
    scopeKind: 'pcb-trace',
    scope:
      'PCB trace differential impedance of the high-speed DP/DM pair. The sources give it as a PCB layout parameter (a device-specific row in the TI tables); they do not say it applies to the cable or the connector.',
    sources: [
      { document: 'TI SPRAAR7J, High-Speed Interface Layout Guidelines (Nov 2018, rev. Feb 2023), Appendix A tables A-1 to A-8', quote: 'USB2.0 DP/DM pair differential impedance 81 90 99 (MIN TYP MAX, ohm)' },
      { document: 'NXP AN13462, PTN3222 layout guidelines, Rev. 1.0 (13 Dec 2021), section 2.5 and Table 2', quote: 'USB2.0 specification specifies 90 ohm +/- 15 %' },
      { document: 'Prolific AN-27220901, PL2731 PCB Layout Guide, Rev. 1.0 (27 Sep 2022), section 2', quote: 'differential impedance of 90+/-15% ohms' },
    ],
    tolerances: [
      {
        id: 'usb2-tol-15',
        value: 15,
        unit: 'percent',
        source: 'NXP AN13462 Rev. 1.0 section 2.5 ("USB2.0 specification specifies 90 ohm +/- 15 %", attributed by NXP to the USB 2.0 specification) and Prolific AN-27220901 Rev. 1.0 section 2 ("90+/-15% ohms")',
        ledgerId: 'S-026a',
        status: 'CONFLICT',
      },
      {
        id: 'usb2-tol-10',
        value: 10,
        unit: 'percent',
        source: 'TI SPRAAR7J (rev. Feb 2023) Appendix A device layout tables: 81 / 90 / 99 ohm (MIN / TYP / MAX), that is +/-10 %; a device layout recommendation, not necessarily a different reading of the specification',
        ledgerId: 'S-026a',
        status: 'CONFLICT',
      },
    ],
    info: [],
    note: 'The 90 ohm target agrees across three manufacturers (S-026). The tolerance sources disagree (S-026a CONFLICT): choose one and state which. The USB 2.0 specification text was not read.',
    disclaimer: DESIGN_TARGET_DISCLAIMER,
    retrieved: RETRIEVED,
  },
  {
    id: 'ethernet-mdi-100',
    label: 'Ethernet 10/100/1000BASE-T MDI, 100 ohm differential +/-10 %',
    interface: 'Ethernet 10/100/1000BASE-T',
    kind: 'differential-target',
    nominalOhm: 100,
    ledgerId: 'S-026f',
    status: 'VERIFIED',
    scopeKind: 'pcb-trace',
    scope:
      'PCB differential pairs of the MDI from the PHY through the magnetics to the RJ45 connector. TI notes the MDI impedance "may need to be adjusted to match the impedance of the cable"; Renesas covers 10BASE-T and 100BASE-TX only, TI also 1000BASE-T.',
    sources: [
      { document: 'TI SNLA387, Ethernet PHY PCB Design Layout Checklist (June 2021)', quote: 'a 100 Ohm differential with a +/- 10% control' },
      { document: 'Renesas R19AN0014ED0102, Industrial Ethernet PHY layout recommendations, Rev. 1.2 (1 July 2013), section 3.1', quote: 'differential impedance of 100 ohm +/-10% and with an impedance of 50 ohm related to GND' },
    ],
    tolerances: [
      {
        id: 'ethernet-tol-10',
        value: 10,
        unit: 'percent',
        source: 'TI SNLA387 (June 2021) and Renesas R19AN0014ED0102 Rev. 1.2 (both state +/-10 %)',
        ledgerId: 'S-026f',
        status: 'VERIFIED',
      },
    ],
    info: [],
    note: 'Target and tolerance agree across the two sources read (S-026f). IEEE 802.3 was not read.',
    disclaimer: DESIGN_TARGET_DISCLAIMER,
    retrieved: RETRIEVED,
  },
  {
    id: 'lvds-100',
    label: 'LVDS, 100 ohm differential (nominal)',
    interface: 'LVDS',
    kind: 'differential-target',
    nominalOhm: 100,
    ledgerId: 'S-026c',
    status: 'VERIFIED',
    scopeKind: 'pcb-trace',
    scope:
      'PCB trace differential impedance near 100 ohm (TI: for PCB traces longer than 2 cm) and a 100 ohm termination resistor between the driver outputs. The sources give cable and termination ranges, not a PCB trace tolerance.',
    sources: [
      { document: 'TI SLLA014A, Low-Voltage Differential Signaling (LVDS) Design Notes (2000)', quote: 'maintain a controlled differential impedance near 100 ohm' },
      { document: 'National Semiconductor AN-971 (July 1998), now TI SNLA165', quote: 'single 100 ohm termination between the driver outputs' },
    ],
    tolerances: [],
    info: [
      {
        label: 'interconnect differential impedance band',
        minOhm: 90,
        maxOhm: 130,
        scope: 'interconnect differential characteristic impedance at any cut point, as TI SLLA014A states it; not a PCB trace tolerance',
        source: 'TI SLLA014A (2000): "differential characteristic impedance should be 90 ohm to 130 ohm"',
        ledgerId: 'S-026c',
        status: 'VERIFIED',
      },
      {
        label: 'termination resistor range',
        minOhm: 90,
        maxOhm: 120,
        scope: 'termination resistor value range, as National AN-1035 states it; not a PCB trace tolerance',
        source: 'National Semiconductor AN-1035 (Aug 1996): "require a termination resistor with a range of 90 ohm to 120 ohm"',
        ledgerId: 'S-026c',
        status: 'VERIFIED',
      },
    ],
    note: 'Nominal only: no PCB trace tolerance is published in the sources read, so none is offered and none is invented (S-026c). TIA/EIA-644 was not read.',
    disclaimer: DESIGN_TARGET_DISCLAIMER,
    retrieved: RETRIEVED,
  },
  {
    id: 'can-hs-120',
    label: 'CAN high-speed, 120 ohm cable and termination (note)',
    interface: 'CAN (ISO 11898-2 high-speed)',
    kind: 'termination-note',
    nominalOhm: 120,
    ledgerId: 'S-026d',
    status: 'VERIFIED',
    scopeKind: 'cable-and-termination',
    scope:
      'Characteristic impedance of the twisted-pair bus cable and the 120 ohm termination (a terminating resistor) at each bus end. The PCB part of a CAN node is usually short.',
    sources: [
      { document: 'TI SLLA270, Controller Area Network Physical Layer Requirements (Jan 2008), section 4', quote: 'twisted-pair with a 120-ohm characteristic impedance; terminated at both ends with 120-ohm resistors' },
      { document: 'Microchip AN228, A CAN Physical Layer Discussion, DS00228A (2002, preliminary)', quote: 'nominal characteristic line impedance of 120 ohm' },
    ],
    tolerances: [],
    info: [],
    note: 'Informational termination and cable note, not a PCB controlled-impedance requirement and not a tight PCB impedance target. No tolerance is published in the sources read. ISO 11898-2 was not read.',
    disclaimer: DESIGN_TARGET_DISCLAIMER,
    retrieved: RETRIEVED,
  },
  {
    id: 'rs485-120',
    label: 'RS-485, 120 ohm cable and termination (note)',
    interface: 'RS-485',
    kind: 'termination-note',
    nominalOhm: 120,
    ledgerId: 'S-026e',
    status: 'UNVERIFIED',
    scopeKind: 'cable-and-termination',
    scope:
      'Characteristic impedance of the twisted-pair cable and the 120 ohm terminating resistor at each cable end, as the application notes state it.',
    sources: [
      { document: 'TI SLLA272D, The RS-485 Design Guide (Feb 2008, rev. May 2021), sections 5 and 6', quote: 'RS-485 standard recommends cables with Z0 = 120; commonly terminated with 120-ohm resistors, one at each cable end' },
      { document: 'Renesas R15AN0014EU0100, RS-485 Design Guide, Rev. 1.00 (12 Sep 2023), sections 5 and 6', quote: 'usually terminated with 120 ohm resistors, one at each end' },
    ],
    tolerances: [],
    info: [],
    note: 'UNVERIFIED: the Renesas text follows the TI guide closely and is probably derived from it, so the two are not independent sources (S-026e). Informational termination and cable note, not a PCB controlled-impedance requirement. TIA-485-A was not read.',
    disclaimer: DESIGN_TARGET_DISCLAIMER,
    retrieved: RETRIEVED,
  },
];

/** The offered presets, deeply frozen. */
export const IMPEDANCE_PRESETS: readonly ImpedancePreset[] = deepFreeze([...PRESETS.map((p) => deepFreeze({ ...p }))]);

export function presetById(id: string): ImpedancePreset | undefined {
  return IMPEDANCE_PRESETS.find((p) => p.id === id);
}

export interface PresetComparison {
  readonly presetId: string;
  readonly targetOhm: number;
  readonly zdiffOhm: number;
  readonly deviationOhm: number;
  /** (Zdiff - target) / target x 100: positive above the target. */
  readonly deviationPercent: number;
  /** Present only when the caller selected a tolerance the preset lists. Never defaulted. */
  readonly tolerance?: { readonly id: string; readonly value: number; readonly lowerOhm: number; readonly upperOhm: number; readonly within: boolean };
  /** The tolerances the sources state, so a caller can ask the user to choose; empty when none is published. */
  readonly toleranceOptions: readonly ToleranceOption[];
  /** Always UNVERIFIED: the comparison rests on application-note targets and the interface standards were not read. */
  readonly comparisonStatus: 'UNVERIFIED';
  readonly ledgerId: string;
  readonly ledgerStatus: LedgerStatus;
  readonly statement: string;
}

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });
const fmt = (x: number): string => String(Number(x.toPrecision(5)));

/**
 * Compares a computed differential impedance with a preset's design target. Returns the deviation, and a band check only when
 * the caller names one of the tolerances the preset lists. The wording never says pass or fail and makes no claim about a standard; the statement carries
 * the UNVERIFIED comparison status and the design-target disclaimer.
 */
export function compareToPreset(zdiff: Quantity, presetId: string, toleranceId?: string): Result<PresetComparison, CalcError> {
  const p = presetById(presetId);
  if (p === undefined) return { ok: false, error: err('INVALID_INPUT', 'presetId', `Unknown preset "${presetId}". Offered: ${IMPEDANCE_PRESETS.map((x) => x.id).join(', ')}.`) };
  if (typeof zdiff !== 'object' || zdiff === null || typeof zdiff.si !== 'number' || typeof zdiff.dim !== 'object') {
    return { ok: false, error: err('INVALID_INPUT', 'zdiff', 'zdiff must be a quantity with a numeric value and a dimension.') };
  }
  if (!sameDim(zdiff, q(1, DIM.RESISTANCE))) return { ok: false, error: err('DIMENSION', 'zdiff', 'zdiff must be a resistance (ohm).') };
  if (!Number.isFinite(zdiff.si) || zdiff.si <= 0) return { ok: false, error: err('INVALID_INPUT', 'zdiff', 'zdiff must be a finite number greater than zero.') };
  if (p.kind === 'termination-note') {
    return { ok: false, error: err('OUT_OF_DOMAIN', 'presetId', `${p.label}: this is a cable and termination note, not a controlled-impedance PCB target, so no trace impedance is compared with it.`) };
  }
  let chosen: ToleranceOption | undefined;
  if (toleranceId !== undefined) {
    chosen = p.tolerances.find((t) => t.id === toleranceId);
    if (chosen === undefined) {
      const listed = p.tolerances.length === 0 ? 'this preset lists no tolerance (none is published in the sources read)' : `listed: ${p.tolerances.map((t) => t.id).join(', ')}`;
      return { ok: false, error: err('INVALID_INPUT', 'toleranceId', `Unknown tolerance "${toleranceId}" for ${p.id}; ${listed}.`) };
    }
  }
  const z = zdiff.si;
  const target = p.nominalOhm;
  const deviationOhm = z - target;
  const deviationPercent = (deviationOhm / target) * 100;
  const dev =
    deviationOhm === 0
      ? `Zdiff = ${fmt(z)} ohm equals the ${fmt(target)} ohm design target`
      : `Zdiff = ${fmt(z)} ohm is ${fmt(Math.abs(deviationPercent))} % ${deviationOhm > 0 ? 'above' : 'below'} the ${fmt(target)} ohm design target`;
  const head = `${dev} (${p.label}; ledger ${p.ledgerId}, status ${p.status}).`;
  const tail = ` Comparison status: UNVERIFIED (the interface standard was not read). ${DESIGN_TARGET_DISCLAIMER}`;
  let tolerance: PresetComparison['tolerance'];
  let middle: string;
  if (chosen !== undefined) {
    const lowerOhm = target * (1 - chosen.value / 100);
    const upperOhm = target * (1 + chosen.value / 100);
    const within = Math.abs(deviationPercent) <= chosen.value * (1 + 1e-12);
    tolerance = { id: chosen.id, value: chosen.value, lowerOhm, upperOhm, within };
    middle = ` It is ${within ? 'within' : 'outside'} the source-stated tolerance of +/-${fmt(chosen.value)} % (${fmt(lowerOhm)} to ${fmt(upperOhm)} ohm; ${chosen.source}; ledger ${chosen.ledgerId}, status ${chosen.status}).`;
  } else if (p.tolerances.length > 0) {
    middle = ` No tolerance was selected, so no band is evaluated. The sources state ${p.tolerances.map((t) => `+/-${fmt(t.value)} % (${t.source})`).join(' and ')}; choose one.`;
  } else {
    middle = ' No PCB tolerance is published in the sources read, so no band is evaluated and none is assumed.';
  }
  return {
    ok: true,
    value: {
      presetId: p.id,
      targetOhm: target,
      zdiffOhm: z,
      deviationOhm,
      deviationPercent,
      ...(tolerance !== undefined ? { tolerance } : {}),
      toleranceOptions: p.tolerances,
      comparisonStatus: 'UNVERIFIED',
      ledgerId: p.ledgerId,
      ledgerStatus: p.status,
      statement: `${head}${middle}${tail}`,
    },
  };
}
