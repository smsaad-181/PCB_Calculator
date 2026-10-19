// Source ledger mirror. Transcribed from docs/sources/LEDGER.md; tests/ledger-sync.test.ts
// fails if ids or statuses drift from the markdown. Status here never upgrades the markdown.
import { LEDGER_STATUS_ROWS, type LedgerStatus } from './ledger-status';
export type { LedgerStatus };

export interface LedgerText {
  readonly id: string;
  readonly item: string;
  /** Edition or source date as recorded in the ledger; "not confirmed" where no source was read. */
  readonly edition: string;
}

export interface LedgerRow extends LedgerText {
  readonly status: LedgerStatus;
}

const E = 'edition not yet confirmed';

const LEDGER_TEXT: readonly LedgerText[] = [
  { id: 'S-001', item: 'IPC-2221 trace current formula (legacy)', edition: 'IPC-2221B (2012) / IPC-2221C (2023-12), not read' },
  { id: 'S-002', item: 'IPC-2152 nature (charts vs closed form)', edition: 'IPC-2152 (2009), not read' },
  { id: 'S-003', item: 'Copper foil weight to thickness', edition: 'IPC-4562A (secondhand); fab sources' },
  { id: 'S-003d', item: 'Copper density, IACS reference value', edition: 'NBS Circular 31 (1914); NBS Handbook 100 (1966)' },
  { id: 'S-003e', item: 'Copper density, pure copper', edition: 'RSC; LANL periodic tables' },
  { id: 'S-004', item: 'Copper resistivity and temperature coefficient (IACS)', edition: 'NBS Circular 31 (1914); NBS Handbook 100 (1966)' },
  { id: 'S-005', item: 'AWG diameter', edition: 'NBS Circular 31 (1914); NBS Handbook 100 (1966); ASTM B258-18 not read' },
  { id: 'S-006', item: 'Exact unit conversions', edition: 'NIST SP 811 (2008) App. B.8' },
  { id: 'S-007', item: 'Copper thermal conductivity k_Cu: pure Cu 401 W/m·K (default, 300 K); C11000 391–394 W/m·K; the earlier oracle value 385 had no source and was replaced', edition: 'Ho, Powell & Liley 1972; Aurubis C11000 datasheet' },
  { id: 'S-008', item: 'Fabricator capability data (JLCPCB published, example fab profile)', edition: 'jlcpcb.com capabilities, retrieved 2026-10-06' },
  { id: 'S-009', item: 'Finished copper thickness vs nominal (IPC-6012 minimums, secondhand)', edition: 'NCAB FAQ, retrieved 2026-10-06; IPC-6012 not read' },
  { id: 'S-018', item: 'IPC-2152 finding that internal traces run cooler than IPC-2221 assumes (secondhand)', edition: 'Brooks & Adam, PCD&F 2015; IPC-2152 not read' },
  { id: 'S-019', item: 'Basic circuit relations (textbook)', edition: 'OpenStax University Physics Vol. 2 (2016); Fiore (LibreTexts); Kuphaldt, Lessons in Electric Circuits (LibreTexts); retrieved 2026-10-11' },
  { id: 'S-019b', item: 'LC characteristic impedance Z0 = √(L/C) (lumped tank)', edition: 'imperix TN125; HMC E84 notes; retrieved 2026-10-11' },
  { id: 'S-019c', item: 'Fabricator published finished copper per layer (JLCPCB, example fab profile data)', edition: 'jlcpcb.com stackup and copper-weight help articles (updated 2026-09-09) and capabilities page, retrieved 2026-10-13' },
  { id: 'S-019d', item: 'Thermal resistance definition (steady state, lumped): dT = theta x P; series resistances add', edition: 'onsemi AND8220/D Rev. 1 (2022); Burr-Brown AB-038 (1992, TI SBOA021); retrieved 2026-10-13' },
  { id: 'S-019e', item: 'Rectangular pulse rms and average power: I_rms = I_pk sqrt(D), P_avg = D I_pk^2 R', edition: 'Erickson, Appendix 1 draft (1998), eq. A1-5; onsemi AND8220/D Rev. 1 (2022) p. 11; retrieved 2026-10-13' },
  { id: 'S-019f', item: 'Pulse validity: mean rise from average power only when the period is much shorter than the thermal time constant; peak rise is higher', edition: 'onsemi AND8220/D Rev. 1 (2022) eq. 22 only; no second source; retrieved 2026-10-13' },
  { id: 'S-019g', item: 'Coupled self-heating fixed point, closed form and runaway (DERIVED by algebra from S-019d, S-019, S-004)', edition: 'derived, not sourced; runaway criterion in small-signal form: Galeazzi and McCammon, arXiv:astro-ph/0304397 (2003); retrieved 2026-10-13' },
  { id: 'S-019h', item: 'Constant-power load behind a series resistance: R I^2 - Vs I + P = 0, P_max = Vs^2/(4R) (maximum power transfer), efficiency P_load/P_source', edition: 'Tu, Yu, Lukic, arXiv:2211.04242v3 (2023) eqs. 6-7; Liu et al., arXiv:1711.06993 eqs. 10-11; Tatum, LibreTexts §4.8; Stolp, Univ. of Utah ECE 2210 notes; retrieved 2026-10-13' },
  { id: 'S-019i', item: 'JLCPCB published hole limits: drill diameter, via hole/diameter, NPTH minimum, hole-size tolerances (finished, plated pad holes only), hole position (example fab profile data)', edition: 'jlcpcb.com capabilities page (no revision; footer 2026) and help article on via vs pad holes (updated 2025-04-24), retrieved 2026-10-13' },
  { id: 'S-019j', item: 'JLCPCB published annular ring (PTH pad per layer count and copper weight, NPTH pad) and via pad-to-hole rule (example fab profile data)', edition: 'jlcpcb.com capabilities page (no revision; footer 2026), retrieved 2026-10-13' },
  { id: 'S-019k', item: 'JLCPCB published via/PTH/NPTH hole-to-track, inner-layer hole-to-copper, hole-to-hole, pad and board-edge clearances (example fab profile data)', edition: 'jlcpcb.com capabilities page (no revision; footer 2026), retrieved 2026-10-13' },
  { id: 'S-019l', item: 'JLCPCB published minimum track width/spacing per copper weight and layer count, track and impedance tolerance (example fab profile data)', edition: 'jlcpcb.com capabilities page (no revision; footer 2026), retrieved 2026-10-13' },
  { id: 'S-019m', item: 'JLCPCB published average hole plating, plugged vias and via-in-pad; capability items not published (example fab profile data)', edition: 'jlcpcb.com capabilities page (no revision; footer 2026), retrieved 2026-10-13' },
  { id: 'S-010', item: 'IPC-2221 chart validity range', edition: 'IPC-2221B/C Figure 6-4, not read' },
  { id: 'S-011a', item: 'IPC-2152 fit: Brooks & Adam, external traces', edition: 'PCD&F 2015-05-29' },
  { id: 'S-011b', item: 'IPC-2152 fit: Brooks & Adam, internal traces', edition: 'PCD&F 2015 Appendix 1, not read' },
  { id: 'S-011c', item: 'IPC-2152 fit: SMPS.us (Jack Olson coefficients)', edition: 'smps.us, retrieved 2026-10-06' },
  { id: 'S-011d', item: 'IPC-2152 fit: NinjaCalc', edition: E },
  { id: 'S-011e', item: 'IPC-2152 fit: Sierra Circuits (undisclosed)', edition: E },
  { id: 'S-012', item: 'Plated copper resistivity', edition: E },
  { id: 'S-013', item: 'Skin depth relation (the impedance calculators cite it for the mu0 value only: S-013 (mu0 value))', edition: E },
  { id: 'S-016', item: 'E-series preferred values (IEC 60063)', edition: E },
  { id: 'S-020', item: 'Microstrip, Hammerstad-Jensen quasi-static, zero thickness', edition: 'Steer, Microwave and RF Design II (LibreTexts) §3.5; Janssen et al. arXiv:2509.15043v2 App. D.3; H-J 1980 not read; retrieved 2026-10-18' },
  { id: 'S-020a', item: 'Microstrip strip-thickness correction (H-J vs Wheeler; full vs simplified procedure)', edition: 'Janssen et al. arXiv:2509.15043v2; Qucs tech. doc. §11 (tier 4); retrieved 2026-10-18' },
  { id: 'S-020b', item: 'Microstrip dispersion, Kirschning-Jansen (1982)', edition: 'Electron. Lett. 18 (1982) not read; Qucs tech. doc. §11 (tier 4) only; retrieved 2026-10-18' },
  { id: 'S-020c', item: 'Microstrip dispersion, Kobayashi (1988)', edition: 'Steer, Microwave and RF Design II §4.3; Kobayashi 1988 not read; retrieved 2026-10-18' },
  { id: 'S-020d', item: 'Microstrip, Wheeler-type analysis and synthesis closed forms', edition: 'Ellingson, Electromagnetics Vol. 1 §3.11; Steer §3.6; Wheeler 1977 not read; retrieved 2026-10-18' },
  { id: 'S-021', item: 'Symmetric stripline, zero-thickness approximation (Pozar 3.179 form) and synthesis', edition: 'Steer, Microwave and RF Design II §3.7; Ansys Lumerical stripline_Z0.lsf; Pozar not read; retrieved 2026-10-18' },
  { id: 'S-021a', item: 'Symmetric stripline with finite strip thickness (Cohn 1954/55 family)', edition: 'Rogers Pub. #92-311 (Revised 1641 060223); Steer §3.7; Cohn not read; retrieved 2026-10-18' },
  { id: 'S-021b', item: 'Symmetric stripline, exact zero-thickness conformal map', edition: 'no source read (search snippet only); retrieved 2026-10-18' },
  { id: 'S-022', item: 'Edge-coupled microstrip, Hammerstad-Jensen (1980) coupled-line static model', edition: 'Steer, Microwave and RF Design II §5.6; H-J 1980 not read; retrieved 2026-10-18' },
  { id: 'S-022a', item: 'Edge-coupled stripline, Cohn (1955) approximate even/odd forms', edition: 'Caspers, CERN CAS, arXiv:1201.2346 eq. (3.3); Cohn 1955 not read; retrieved 2026-10-18' },
  { id: 'S-022b', item: 'Differential and common-mode impedance definitions (Zdiff = 2 Zodd, Zcommon = Zeven/2)', edition: 'Polar Instruments AP157; Sonnet help (2021); retrieved 2026-10-18' },
  { id: 'S-023', item: 'CPW without lower ground plane, conformal map, finite substrate', edition: 'Santavicca et al. APL 119 252601 (2021) suppl.; Steer §3.8; Qucs §12 (tier 4); retrieved 2026-10-18' },
  { id: 'S-023a', item: 'Conductor-backed CPW (CPWG), Ghione-Naldi (1983)', edition: 'Electron. Lett. 19(18) 1983 not read; Qucs tech. doc. §12 (tier 4) only; retrieved 2026-10-18' },
  { id: 'S-023b', item: 'Complete elliptic integral K(k) by AGM; K′(k) = K(k′)', edition: 'NIST DLMF 19.8.5, 19.2.9 (v1.2.8, 2026-09-15); MathWorld AGM eq. (8); retrieved 2026-10-18' },
  { id: 'S-023c', item: 'Hilberg-type closed approximation for K(k)/K′(k)', edition: 'Qucs tech. doc. §12 (tier 4); Steer §3.8 (branch ranges conflict); retrieved 2026-10-18' },
  { id: 'S-024', item: 'Coaxial line characteristic impedance', edition: 'Steer, Microwave and RF Design II §2.8; Ferendeci, Univ. of Cincinnati EE-611 notes; retrieved 2026-10-18' },
  { id: 'S-025', item: 'IPC-2141 / IPC-D-317 legacy closed forms (secondhand)', edition: 'IPC-2141A (2004) not read; Freescale AN2536 Rev. 2 (2006); retrieved 2026-10-18' },
  { id: 'S-026', item: 'Preset: USB 2.0 HS differential target 90 Ω (design target, not compliance)', edition: 'TI SPRAAR7J (2023-02); NXP AN13462 Rev. 1.0 (2021); Prolific AN-27220901 Rev. 1.0 (2022); USB 2.0 spec not read; retrieved 2026-10-18' },
  { id: 'S-026a', item: 'Preset: USB 2.0 differential tolerance (±15 % vs ±10 %)', edition: 'NXP AN13462 (2021); TI SPRAAR7J (2023-02); retrieved 2026-10-18' },
  { id: 'S-026b', item: 'Preset: USB 3.x SuperSpeed differential target (90 Ω vs 95 Ω, device-specific)', edition: 'TI SPRAAR7J (2023-02); Prolific AN-27220901 (2022); USB 3.x spec not read; retrieved 2026-10-18' },
  { id: 'S-026c', item: 'Preset: LVDS 100 Ω differential target and 100 Ω termination (nominal)', edition: 'TI SLLA014A (2000); National AN-971 (1998), AN-1035 (1996); TIA/EIA-644 not read; retrieved 2026-10-18' },
  { id: 'S-026d', item: 'Preset: CAN 120 Ω cable impedance and termination (nominal; not tight PCB impedance)', edition: 'TI SLLA270 (2008); Microchip AN228 DS00228A (2002); ISO 11898-2 not read; retrieved 2026-10-18' },
  { id: 'S-026e', item: 'Preset: RS-485 120 Ω cable impedance and termination', edition: 'TI SLLA272D (2021); Renesas R15AN0014 Rev. 1.00 (2023, probably derived); TIA-485-A not read; retrieved 2026-10-18' },
  { id: 'S-026f', item: 'Preset: Ethernet 10/100/1000BASE-T MDI 100 Ω ±10 % differential', edition: 'TI SNLA387 (2021); Renesas R19AN0014ED0102 Rev. 1.2 (2013); IEEE 802.3 not read; retrieved 2026-10-18' },
  { id: 'S-026g', item: 'Optional presets: PCIe, HDMI, SATA, SGMII, MIPI CSI, eUSB2 (single source, device-specific)', edition: 'TI SPRAAR7J App. A (2023-02); NXP AN13462 (eUSB2); retrieved 2026-10-18' },
  { id: 'S-027', item: 'FR-4 class laminate Dk/Df ranges and frequency dependence (manufacturer data)', edition: 'Isola 370HR Rev. B (2018); Shengyi S1000-2M (rv1-2/17 and undated); Rogers PUB# 92-004 (2022); National AN-1035; TI SLLA323; retrieved 2026-10-18' },
  { id: 'S-027a', item: 'JLCPCB published stackup dielectric constants (prepreg by glass style, core, soldermask)', edition: 'JLCPCB impedance page, no frequency stated; retrieved 2026-10-18' },
  { id: 'S-028', item: 'Public reference cases for impedance cross-check (pointer row)', edition: 'see docs/sources/notes/impedance-presets-and-data.md; retrieved 2026-10-18' },
  { id: 'S-028a', item: 'Human-run impedance cross-check tools and their inputs/outputs (pointer row)', edition: 'KiCad 9.0.9 docs; qucstrans(1); rf-tool and rftools-mcp READMEs; retrieved 2026-10-18' },
  { id: 'S-029', item: 'Speed of light in vacuum c = 299 792 458 m/s (exact)', edition: 'NIST CODATA 2022; BIPM SI metre definition; retrieved 2026-10-18' },
  { id: 'S-029a', item: 'Delay √εe/c, phase velocity c/√εe, guided wavelength λ0/√εe', edition: 'Steer, Microwave and RF Design II §3.5; National AN-1035 (1996); TI SLLA323 (2012); retrieved 2026-10-18' },
  { id: 'S-029b', item: 'Skew from length mismatch, skew = ΔL·√εe/c (derived)', edition: 'TI SLLA323 (2012) worked table only; retrieved 2026-10-18' },
  { id: 'S-029c', item: 'Quarter-wave stub helper λg/4 and antenna caveat', edition: 'derived from S-029a; EnOcean AN102 (2026-06-25); retrieved 2026-10-18' },
  { id: 'S-029d', item: 'Low-loss attenuation α ≈ R′/(2Z0) + G′Z0/2 and Np to dB', edition: 'Ellingson, Electromagnetics Vol. 2 §7.3; Steer §3.5 eq. (23); retrieved 2026-10-18' },
  { id: 'S-029e', item: 'Dielectric loss α_d of a quasi-TEM line (filling-factor form)', edition: 'Steer §3.5 eq. (26); Qucs tech. doc. §11 (tier 4); retrieved 2026-10-18' },
  { id: 'S-029f', item: 'Conductor skin-effect loss estimate α_c ≈ Rs/(Z0·w), microstrip', edition: 'Qucs tech. doc. §11 (tier 4); Steer §3.5 (low-frequency form); Ellingson Vol. 2 §7.3; retrieved 2026-10-18' },
  { id: 'S-030…S-034', item: 'IEC 60664 / IPC spacing: umbrella gate row (pointer to S-030 … S-035)', edition: 'pointer row; see sub-rows (researched 2026-10-19)' },
  { id: 'S-030', item: 'IEC 60664-1 scope, edition and what it governs (structure)', edition: 'IEC 60664-1:2020 ed. 3.0 and 2020+AMD1:2025 ed. 3.1, official abstracts only (IEC webstore, SFS); retrieved 2026-10-19' },
  { id: 'S-030a', item: 'IEC 60664-1 numeric scope limits (voltage, frequency, altitude)', edition: 'IEC 60664-1:2020 abstract only; clause 1 not read; retrieved 2026-10-19' },
  { id: 'S-030b', item: 'How clearance and creepage are determined (dependency structure, peak vs RMS, creepage not less than clearance)', edition: 'TI SLUAAR5 (2023-08); PTR Hartmann (EN 60664-1:2007); standard not read; retrieved 2026-10-19' },
  { id: 'S-030c', item: 'Overvoltage categories I-IV (definitions)', edition: 'PTR Hartmann (EN 60664-1:2007) vs TI SLUAAR5 (2023-08); standard not read; retrieved 2026-10-19' },
  { id: 'S-030d', item: 'Pollution degrees 1-4 (definitions, structure only)', edition: 'TI SLUAAR5 Table 1-1 (2023-08); PTR Hartmann (EN 60664-1:2007); retrieved 2026-10-19' },
  { id: 'S-030e', item: 'Material groups I, II, IIIa, IIIb by CTI (definitions)', edition: 'PTR Hartmann (EN 60664-1:2007); In Compliance (2025-06); TI SLYY063A; standard not read; retrieved 2026-10-19' },
  { id: 'S-030f', item: 'Insulation types and the reinforced-insulation rule', edition: 'TI SLUAAR5 (2023-08) only; standard not read; retrieved 2026-10-19' },
  { id: 'S-030g', item: 'Printed boards and coatings in the IEC 60664 family (Parts 3 and 5, printed wiring columns)', edition: 'IEC 60664-3:2016 abstract; IEC 60664-5 status page; standards not read; retrieved 2026-10-19' },
  { id: 'S-031', item: 'IEC 60664-4 high-frequency applicability (structure)', edition: 'IEC 60664-4:2005 ed. 2.0, official abstract (IEC webstore, EVS); retrieved 2026-10-19' },
  { id: 'S-031a', item: 'Frequency boundaries of IEC 60664-1 and IEC 60664-4', edition: 'official abstracts only; clause 1 not read; retrieved 2026-10-19' },
  { id: 'S-032', item: 'Altitude correction of clearance above the scope altitude', edition: 'IEC 60664-1:2020 abstract (Table F.10); TI SLUAAR5 (Table A.2); PTR Hartmann; standard not read; retrieved 2026-10-19' },
  { id: 'S-033', item: 'IPC-2221 Table 6-1 electrical conductor spacing (structure only)', edition: 'Altair PollEx help; Altium (2025-09-09); IPC-2221B/C not read; retrieved 2026-10-19' },
  { id: 'S-033a', item: 'IPC-2221 spacing vs IEC 60664 (relationship)', edition: 'blogs only (McGaw 2023, Siemens EDA 2025); retrieved 2026-10-19' },
  { id: 'S-034', item: 'Product standards that may override or add to IEC 60664-1 (list only)', edition: 'IEC webstore abstracts (62368-1, 61010-1, 60601-1); GenormA (61558-1); Intertek (60950-1); retrieved 2026-10-19' },
  { id: 'S-035', item: 'Waveform relations for stating a working voltage (RMS definition, sine peak/RMS, square, triangle, DC)', edition: 'OpenStax University Physics Vol. 2 (2016) §15.4; Kuphaldt, Lessons in Electric Circuits Vol. II §1.3 (LibreTexts); retrieved 2026-10-19' },
  { id: 'S-040', item: 'JEDEC JESD51 theta-JA: caveat text only (depends on test board and environment; never a design constant)', edition: 'Electronics Cooling (Galloway, 2019-11-06); onsemi AND8220/D Rev. 1 (2022); JESD51 not read; retrieved 2026-10-19' },
  { id: 'S-041', item: 'Single plated via: axial thermal resistance of the barrel wall, theta = L/(k·π·t·(d + t)), d finished hole', edition: 'TI SPRADB7 (2023-09) §3.1; MIT 16.Unified §16.4; Pulsonix docs (tier 4); retrieved 2026-10-19' },
  { id: 'S-041a', item: 'Filled via: core conduction in parallel with the barrel (derived; fill conductivity is a user input)', edition: 'derived from S-041; retrieved 2026-10-19' },
  { id: 'S-041b', item: 'Via array: ideal parallel combination theta/N', edition: 'Guenin, Electronics Cooling (2004-08-01); TI SPRADB7 (2023-09); retrieved 2026-10-19' },
  { id: 'S-041c', item: 'Limits of the 1-D via/array model: spreading, receiving plane, diminishing returns (sources disagree on via usefulness)', edition: 'Guenin, Electronics Cooling (2004-08-01); Brooks and Adam, PCD&F (2024-04-02); retrieved 2026-10-19' },
  { id: 'S-041d', item: 'Thermal conductivity of plated via-barrel copper (not found)', edition: 'not found; see S-007; retrieved 2026-10-19' },
  { id: 'S-042', item: 'Onderdonk fusing equation (adiabatic time to reach the melting temperature; circular mils, seconds, log10)', edition: 'Classic Connectors (Goch, 2012-11-11); Brooks and Adam, PCD&F (2015-06-29, equations as images); original not found; retrieved 2026-10-19' },
  { id: 'S-042a', item: 'Adiabatic heating to a temperature, I²t = A²·(D·c/(ρ20·α20))·ln((Tm + β)/(Ta + β)) (derived)', edition: 'derived from S-019, S-004; IEC 60364-5-54 k-factor form reproduced by myElectrical (2014); IEC not read; retrieved 2026-10-19' },
  { id: 'S-042b', item: 'Preece fusing equation I = a·d^1.5, copper a = 10244, d in inches (wire in still air, no time)', edition: 'Brooks and Adam, PCD&F (2015-06-29); Ness Engineering fuse equations page; Preece 1888 not read; retrieved 2026-10-19' },
  { id: 'S-042c', item: 'Copper melting (freezing) point 1357.77 K = 1084.62 °C (ITS-90)', edition: 'NIST ITS-90 overview; ITS-90.com fixed points; retrieved 2026-10-19' },
  { id: 'S-042d', item: 'Copper specific heat capacity near room temperature and its rise with temperature', edition: 'PPPL pure copper table; HyperPhysics (Tipler); retrieved 2026-10-19' },
  { id: 'S-042e', item: 'PCB traces vs Onderdonk/Preece: validity time and why the result is not a fuse rating', edition: 'Brooks and Adam, PCD&F (2015-09-01, 2023-06-02), Signal Integrity Journal (2020-05-05); retrieved 2026-10-19' },
  { id: 'S-042f', item: 'Fusing and short-time overload vs IPC-2221 / IPC-2152 scope (secondhand)', edition: 'Brooks and Adam, PCD&F (2015-06-29); IPC-2152 and IPC-2221 not read; retrieved 2026-10-19' },
  { id: 'S-043…S-044', item: 'Twisted pair / coax and antenna references (out of Phase 4 scope by user decision 2026-10-19)', edition: E },
  { id: 'S-050', item: 'twc IPC-2152 methods (cross-check tool; describes the tool only)', edition: 'ymic9963/twc commit 308002f (main, 2026-10-06)' },
  { id: 'S-051', item: 'Cross-check tool licenses', edition: 'each repository license file, 2026-10-06' },
  { id: 'S-014', item: 'Onderdonk fusing equation (Phase 4, info only)', edition: 'see docs/sources/LEDGER.md (researched 2026-10-07)' },
  { id: 'S-015', item: 'Via barrel (hole-wall) copper plating thickness: fabricator data and secondhand IPC-6012 minimums', edition: 'see docs/sources/LEDGER.md (researched 2026-10-07)' },
  { id: 'S-017', item: 'KiCad PCB Calculator behaviour (cross-check pointer)', edition: 'see docs/sources/LEDGER.md (researched 2026-10-07)' },
];

/** Frozen so no code path can mark a row VERIFIED at runtime (the compliance gate trusts these statuses). */
export const LEDGER: readonly LedgerRow[] = Object.freeze(
  LEDGER_TEXT.map((t) => {
    const row = LEDGER_STATUS_ROWS.find((r) => r.id === t.id);
    if (row === undefined) throw new Error(`Ledger row ${t.id} has no status in src/core/data/ledger-status.ts`);
    return Object.freeze({ ...t, status: row.status });
  }),
);
