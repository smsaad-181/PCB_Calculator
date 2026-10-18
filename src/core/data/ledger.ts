// Source ledger mirror. Transcribed from docs/sources/LEDGER.md; tests/ledger-sync.test.ts
// fails if ids or statuses drift from the markdown. Status here never upgrades the markdown.
export type LedgerStatus = 'VERIFIED' | 'UNVERIFIED' | 'PAYWALLED-USER-MUST-VERIFY' | 'CONFLICT';

export interface LedgerRow {
  readonly id: string;
  readonly item: string;
  /** Edition or source date as recorded in the ledger; "not confirmed" where no source was read. */
  readonly edition: string;
  readonly status: LedgerStatus;
}

const E = 'edition not yet confirmed';

const LEDGER_ROWS: readonly LedgerRow[] = [
  { id: 'S-001', item: 'IPC-2221 trace current formula (legacy)', edition: 'IPC-2221B (2012) / IPC-2221C (2023-12), not read', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-002', item: 'IPC-2152 nature (charts vs closed form)', edition: 'IPC-2152 (2009), not read', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-003', item: 'Copper foil weight to thickness', edition: 'IPC-4562A (secondhand); fab sources', status: 'CONFLICT' },
  { id: 'S-003d', item: 'Copper density, IACS reference value', edition: 'NBS Circular 31 (1914); NBS Handbook 100 (1966)', status: 'VERIFIED' },
  { id: 'S-003e', item: 'Copper density, pure copper', edition: 'RSC; LANL periodic tables', status: 'CONFLICT' },
  { id: 'S-004', item: 'Copper resistivity and temperature coefficient (IACS)', edition: 'NBS Circular 31 (1914); NBS Handbook 100 (1966)', status: 'VERIFIED' },
  { id: 'S-005', item: 'AWG diameter', edition: 'NBS Circular 31 (1914); NBS Handbook 100 (1966); ASTM B258-18 not read', status: 'VERIFIED' },
  { id: 'S-006', item: 'Exact unit conversions', edition: 'NIST SP 811 (2008) App. B.8', status: 'VERIFIED' },
  { id: 'S-007', item: 'Copper thermal conductivity k_Cu: pure Cu 401 W/m·K (default, 300 K); C11000 391–394 W/m·K; the earlier oracle value 385 had no source and was replaced', edition: 'Ho, Powell & Liley 1972; Aurubis C11000 datasheet', status: 'CONFLICT' },
  { id: 'S-008', item: 'Fabricator capability data (JLCPCB published, example fab profile)', edition: 'jlcpcb.com capabilities, retrieved 2026-10-06', status: 'UNVERIFIED' },
  { id: 'S-009', item: 'Finished copper thickness vs nominal (IPC-6012 minimums, secondhand)', edition: 'NCAB FAQ, retrieved 2026-10-06; IPC-6012 not read', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-018', item: 'IPC-2152 finding that internal traces run cooler than IPC-2221 assumes (secondhand)', edition: 'Brooks & Adam, PCD&F 2015; IPC-2152 not read', status: 'UNVERIFIED' },
  { id: 'S-019', item: 'Basic circuit relations (textbook)', edition: 'OpenStax University Physics Vol. 2 (2016); Fiore (LibreTexts); Kuphaldt, Lessons in Electric Circuits (LibreTexts); retrieved 2026-10-11', status: 'VERIFIED' },
  { id: 'S-019b', item: 'LC characteristic impedance Z0 = √(L/C) (lumped tank)', edition: 'imperix TN125; HMC E84 notes; retrieved 2026-10-11', status: 'UNVERIFIED' },
  { id: 'S-019c', item: 'Fabricator published finished copper per layer (JLCPCB, example fab profile data)', edition: 'jlcpcb.com stackup and copper-weight help articles (updated 2026-09-09) and capabilities page, retrieved 2026-10-13', status: 'UNVERIFIED' },
  { id: 'S-019d', item: 'Thermal resistance definition (steady state, lumped): dT = theta x P; series resistances add', edition: 'onsemi AND8220/D Rev. 1 (2022); Burr-Brown AB-038 (1992, TI SBOA021); retrieved 2026-10-13', status: 'VERIFIED' },
  { id: 'S-019e', item: 'Rectangular pulse rms and average power: I_rms = I_pk sqrt(D), P_avg = D I_pk^2 R', edition: 'Erickson, Appendix 1 draft (1998), eq. A1-5; onsemi AND8220/D Rev. 1 (2022) p. 11; retrieved 2026-10-13', status: 'VERIFIED' },
  { id: 'S-019f', item: 'Pulse validity: mean rise from average power only when the period is much shorter than the thermal time constant; peak rise is higher', edition: 'onsemi AND8220/D Rev. 1 (2022) eq. 22 only; no second source; retrieved 2026-10-13', status: 'UNVERIFIED' },
  { id: 'S-019g', item: 'Coupled self-heating fixed point, closed form and runaway (DERIVED by algebra from S-019d, S-019, S-004)', edition: 'derived, not sourced; runaway criterion in small-signal form: Galeazzi and McCammon, arXiv:astro-ph/0304397 (2003); retrieved 2026-10-13', status: 'UNVERIFIED' },
  { id: 'S-019h', item: 'Constant-power load behind a series resistance: R I^2 - Vs I + P = 0, P_max = Vs^2/(4R) (maximum power transfer), efficiency P_load/P_source', edition: 'Tu, Yu, Lukic, arXiv:2211.04242v3 (2023) eqs. 6-7; Liu et al., arXiv:1711.06993 eqs. 10-11; Tatum, LibreTexts §4.8; Stolp, Univ. of Utah ECE 2210 notes; retrieved 2026-10-13', status: 'VERIFIED' },
  { id: 'S-019i', item: 'JLCPCB published hole limits: drill diameter, via hole/diameter, NPTH minimum, hole-size tolerances (finished, plated pad holes only), hole position (example fab profile data)', edition: 'jlcpcb.com capabilities page (no revision; footer 2026) and help article on via vs pad holes (updated 2025-04-24), retrieved 2026-10-13', status: 'UNVERIFIED' },
  { id: 'S-019j', item: 'JLCPCB published annular ring (PTH pad per layer count and copper weight, NPTH pad) and via pad-to-hole rule (example fab profile data)', edition: 'jlcpcb.com capabilities page (no revision; footer 2026), retrieved 2026-10-13', status: 'UNVERIFIED' },
  { id: 'S-019k', item: 'JLCPCB published via/PTH/NPTH hole-to-track, inner-layer hole-to-copper, hole-to-hole, pad and board-edge clearances (example fab profile data)', edition: 'jlcpcb.com capabilities page (no revision; footer 2026), retrieved 2026-10-13', status: 'UNVERIFIED' },
  { id: 'S-019l', item: 'JLCPCB published minimum track width/spacing per copper weight and layer count, track and impedance tolerance (example fab profile data)', edition: 'jlcpcb.com capabilities page (no revision; footer 2026), retrieved 2026-10-13', status: 'UNVERIFIED' },
  { id: 'S-019m', item: 'JLCPCB published average hole plating, plugged vias and via-in-pad; capability items not published (example fab profile data)', edition: 'jlcpcb.com capabilities page (no revision; footer 2026), retrieved 2026-10-13', status: 'UNVERIFIED' },
  { id: 'S-010', item: 'IPC-2221 chart validity range', edition: 'IPC-2221B/C Figure 6-4, not read', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-011a', item: 'IPC-2152 fit: Brooks & Adam, external traces', edition: 'PCD&F 2015-05-29', status: 'UNVERIFIED' },
  { id: 'S-011b', item: 'IPC-2152 fit: Brooks & Adam, internal traces', edition: 'PCD&F 2015 Appendix 1, not read', status: 'UNVERIFIED' },
  { id: 'S-011c', item: 'IPC-2152 fit: SMPS.us (Jack Olson coefficients)', edition: 'smps.us, retrieved 2026-10-06', status: 'CONFLICT' },
  { id: 'S-011d', item: 'IPC-2152 fit: NinjaCalc', edition: E, status: 'UNVERIFIED' },
  { id: 'S-011e', item: 'IPC-2152 fit: Sierra Circuits (undisclosed)', edition: E, status: 'UNVERIFIED' },
  { id: 'S-012', item: 'Plated copper resistivity', edition: E, status: 'UNVERIFIED' },
  { id: 'S-013', item: 'Skin depth', edition: E, status: 'VERIFIED' },
  { id: 'S-016', item: 'E-series preferred values (IEC 60063)', edition: E, status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-020', item: 'Microstrip, Hammerstad-Jensen quasi-static, zero thickness', edition: 'Steer, Microwave and RF Design II (LibreTexts) §3.5; Janssen et al. arXiv:2509.15043v2 App. D.3; H-J 1980 not read; retrieved 2026-10-18', status: 'VERIFIED' },
  { id: 'S-020a', item: 'Microstrip strip-thickness correction (H-J vs Wheeler; full vs simplified procedure)', edition: 'Janssen et al. arXiv:2509.15043v2; Qucs tech. doc. §11 (tier 4); retrieved 2026-10-18', status: 'CONFLICT' },
  { id: 'S-020b', item: 'Microstrip dispersion, Kirschning-Jansen (1982)', edition: 'Electron. Lett. 18 (1982) not read; Qucs tech. doc. §11 (tier 4) only; retrieved 2026-10-18', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-020c', item: 'Microstrip dispersion, Kobayashi (1988)', edition: 'Steer, Microwave and RF Design II §4.3; Kobayashi 1988 not read; retrieved 2026-10-18', status: 'UNVERIFIED' },
  { id: 'S-020d', item: 'Microstrip, Wheeler-type analysis and synthesis closed forms', edition: 'Ellingson, Electromagnetics Vol. 1 §3.11; Steer §3.6; Wheeler 1977 not read; retrieved 2026-10-18', status: 'UNVERIFIED' },
  { id: 'S-021', item: 'Symmetric stripline, zero-thickness approximation (Pozar 3.179 form) and synthesis', edition: 'Steer, Microwave and RF Design II §3.7; Ansys Lumerical stripline_Z0.lsf; Pozar not read; retrieved 2026-10-18', status: 'VERIFIED' },
  { id: 'S-021a', item: 'Symmetric stripline with finite strip thickness (Cohn 1954/55 family)', edition: 'Rogers Pub. #92-311 (Revised 1641 060223); Steer §3.7; Cohn not read; retrieved 2026-10-18', status: 'CONFLICT' },
  { id: 'S-021b', item: 'Symmetric stripline, exact zero-thickness conformal map', edition: 'no source read (search snippet only); retrieved 2026-10-18', status: 'UNVERIFIED' },
  { id: 'S-022', item: 'Edge-coupled microstrip, Hammerstad-Jensen (1980) coupled-line static model', edition: 'Steer, Microwave and RF Design II §5.6; H-J 1980 not read; retrieved 2026-10-18', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-022a', item: 'Edge-coupled stripline, Cohn (1955) approximate even/odd forms', edition: 'Caspers, CERN CAS, arXiv:1201.2346 eq. (3.3); Cohn 1955 not read; retrieved 2026-10-18', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-022b', item: 'Differential and common-mode impedance definitions (Zdiff = 2 Zodd, Zcommon = Zeven/2)', edition: 'Polar Instruments AP157; Sonnet help (2021); retrieved 2026-10-18', status: 'VERIFIED' },
  { id: 'S-023', item: 'CPW without lower ground plane, conformal map, finite substrate', edition: 'Santavicca et al. APL 119 252601 (2021) suppl.; Steer §3.8; Qucs §12 (tier 4); retrieved 2026-10-18', status: 'CONFLICT' },
  { id: 'S-023a', item: 'Conductor-backed CPW (CPWG), Ghione-Naldi (1983)', edition: 'Electron. Lett. 19(18) 1983 not read; Qucs tech. doc. §12 (tier 4) only; retrieved 2026-10-18', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-023b', item: 'Complete elliptic integral K(k) by AGM; K′(k) = K(k′)', edition: 'NIST DLMF 19.8.5, 19.2.9 (v1.2.8, 2026-09-15); MathWorld AGM eq. (8); retrieved 2026-10-18', status: 'VERIFIED' },
  { id: 'S-023c', item: 'Hilberg-type closed approximation for K(k)/K′(k)', edition: 'Qucs tech. doc. §12 (tier 4); Steer §3.8 (branch ranges conflict); retrieved 2026-10-18', status: 'UNVERIFIED' },
  { id: 'S-024', item: 'Coaxial line characteristic impedance', edition: 'Steer, Microwave and RF Design II §2.8; Ferendeci, Univ. of Cincinnati EE-611 notes; retrieved 2026-10-18', status: 'VERIFIED' },
  { id: 'S-025', item: 'IPC-2141 / IPC-D-317 legacy closed forms (secondhand)', edition: 'IPC-2141A (2004) not read; Freescale AN2536 Rev. 2 (2006); retrieved 2026-10-18', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-026…S-028', item: 'Presets (protocol specs), FR-4 dielectric data, field-solver reference cases (part B)', edition: E, status: 'UNVERIFIED' },
  { id: 'S-030…S-034', item: 'IEC 60664 / IPC spacing', edition: E, status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-040…S-044', item: 'Thermal, fusing and RF references', edition: E, status: 'UNVERIFIED' },
  { id: 'S-050', item: 'twc IPC-2152 methods (cross-check tool; describes the tool only)', edition: 'ymic9963/twc commit 308002f (main, 2026-10-06)', status: 'VERIFIED' },
  { id: 'S-051', item: 'Cross-check tool licenses', edition: 'each repository license file, 2026-10-06', status: 'VERIFIED' },
  { id: 'S-014', item: 'Onderdonk fusing equation (Phase 4, info only)', edition: 'see docs/sources/LEDGER.md (researched 2026-10-07)', status: 'UNVERIFIED' },
  { id: 'S-015', item: 'Via barrel (hole-wall) copper plating thickness: fabricator data and secondhand IPC-6012 minimums', edition: 'see docs/sources/LEDGER.md (researched 2026-10-07)', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-017', item: 'KiCad PCB Calculator behaviour (cross-check pointer)', edition: 'see docs/sources/LEDGER.md (researched 2026-10-07)', status: 'UNVERIFIED' },
];

/** Frozen so no code path can mark a row VERIFIED at runtime (the compliance gate trusts these statuses). */
export const LEDGER: readonly LedgerRow[] = Object.freeze(LEDGER_ROWS.map((r) => Object.freeze({ ...r })));
