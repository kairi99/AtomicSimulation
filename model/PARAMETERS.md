# Model parameters

Every empirical number in `braggsim` lives here. Each entry gives the value, what fixed it, and the
physics behind it. Change a value only by re-running the fit it came from, then update this file.

## Fitted to leaflet Fig. 4 (`scan.DEFAULT`)

Fit target: `model/data/fig4_digitized.csv`, log panel (229 points, U = 35 kV, I = 1 mA), least
squares on log₁₀ R. Notebook: `notebooks/03_full_spectrum_vs_fig4.ipynb`. Date: 2026-09-25
(refit after the order strengths moved from free r₂, r₃ to structure factors). The final log-RMS is 0.054 dex. Uncertainties are 1σ from the fit Jacobian, scaled by the residual RMS.
They assume independent residuals, which is not the case: neighbouring residuals correlate
(lag-1 autocorrelation 0.52, so about 75 of the 229 points are effectively independent). Read every ± as
about 1.7× larger.

| Name | Value | ± | Unit | Physical meaning |
|---|---|---|---|---|
| `scale` | 1.676e5 | 3.7 % | counts/s per source unit | Overall efficiency: solid angle × crystal reflectivity × counter efficiency |
| `line_to_cont` | 7.43e-3 | 3.9 % | pm⁻¹ | Prefactor c of the Kα rate c·I·(U/U_K − 1)^m relative to the Kramers continuum (at 35 kV the factor (U/U_K − 1)^m is 0.62) |
| `debye_waller_pm2` | 6.26e3 (0.63 Å²) | 9.0 % | pm² | Effective Debye–Waller B that sets how fast the orders weaken (see below) |
| `sigma_deg` | 0.1228 | 2.3 % | ° | Gaussian angular resolution (FWHM 0.29°) at the leaflet's slits. It is also the rocking-curve width when target and sensor are not coupled (see Known deviations) |
| `leak_amp_per_s` | 1.18e5 | 29 % | counts/s | Direct-beam halo at 2θ = 0 at 35 kV, 1 mA. It follows the tube as I·S(U) (`scan.tube_factor`, below); Fig. 4 (35 kV only) cannot test this. The data see only the halo's tail at 2θ = 4–5.2°, where it is well constrained: 312/s ± 7 % at 2θ = 4°. The value at 2θ = 0 is a Gaussian extrapolation (×380), correlated −0.98 with the width, so the rate for β < 2° is not validated |
| `leak_width_deg` | 1.161 | 2.0 % | ° (in 2θ) | Gaussian width of that halo, in sensor angle |
| `absorber_mg_cm2` | 326 | 4.2 % | mg/cm² | Effective absorber (xraylib `"Glass, Pyrex"`) for the tube's glass wall and anode self-absorption ≈ 1.5 mm of glass. Without it the fit gives 0.21 dex and B = 5.4 Å² (r₂ = 0.18) |
| `scatter_per_s` | 5.34 | 5.6 % | counts/s | Flat scattered radiation (air, crystal, housing) at 35 kV and 1 mA, seen at the ≈ 3° minimum. It follows the tube like the leak, so it is 0 with the tube off. Since 2026-10-14 this is the fitted floor 5.54 minus `background_per_s` (0.2): a bookkeeping split, no refit, and the sum at 35 kV / 1 mA is unchanged |
| `background_per_s` | 0.2 | assumed, 0.1–0.5 | counts/s | GM natural background, a true rate added before the dead time; independent of tube and filters. Anchored to LD instruction sheet 559 01 (end-window counter, background ≤ 7 pulses/min ≈ 0.12/s with 50 mm Pb + 3 mm Al shielding); inside the 554 800, less shielded, we assume 0.2. Lab staff could measure it with 0 kV / 0 mA for ≥ 100 s. Added 2026-10-14 |
| `direct_per_s` | 2.97e5 | derived, no measurement | counts/s | Direct beam at 35 kV, 1 mA, no absorber, sensor at 0°, no crystal (`scan.direct_rate`). Anchored to EPN Práctica 1: 950/s is the guide's pass threshold for skipping calibration (21 kV, 0.05 mA, collimator, s1 = s2 = 5 cm, no wheel absorber or foil; the tube's Pyrex absorber and the 18 cm air path included), not an observation, so this is a lower bound and a healthy apparatus may read more. True rate 950/(1 − 950τ) = 1049.7/s, minus background, divided by `tube_factor(21, 0.05)` = 3.534e-3. It goes through the unverified τ = 100 µs: at the 559 01 sheet's ≤ 90 µs it would be 1.0 % lower. No EPN measurement exists. Plausible: same order as `leak_amp_per_s` (1.18e5). Added 2026-10-14 |

Order strengths r_n (relative to n = 1, all orders up to `scan.MAX_ORDER` = 15) are
\|F_n\|²/\|F₁\|² · exp(−2B(s_n² − s₁²)) with s_n = n/(2d). The 1st-order reflection is (200), order n is (2n 0 0).
Kinematic structure-factor ratios from xraylib `FF_Rayl(Na) + FF_Rayl(Cl)` (`crystal.structure_factor_sq_rel`)
are 0.481 and 0.268 for n = 2, 3. With room-temperature Debye–Waller factors (B_Na ≈ 1.7 Å², B_Cl ≈ 1.2 Å²)
they drop to 0.369 and 0.134. Extinction, which weakens the strong 1st order most, pushes the ratios back up.
The fitted B = 0.63 Å² is therefore an *effective* value that lumps these effects together. It gives
r₂ = 0.427, r₃ = 0.195, r₄ = 0.089, r₅ = 0.038, between the two estimates. That is plausible but not an independent
confirmation. The earlier fit with free r₂, r₃ (0.470, 0.253; 0.051 dex) did not constrain n ≥ 4 at all.

## Derived, no free parameter

| Name | What | Why |
|---|---|---|
| Filters in `scan.expected_rate` | `filters` multiply the Bragg signal by T(λ) exactly; leak and scatter scale through the filtered `tube_factor` | Exact for the direct-beam halo, an assumption for scatter (scattered photons are not the filtered spectrum). Mo/Zr/Ag/In foils and the 554 834 wheel are all just `(material, mg/cm²)` entries. Added 2026-10-14 |
| `scan.tube_factor` | I · S(U), S(U) = [∫N(λ, U)T(λ)dλ + Σ lines N_K T(λ_K)] / (same at 35 kV) | Leak and scatter follow the photon rate that leaves the tube through the absorber: the Kramers continuum (trapezoid rule on `filters.MU_RHO_GRID_PM`) plus the Mo K lines. S = 0.545, 0.223, 0.050, 0.005 at 30, 25, 20, 15 kV. (U/35)², used before, gave 0.73, 0.51, 0.33, 0.18. The absorber removes the soft spectrum that low voltages add. Only S(35 kV) = 1 is tested (Fig. 4) |
| Rocking weight in `scan.expected_rate` | exp(−½ ((S/2 − β)/σ)²) for sensor S and target β | Uncoupled arms (SENSOR/TARGET scans). The spectrum follows the sensor (θ = \|S\|/2), and a target off S/2 only weakens it |

## Fixed from literature (not fitted)

| Name | Value | Source | Why not fitted |
|---|---|---|---|
| `source.LINE_EXPONENT_M` | 1.67 | Green & Cosslett (1968); literature values span ≈ 1.5–1.7 and 1.63 is also quoted. **Exact value to verify in the paper** | Needs scans at several U, and Fig. 4 is 35 kV only |
| `constants.KB_KA_RATIO` | 0.1935 | xraylib `RadRate` (Mo) | Freeing it gives ×1.16 and only 0.0005 dex better, so it is not needed |
| `constants.MO_KA_COMPONENTS`, `MO_KB_COMPONENTS` | Kα₁/Kα₂, Kβ₁,₃/Kβ₂ | xraylib line energies and `RadRate` | Atomic data |
| `ModelParams.tau_s` | 1.0e-4 s | Typical end-window GM tube. **Still to verify for the LD 559 01** | The log-RMS of the Fig. 4 fit is flat for τ from 0 to 100 µs, because the other parameters absorb it. The predicted peak heights do depend on τ: at 100 µs the 1st-order Kα tip loses ≈ 25 % |
| `crystal.structure_factor_sq_rel` | \|F_n\|²/\|F₁\|², n = 1…15 | xraylib `FF_Rayl`, F = 4(f_Na + f_Cl) | Atomic data |
| `scan.AIR_PATH_CM` | 18 cm | Geometry estimate: anode → crystal ≈ 12 cm, plus s₂ ≈ 6 cm | Degenerate with the absorber |

## Crystal presets (`crystal.NACL`, `LIF`, `SI`, `CALCITE`, `MUSCOVITE`)

Added 2026-10-21 (C1). Room-temperature structures; cells, atoms and B per atom from the sources below,
all computed, none fitted. `Crystal.basis` holds **every atom of the conventional cell**; the cells with
more than one orbit are generated from the asymmetric unit with the space-group operators
(`crystal.build_basis`, tested for atom counts and distinct positions). θ is at Mo Kα = 71.080 pm
(`constants.MO_KA_PM`, leaflet Table 1), n = 1. Order n of the scan is the reflection (n h, n k, n l) of
`Crystal.cut`, the first allowed reflection of the cut plane's series (the (100) cut of rock salt gives
(2n 0 0): (100) is extinct in the face-centred lattice).

| Crystal | Space group, Z | Cell (pm, °) | Cut → n = 1 | d (pm) | θ(Kα, n=1) | ρ (g/cm³) | Source and status |
|---|---|---|---|---|---|---|---|
| NaCl | Fm-3m, 4 | a = 564.02 | (100) → (200) | 282.01 (exact, `D_NACL_PM`) | 7.24° | 2.164 | LD P6.3.3.1 (a₀, d); Walker et al., Am. Mineral. 89, 204 (2004), a = 564.01 at 298 K, agrees to 0.01 pm. Basis Na (0,0,0)+fcc, Cl (½,0,0)+fcc |
| LiF | Fm-3m, 4 | a = 402.7 | (100) → (200) | 201.35 | 10.17° | 2.636 | a = 4.0270 Å from NBS / ICDD (room temperature; changed from 402.8 pm on 2026-10-21, Q1.3: Ott, Z. Kristallogr. 63, 222 (1926), gave 4.028(2) Å, a single old measurement, consistent within its error). Older Wyckoff 1963 value 401.73 pm not used. Same basis as NaCl with Li, F |
| Si | Fd-3m, 8 | a = 543.1020511 | (111) | 313.560 | 6.51° | 2.329 | CODATA 2018 (NIST X-ray table, 22.5 °C). Atoms (0,0,0) and (¼,¼,¼), each +fcc |
| Calcite | R-3c, 6 (30 atoms hex.) | a = 498.8, c = 1706.1, γ = 120 | (104), rhombohedral cleavage face | 303.51 | 6.72° | 2.713 | Markgraf & Reeder, Am. Mineral. 70, 590 (1985), 24 °C (COD 9000965). Asymmetric unit Ca 6b (0,0,0), C 6a (0,0,¼), O 18e (0.2567,0,¼); 12 R-3c operators × R centring; C–O = 1.28 Å checks the operators |
| Muscovite 2M1 | C2/c, 4 (92 entries, 76 heavy atoms) | a = 520.0, b = 902.1, c = 2007, β = 95.71 | (001) cleavage, first reflection (002) | 998.52 | 2.04° | 2.81 (ideal) | Guggenheim, Chang & Koster van Groos, Am. Mineral. 72, 537 (1987), 20 °C (COD 9001054). Positions and B of the paper; composition idealised to KAl₂(AlSi₃O₁₀)(OH)₂ (K 1, M = Al 1, both T sites Si 0.75 Al 0.25 as two entries per site, OH treated as O). H not located, left out |

**Muscovite (001) is extinct.** In C2/c the c-glide leaves 00l only for even l, so the first reflection of the
cleavage plane is (002), d = c sin β / 2 = 998.5 pm (the classic 10 Å mica spacing), not the ≈ 995 pm of
the planning table (which came from memory). The 1M polytype would show (001).

**Debye–Waller B per atom (Å², amplitude e^{−B s²}, intensity e^{−2B s²}, s = sin θ/λ).**

| Crystal | B | Source, status |
|---|---|---|
| NaCl | 0 inside F; the thermal weakening is the fitted global `debye_waller_pm2` | `Crystal.fitted_debye_waller = True`. Per-atom literature B were not read (Debye estimate 1.17–1.51 Å²; Abrahams & Bernstein 1965 paywalled), and the global one is fitted to Fig. 4 |
| LiF | Li 1.0, F 0.65 | **Assumption** (memory-level, 0.9–1.1 and 0.6–0.7 Å²); no primary table read. At s = 1/(2d) = 0.248 Å⁻¹ for (200), B = (1.0, 0.65) lowers |F|² by 8.6 % (n = 1), 31 % (n = 2), 55 % (n = 3); ±0.2 Å² moves them by 2.4 / 9 / 20 %. Could be fixed from Groenewegen & Huiszoon, Acta Cryst. A28, 166 (1972), or measured by comparing orders 1 to 3 |
| Si | 0.476 | Heacock et al., Science 2021 (neutron Pendellösung, 0.4761(17) Å² at 295.5 K); X-ray and phonon values span 0.46–0.485 |
| Calcite | Ca 0.94, C 0.91, O 1.51 | B = 8π² U_eq from the anisotropic U of Markgraf & Reeder 1985. Maslen et al. 1995 give ≈ 20 % lower values (0.77, 0.72, 1.31); no standard uncertainties in the database record |
| Muscovite | K 1.68, M 0.63, T 0.62/0.63, O 0.84–1.43 | B = 8π² U_eq from Guggenheim 1987 (list in `crystal.py`). Richardson & Richardson 1982 give values about twice as large with no stated temperature; not used |

**Why the other presets get no NaCl-fitted B.** The fitted 0.63 Å² is an *effective* value for NaCl
that lumps thermal motion, extinction and the instrument. Applying it to another crystal would be
wrong, and adding it on top of their own B would count thermal motion twice. Their literature B stays
inside F only.

### Forge presets (web UI starting points)

Defined in `web/src/physics/forge-lattices.ts` (`PRESETS`); the Python model does not use them. Added 2026-10-22.

| Preset | a (pm) | B (Å²) | η | Source and status |
|---|---|---|---|---|
| NaCl | 564.02 | 1.3, both atoms | 0.2° | B is the NaCl reference B_th above; η is the NaCl reference assumption |
| LiF | 402.7 | Li 1.0, F 0.65 | 0.05° | The C1 LiF preset values above (B assumption) |
| Si | 543.102 | 0.476 | none (Darwin) | The C1 Si preset values above (Heacock et al. 2021) |
| KCl | 629.3 | K 1.6, Cl 1.8 | 0.2° | a: Swanson/NBS 6.2931 Å at 25 °C. B: **assumption**, Debye estimate with Θ_D ≈ 235 K at 298 K, B = 11 492·T/(A·Θ_D²)·(1 + x²/36), the same method as NaCl's 1.3 Å² (2026-10-22). η: assumption |

Forged crystals are scaled to NaCl through NaCl's first order (`cell_scale`), so a forged NaCl differs from the fitted anchor
at higher orders (the anchor uses the fitted effective B 0.63 Å²). A new atom in the Forge starts at B = 1.0 Å²
(`DEFAULT_B_A2`, an order-of-magnitude UI default, not physics).

**Cross-crystal scale (computed, not fitted; assumes NaCl-like mosaicity).** A thick mosaic
crystal reflects an integrated fraction ∝ λ³|F|²/(V² μ) at a given λ (Warren, ch. 4). λ³ is common at
equal λ and cancels in the ratio. NaCl's missing λ³/μ_NaCl(λ) shape was absorbed by the Fig. 4 fit (Known
deviations), so multiplying by μ_NaCl/μ_X turns it into λ³/μ_X for crystal X. The Lorentz-polarization factor
and the Jacobian are applied in `scan.py` at the crystal's own θ and d. NaCl keeps its fitted `scale`; crystal X
multiplies order n at wavelength λ by

r_n(X, λ) = [|F_n|²/V²]_X / [|F_1|²/V²]_NaCl · exp(−2B(s_n² − s_1²)) · exp(+2 B_NaCl,th s_1,NaCl²) · μ_NaCl(λ)/μ_X(λ) · y_X,n(λ)/y_NaCl,1(λ)

with |F|² per conventional cell (`crystal.structure_factor_sq`), V the cell volume, and
μ = Σ occ·CS_Total(Z)·A/(N_A V) from xraylib on the `filters.MU_RHO_GRID_PM` grid, interpolated log–log
(`crystal.linear_attenuation_per_cm`). The factor exp(+2 B_NaCl,th s₁²) (s₁ = 0.1773 Å⁻¹; 1.0852 for
B_NaCl,th = 1.3 Å² = 13 000 pm², `crystal.NACL_THERMAL_B_PM2`) is there because NaCl's `scale` already contains NaCl's thermal factor while the other crystals'
|F|² is divided by NaCl's at-rest |F|². Since 2026-10-21 (Q1.3) it uses NaCl's physical thermal B, not the
effective fitted B_fit (which lumps extinction and the instrument; the old factor exp(+2 B_fit s₁²) = 1.040, the
text before said 0.961 by a sign slip). The first factor is `crystal.cell_scale`, the μ ratio
`crystal.mu_factor`, the last `crystal.extinction_ratio`; the last two are applied per λ to both the continuum and the
Kα/Kβ lines. Order-1 Kα line weights relative to NaCl (r₁ · Lorentz-polarization · μ ratio · yκ ratio, F1 2026-10-21):
LiF 1.31, Si 0.0356, calcite 0.0370, muscovite 0.0168 (NaCl = 1; before κ: 1.32, 0.0357, 0.0370, 0.0173); the same weights without the y ratio (y = 1) would
give 3.5, 0.83, 0.64 and 0.085. (An earlier version of this section converted B_NaCl,th from Å² to pm² with ×100
instead of ×10⁴, so the factor was 1.0008 and the weights read 1.22 / 0.033 / 0.034 / 0.016; fixed 2026-10-21, Q1.8.)

### Reflectivity model: extinction y and anomalous dispersion κ (Q1.2/Q1.3, F1; added 2026-10-21)

`Crystal.reflectivity_model` ∈ {`ideal_mosaic`, `darwin`, `mosaic_extinction`}; the presets are `mosaic_extinction`
(NaCl, LiF) and `darwin` (Si, calcite, muscovite). y(crystal, n, λ) is the integrated reflectivity of the
real crystal over the kinematic ideal-mosaic one (∝ |χ_h|²/Im χ_0), computed from the dynamical theory with the
complex structure factor (xraylib `FF_Rayl`, `Fi`, `Fii`; Γ = r_e λ²/(πV)), the same μ as `mu_factor`, σ and π
polarisation. The table the scan reads is the **reflectivity factor y·κ**, with κ = |F(f₀+f′+if″)|²/|F(f₀)|² the
anomalous-dispersion factor of the reflection (same B and phases; `crystal._chis_full`): the kinematic weight
(`cell_scale`, `f_sq_rel`) uses f₀ only, so y·κ completes it to y·|F(λ)|². For an `ideal_mosaic` crystal the row is κ.
κ is 1 ± 1–2 % for light elements and up to 0.67–0.86 for Zr/Y/Mo-bearing cells at Mo Kα (K edge at 68.9 pm).
`crystal.extinction_table` stores y·κ (the JSON key stays `extinction`) on the first nodes of `MU_RHO_GRID_PM` (λ ≤ 2d sin 85°/n plus one
node, 4 significant digits, `artifacts/tables/crystals.json`); Python and the web port both interpolate that rounded
table log–log (ends held), so they agree exactly.

- **Darwin–Prins** (thick symmetric Bragg case, absorbing; Darwin 1914, Prins 1930, Zachariasen 1945, Authier 2001):
  Si, calcite, muscovite. Checked against X0h (queried 2026-10-21): χ₀ and |S| of Si(111) to 1e-3, Darwin plateau
  widths of Si(111/333/444) to 0.5 %, the lossless limit (8/3)C|S|/sin 2θ, xraylib `Crystal_F_H` to 1e-3.
- **Secondary extinction** (Darwin 1922, Bacon & Lowde 1948, Sears 1997): a Gaussian mosaic of FWHM η, thick crystal,
  y = max(Darwin, secondary) when the Darwin y ≤ 1; the blocks reflect kinematically and have no coherent gain, so
  y = secondary alone when the Darwin y > 1. LiF and the NaCl reference.
- **y is not bounded by 1 for a perfect crystal.** To second order y ≈ 1 − (⟨C⁴⟩/⟨C²⟩) Re(χ_h χ_h̄)/(8 (Im χ₀)²): where
  f″ dominates a reflection whose f₀ + f′ part nearly cancels, Re(χ_h χ_h̄) < 0 and the Darwin crystal out-reflects
  the ideal mosaic (anomalous absorption, standing-wave gain). The pure absorption grating (|χ_h| = Im χ₀) gives
  y = 1.166–1.209 over θ = 2°–85°. The Darwin y is therefore returned unclipped; y > `crystal.Y_MAX` = 1.25 raises
  (just above that limit).
- Forbidden reflections (|F|² ≈ 0, e.g. Si(222) for spherical atoms) give 1.

y at Mo Kα (71.08 pm), orders 1–3 (2026-10-21):

| Crystal | n = 1 | n = 2 | n = 3 |
|---|---|---|---|
| LiF (η = 0.05°) | 0.310 | 0.769 | 0.942 |
| Si | 0.0350 | 1 (forbidden) | 0.0673 |
| calcite | 0.0472 | 0.126 | 0.119 |
| muscovite | 0.165 | 0.126 | 0.058 |
| NaCl reference (η = 0.2°, B = 1.3 Å²) | 0.812 | n/a | n/a |

Empirical inputs, all **assumptions** (not fitted, dated 2026-10-21):

| Parameter | Value (range) | Reasoning, source |
|---|---|---|
| NaCl η (reference only) | 0.2° (0.1–0.3°) | Typical mosaic spread of a cleaved or polished rock-salt crystal; NaCl's own scan is the Fig. 4 anchor and is unchanged, so η only fixes how much extinction the other crystals are compared to |
| B_NaCl,th (reference only) | 1.3 Å² (1.17–1.51) | Debye-model estimate (see above); enters exp(+2B s₁²) and the reference |F| |
| LiF η | 0.05° (0.01–0.2°) | Grown LiF has dislocations and subgrains (Gilman & Johnston, J. Appl. Phys. 1956–59); no measurement of the LD crystal. Larger η raises y (less extinction) |
| Si | Darwin | Dislocation-free wafer (Authier 2001) |
| calcite | Darwin | Iceland spar is the classic double-crystal standard (Allison & Williams, Phys. Rev. 35, 1476 (1930); Parratt, Phys. Rev. 41, 561 (1932); Bearden, Rev. Mod. Phys. 39, 78 (1967)). A real cleavage piece may be mosaic and read higher |
| muscovite | Darwin | Least certain. Cleaved mica as a near-perfect analyser (Faenov et al., Phys. Scr. 50, 333 (1994)). **Bench check:** a mosaic sheet with η = 0.005–0.01° would read 3.6–4.4 × brighter than this model. Compare the order-1 Kα peak with NaCl at equal tube settings |

Known limits of the extinction model: finite crystal thickness (all crystals are taken semi-infinite); primary
extinction inside mosaic blocks; beam-footprint overfill at small θ (the references have no beam width or crystal
size, so muscovite (002) at 2.04° would lose intensity to a finite crystal); Si(222) is 0 with spherical atoms (a real crystal shows it through the
bonding charge and Renninger double reflection). The one node a row holds past 85° is evaluated at no more than θ_B = 88° (the dynamical formulas are not used near backscattering).
Since F1 (2026-10-21) the order-1 Kα line weights relative to NaCl include κ and the NaCl reference carries κ too
(before → after: LiF 1.7485 → 1.7266 (−1.25 %), Si 0.02942 → 0.02937 (−0.15 %), calcite 0.03154 → 0.03160 (+0.17 %), muscovite
0.004399 → 0.004266 (−2.96 %); Kβ −1.06 %, −0.15 %, +0.18 %, −2.52 %; cell_scale·μ ratio·(yκ) ratio, before the
Lorentz-polarization factor). NaCl's own scan is untouched (Fig. 4).
The model is a deliberate change from the former ideal-mosaic "upper bound", which put Si's order-1 Kα peak height at 0.68 × NaCl (a peak-height ratio before Q1; the kinematic line weight of the same product is 0.83 in the table above).

The NaCl reference y_NaCl,1(λ) is calibrated only inside the Fig. 4 range (θ ≤ 25°, λ ≲ 240 pm). Beyond it (long λ, large
θ) it is a model extrapolation of the same extinction formulas, not a fit. Its effect on R̄ there is nil, because that
continuum is absorbed (air, absorber and the crystal's own μ; checked in the Q1.8 review, 2026-10-21: muscovite 8°–18°,
×1.000).

Absorption edges are kept sharp (see `filters.MU_RHO_GRID_PM`); the air Ar K edge (386.7 pm) lies beyond the Fig. 4 range (λ ≲ 240 pm), so the calibrated spectrum is unchanged. μ is held constant
beyond the 600 pm grid end (harmless: the absorber's T(600 pm) = 7e-32). Muscovite's order-1 Kα
(2.04°) sits under the direct-beam leak (local maximum at 1.74°).

## Forge element tables and forged crystals (`forge.py`, `artifacts/tables/forge_elements.json`)

Added 2026-10-21 (F1). Nothing here is fitted: the tables are xraylib 4.2.1 sampled and rounded, and a forged
crystal runs through the same model as a preset with its atomic data read from them (`Crystal.atoms`), so the
browser can build the entry of any user-designed crystal without xraylib.

| Table (Z = 1…92) | Grid and interpolation | Exported precision | Measured error vs xraylib (2026-10-21) |
|---|---|---|---|
| f₀ = `FF_Rayl` | uniform, step 0.01 Å⁻¹ to 3.0 (301 values; 3.0 > sin 85°/λ_min(35 kV) = 2.81), linear, last value held | 4 decimals | \|Δf₀\| ≤ 7.0e-4 max(f₀, 1) for s ≥ 0.03 Å⁻¹ (Li, worst); 1.13e-3 below it, where xraylib's own table has a cusp at s → 0 (the first order of any crystal here has s ≥ 0.05) |
| σ = `CS_Total`·A/N_A (cm²/atom) | per element, a subset of the 1000 `MU_RHO_GRID_PM` nodes (mean 62, max 117, chosen greedily until σ is within 6e-4 on every node), log–log in λ, sharp at the edges | 5 significant digits | 6e-4 on the grid nodes; between nodes 6e-4 at the 99th percentile, 4.6e-3 at worst (Z = 86), away from edges |
| edges | every step of `CS_Total` in 30–600 pm found from the cross section itself (K, L1–L3 and M1–M5, `forge._step_edges_pm`), two-sided σ at ±1e-7 in energy | σ as above, λ to 1e-6 pm | `mu_edges_pm` of a forged crystal is the plain union of its elements' edges (information; μ comes from `mu_nodes_pm`, see below) |
| f′ = `Fi` | the same nodes, linear in λ | 2 decimals | ≤ 0.06 e⁻ on the nodes (99th percentile between them); worst 0.27 e⁻ (Z = 84) next to an absorption edge, where Fi bends over 1–2 % in λ |
| f″ = `Fii` (negative in xraylib, kept) | the same nodes, log–log in \|f″\| | 3 significant digits | ≤ 8 % or 0.06 e⁻ on the nodes (3 % at the 99th percentile); worst 8.6 % (Z = 17) |
| A (g/mol) | xraylib value | | exact |

Size: 372 kB raw, 147.3 kB gzip (target 150, cap 300). `forge.TableAtoms` is `crystal.XraylibAtoms` served from these
tables; `forge.interp_nodes` is the one interpolation (a repeated abscissa is a step).

**Forged-crystal assumptions.** B per atom and, for `mosaic_extinction`, η are the user's choices; a forged crystal
has `fitted_debye_waller = False` and never gets the NaCl-fitted B. Atoms are spherical, independent and at rest
inside the 0 K f₀ times e^{−B s²} (no bonding charge, no anisotropic displacement); f′ and f″ enter through κ and
through the dynamical y, and the reflection is the ideal Darwin–Prins perfect crystal or a Gaussian mosaic with
secondary extinction, exactly as for the presets. `cell_scale` is relative to NaCl computed from the same tables (a
forged NaCl copy gives exactly 1). The y·κ rows are not rounded (the presets' are to 4 digits). Inputs are validated
(Z = 1…92, 0 < occupancy ≤ 1, 0 ≤ B ≤ 30 Å² (above any real isotropic B; at 50 Å² e^{−B s²} underflows and
χ_h χ_h̄ = 0), a finite nonzero integer cut, finite, a valid cell, no site above total occupancy 1, ≤ 120 orders);
every refusal is a `ForgeInputError` with a stable `code` for the UI. Where χ_h χ_h̄ still vanishes, y = 1 (the
kinematic limit) instead of 0/0; κ applies as usual. The limits live in `forge.CONSTANTS`, exported with the tables. Table
errors of f′, f″ are amplified in κ where F₀ nearly cancels: forged vs preset rows agree to 1 % for orders with
|F|² ≥ 1e-2 |F_1|², 5 % down to 1e-3 and up to 13 % (muscovite n = 23) below; those orders carry that small weight.
**Known limit of xraylib itself:** its Fi and Fii are smoothed over about ±2 % in energy around absorption edges (Zr just
below its K edge: Fii −2.38 against 0.54 from the optical theorem; Mo at Mo Kβ 0.668 against 0.565), so κ and y of a cell
with an element whose edge sits at a Mo line are good to that smoothing; the 8.6 % table error of f″ is minor beside it.
μ of a forged crystal is not read from the μ/ρ grid with edge thinning: `forge._mu_nodes` stores μ = Σ occ σ/V exactly
on the union of its elements' nodes with a two-sided step at every K, L, M edge, read log–log between nodes (never
extrapolated; the preset scheme of `filters.interp_log_mu` runs an edge through its neighbour's interval when two
elements' edges are close: Cu+Yb up to 120 % at 138.1–138.9 pm). `mu_per_cm` in the entry is the same on the grid.

**Forge-only quadrature.** `forge.FORGE_N_POINTS = 201` instead of `EXTINCTION_N_POINTS = 2001` for the Darwin and
mosaic integrals of a forged crystal: y differs from the 2001-point value by at most 2e-3 (relative). The error
grows as g = Im χ₀/|S| → 0, the transparent perfect crystal: 1e-4 at g = 1e-2, 1.05e-3 at 1e-3, 1.8e-3 at 1e-4 (a
test); secondary extinction ~1e-15; on 160 random orders and wavelengths of the four crystals 2.5e-4. Python builds the muscovite entry (56 orders, 20 333 rows) in
about 40 s, nearly all of it numpy call overhead; the same kernel in plain JavaScript at 201 points takes 0.6 s for
20 333 evaluations (a Node micro-benchmark), against ~6 s at 2001 points.
y above 1 is physics (see above), the same guard `Y_MAX` applies to presets and forged crystals.

**Agreement forged vs preset** (LiF, Si, calcite, muscovite, same cell, basis, cut and model): d and `max_order`
identical, `allowed_orders` equal, density exact, `f_sq_rel` ≤ 7.5e-4,
`cell_scale` ≤ 7e-5, μ ≤ 6e-4 away from edges, y·κ rows within the tolerances above (the presets' rows are rounded to 4
digits).

## XRF sample model (`fluorescence.py`, EPN Práctica 6)

Added 2026-10-22 (L3.1). Nothing here is fitted: every row is an **assumption** or a **literature** value.
Cross sections come from xraylib (`CS_FluorLine_Kissel_Cascade`, `CS_Total`, `DCS_Rayl`, `DCS_Compt`).

| Name | Value | Kind / source | Note |
|---|---|---|---|
| Geometry ψ1 = ψ2 | 45° | EPN Práctica 6 (target at 45°, detector at 90° to the beam) | `PSI_IN_DEG`, `PSI_OUT_DEG` |
| `S2_CM` | 6 cm | EPN Práctica 6 (s1 = s2 = 6 cm) | sample → detector window |
| `DETECTOR_RADIUS_MM` | 0.4 mm | LD 559 938 sheet (0.8 mm dia. active area) | Ω = π r²/s2² = 1.396e-4 sr, Ω/4π = 1.11e-5. Assumes the Si chip sits exactly at s2 = 6 cm; recessed by d mm, Ω × (60/(60+d))² (−15 % for 5 mm) |
| `AIR_IN_CM` | 12 cm | assumption (the 12 cm anode → crystal part of `scan.AIR_PATH_CM`, 18 cm) | air 1.205 mg/cm³, out path = `S2_CM` |
| Photon flux on the sample | `direct_per_s` · `tube_factor(21 kV, 1 mA)` / `fluorescence._gm_weighted_photons` (at `scan.DIRECT_ANCHOR_U_KV` = 21 kV) per source unit | assumption, 2026-10-22 (anchor voltage fixed the same day) | The GM reading behind `direct_per_s` was taken at 21 kV (EPN Práctica 1); at 1 mA, 18 cm air it is the 21 kV tube spectrum weighted by `detector.gm_efficiency` (ε̄ = 0.0057). The same source units with 12 cm air hit the sample. Anchoring at 35 kV would mix `tube_factor`'s ε = 1 extrapolation with the ε-weighted sum (ε̄ = 0.0032 there) and gave ×1.76 too much flux. Flux factor ×176 over the old ε = 1 anchor. It is **no longer a lower bound by ε but carries the GM gas-pressure uncertainty (ε ∝ p, ×5 either way)**, and the ≥ 950/s anchor of `direct_per_s` is itself a lower bound. Also: (a) the GM at 0° might accept only part of the beam while the sample intercepts all of it (pushes the flux up; a Cu-sheet measurement decides); (b) see the Ω note on the detector row |
| Tube spectrum | Kramers + Mo lines through the Pyrex absorber and 12 cm air | as `scan` | Collimator foils (554 832 set) multiply it by Beer–Lambert transmission at each incident λ; sensor foils multiply each line and the scatter at its detected λ (Compton at λ + 2.426 pm). Foil K/L edges (and edge − 2.426 pm) are grid nodes (bug hunt 2026-10-23: unbracketed edges had biased every line by up to −0.38 % with a Mo collimator foil). Not modelled: the foils' own fluorescence and scatter; a Zr sensor foil would add a Zr Kα peak (15.75 keV) estimated at 25–70 % of the attenuated Mo Kβ Rayleigh peak. No EPN guide uses a sensor foil with the 559 938 (whether the 554 832 frame fits in front of it is unverified) |
| Beam polarisation | unpolarised | assumption | Rayleigh/Compton use the unpolarised `DCS_*` at 90° (a real tube beam is slightly polarised) |
| CuZn39Pb3 | 58 Cu / 39 Zn / 3 Pb wt % | literature, LD 554 848 (CASSY Lab help P7.5.1.1/2) | infinitely thick (0.5 mm sheet, an assumption; worst case Rayleigh at 35 keV in Zn leaves ≈ 6e-4, negligible) |
| CuZn36 | 64 Cu / 36 Zn wt % | literature, same set | |
| Pure Cu, Zn, Pb | 100 % | idealisation (sheet purity ≥ 99.9 % assumed) | |
| Coin plating | 18 µm Cu, ρ = 8.96 g/cm³ (range 10–25 µm) | assumption, from the RCM Cu-plated steel cent analogue (4.5 % Cu by mass); see Plan "Calibration anchors" | `fluorescence.coin(plating_um)`; no mint publishes it |
| Coin core | pure Fe, infinitely thick | assumption (low-carbon steel, Mn ≲ 0.5 % neglected) | |
| Pb lines | 13 L lines whose production at 17.5 keV is ≥ 1 % of Lα1 (Lα1, Lα2, Lβ1–6, Lβ15, Lγ1–3, Lℓ) | xraylib | dropped as < 0.4 %: LB7, LB9, LB10, LB17 |
| Mo scatter | Rayleigh + Compton at 90°, Compton shift 2.426 pm | literature (CODATA) | |

**Included physics:** primary fluorescence (Sherman fundamental parameters, Coster–Kronig and cascade through xraylib's Kissel
cascade cross sections); secondary fluorescence in the bulk alloys (Shiraiwa & Fujino 1966, closed form; Zn Kβ and Pb L → Cu K,
Pb L → Zn K); the coin's two layers (plating attenuates incident and outgoing beam, adds its own lines) and the **interface
secondary** (Cu Kα, Kβ excite the Fe core, integrated numerically). Check, 35 kV: secondary/primary = 4.2 % for Cu Kα and
1.5 % for Zn Kα in CuZn39Pb3, 33 % for Fe Kα in the coin (18 µm).

**Omitted (Known deviations):**
- Compton Doppler broadening: the Compton line is a δ in energy (real width ≈ 0.3–0.5 keV at 17 keV, comparable to the detector FWHM).
- Tertiary excitation in the alloys (≲ 0.05 % of the primary; rough chain Pb L → Zn K → Zn Kβ → Cu K ≈ 0.015 × 0.026), and same-element cross-line excitation (Pb Lγ above the L3 edge, ≲ 1 %).
- Pb M lines (< 2.5 keV): below the detector window's cut-off.
- Fe → Cu excitation across the coin interface: Fe lines are below the Cu K edge, so it is zero.
- Housing fluorescence (Au L, Fe, Cu…): optional term, not in this module.
- Sample surface roughness, powder or oxide layers, finite sheet thickness (taken infinite), beam footprint larger than the detector's view.
- Absolute scale: see the flux row and the GM rows below. At 35 kV / 1 mA a pure Cu sheet gives 77 Cu Kα photons/s at the window (pure Zn: 91 Zn Kα; pure Pb: 28 Pb Lα1; Pb Lα1 in CuZn39Pb3: 0.75/s, ≈ 135 photons at the window and ≈ 82 counts in the MCA in 180 s); uncertain by ×5 either way through the GM gas pressure.

**LD 559 01 GM counter efficiency** (`detector.gm_efficiency`, added 2026-10-22; sets the XRF flux scale, never used by the Bragg outputs, whose fitted `scale` already absorbs ε). ε = T_window · (1 − exp(−μ_photo,gas m_gas)); ε(8.04 keV) = 0.0298, ε(17.48) = 0.0040, ε(20) = 0.0026.

| Name | Value | Kind / source | Note |
|---|---|---|---|
| `GM_WINDOW_FORMULA`, `GM_WINDOW_UM` | muscovite mica, 13.5 µm | LD instruction sheet 559 01 (d = 12–15 µm) | the LD shop page says 1.5–2 mg/cm², the sheet's 12–15 µm is 3.4–4.2 mg/cm²: the sheet is used |
| `GM_WINDOW_DENSITY_G_CM3` | 2.83 g/cm³ | literature (muscovite) | |
| `GM_ACTIVE_LENGTH_MM` | 36 mm | LD instruction sheet 559 01 | path along the axis (end window, beam on axis) |
| `GM_GAS` | Ne 99.4 % + Ar 0.5 % + Br₂ 0.1 % by volume | **assumption**: the sheet says neon/argon/halogen, composition unpublished; typical Penning mixture with halogen quench | |
| `GM_GAS_PRESSURE_HPA` | 500 hPa (plausible 100–1000) | **assumption**: not published | ε ∝ p at these energies, so the XRF flux scale is uncertain by ×5 either way |
| `GM_GAS_TEMPERATURE_K` | 293.15 K, ideal gas | assumption | |
| Photoabsorption only | xraylib `CS_Photo` | modelling choice | Compton electrons rarely trigger the counter |

**XRF scale — lab check wanted:** one measured Cu-sheet spectrum (total counts, 35 kV, 1 mA, 180 s, s1 = s2 = 6 cm) would replace the GM-efficiency estimate (the model predicts ≈ 77 Cu Kα photons/s).

**LD 559 938 Si-PIN and MCA** (`detector.pin_*`, `mca_counts`, `fluorescence.mca_spectrum`, added 2026-10-22, L3.3). Nothing fitted.

| Name | Value | Kind / source | Note |
|---|---|---|---|
| `PIN_WINDOW_UM`, density | 40 µm graphite-equivalent, 2.26 g/cm³ | LD instruction sheet 559 938; graphite density literature | xraylib `CS_Total` of C |
| `PIN_SI_UM`, density | 150 µm Si, 2.33 g/cm³ | LD instruction sheet 559 938; literature | xraylib `CS_Photo` of Si. ε(8.04 keV) = 0.853, ε(17.48) = 0.193 |
| `PIN_SIGMA_EL_KEV`, `PIN_FANO`, `PIN_EPS_KEV` | 0.160 keV, 0.15, 3.8 eV | LD instruction sheet 559 938 | FWHM = 0.403 keV at 6.40, 0.409 at 8.04, 0.444 at 17.48 keV |
| `PIN_DEAD_TIME_S` | 250 µs | LD instruction sheet 559 938 ("≈ 250 µs per pulse") | non-paralyzable; recorded fraction 1/(1 + R τ) with R the true detected rate (lines + continuum after efficiency) |
| Preset time is real time | assumption | the guide does not say; live time = t/(1 + R τ) is returned | at 35 kV / 1 mA the loss is 3.2 % (Cu), 3.6 % (Zn), 1.6 % (Pb), 3.1 % (CuZn39Pb3), 3.0 % (coin) |
| `MCA_FULL_SCALE_KEV_AT_REF_GAIN` | 40 keV at gain −2.5, 512 channels, linear, offset 0 (0.078 keV/channel; Cu Kα at channel 103) | **assumption**: keV per channel at the guide's gain is not published; chosen so the Mo Kα scatter (~17 keV, channel ~224) is on screen | scales ∝ 1/\|gain\|, so 256, 512, 1024 channels work while the width stays ≤ σ_el; non-linearity < 1 % ignored |
| No escape peaks | modelling choice | Si Kα escape (1.74 keV) is not modelled | would add a small peak 1.74 keV below each line |
| Gaussian-only response | modelling choice | no low-energy tail, no incomplete charge collection | each Gaussian is sampled at the channel centre × channel width (no erf, port-friendly) |

**Brass composition by the students' first-order method** (`analysis.gauss_fit_lines`, `analysis.composition`; model output, not fitted). Noise-free expected spectra, 35 kV, 1 mA, 180 s, pure standards fitted the same way. Key fit: Cu Kα, Zn Kα, Cu Kβ and Zn Kβ (9.57 keV) as four equal-width Gaussians in 7.5–10.0 keV (fitted/true areas: Cu Kα +0.14 %, Zn Kα +0.08 %); Pb Lα alone in 10.1–11.0 keV with the width fixed to the detector's (`pin_fwhm_keV`), fitted/true Lα1+Lα2 = 0.973. LD's 3-Gaussian method (7.6–9.2 keV, Zn Kβ not fitted) gives Cu Kα −0.3 %, Zn Kα −1.8 %.

**Fixed-centre fit** (`analysis.gauss_fit_fixed`, added 2026-10-22; model output, not fitted): centres fixed at `fluorescence.reference_lines_keV`, σ = `pin_fwhm_keV`/2.3548 per line, default window ±3σ around the lines, weighted *linear* least squares (Neyman weights max(counts, 1), then Pearson max(model, 0.5)); the covariance is absolute (never scaled by χ²/dof). On model spectra it is exact by construction (χ²/ν ≈ 0 on noiseless data; fitted/true areas within 1e-3 for Cu Kα, Kβ and Zn Kα when Kβ is fitted too, within 1 % in brass). With the same standards it gives ρ-weighted 61.1 / 35.2 / 3.7 % and plain 56.4 / 41.0 / 2.7 % (Cu / Zn / Pb) against LD's 61.6 / 35.6 / 2.9. Pb Lα (one Gaussian for Lα1 + Lα2, 0.10 keV apart = 0.57σ) reads 0.989 of the true Lα1 + Lα2 in pure Pb and 0.956 in brass, the extra −3 % being the linear background under the Zn Kβ tail. The "Pb Lβ" reference line (12.616 keV) is the Lβ group in a fit: it also takes Lβ3 and Lβ4, +5.6 % against Lβ1 + Lβ2 in pure Pb.

| Method | Cu % | Zn % | Pb % |
|---|---|---|---|
| plain, w ∝ A/A_pure (fitted areas) | 56.3 | 41.1 | 2.7 |
| plain, true areas | 56.3 | 41.0 | 2.7 |
| ρ-weighted (LD's method), fitted areas | 61.0 | 35.3 | 3.7 |
| ρ-weighted, true areas | 61.0 | 35.2 | 3.8 |
| ρ-weighted, LD's 3-Gaussian fit | 61.3 | 35.0 | 3.7 |
| LD published (CASSY Lab help P7.5.1.2) | 61.6 | 35.6 | 2.9 |
| nominal CuZn39Pb3 | 58 | 39 | 3 |

True A/A_pure: 0.543 Cu, 0.396 Zn, 0.026 Pb. The plain method reads Cu **low**: matrix absorption (Zn, above all Pb, absorb Cu Kα) beats the +4 % secondary fluorescence. The model reproduces LD's Cu-high / Zn-low only because it uses LD's ρ_i weighting, which is right for thin equal foils but not for infinitely thick samples (density cancels there). Pb 3.7 against LD's 2.9 is an honest difference: LD's Pb agreement is not reproduced to better than about one point (the done-when's ±1.5 holds). Nothing was tuned.

**MCA conventions and limits:** channel i is centred on i·kpc (a real ADC bins [i, i+1)·kpc, a half-channel shift; harmless because students calibrate). Channels must be no wider than `PIN_SIGMA_EL_KEV` (`kev_per_channel` raises otherwise; 256 channels need |gain| ≥ 2.44), because the Gaussian is sampled at channel centres (area error ~1e-8 at the limit). The Compton line is smeared by the detector only: no Doppler or geometric broadening (a few hundred eV in reality).

## Numerical and analysis choices (not fitted)

| Name | Value | Why |
|---|---|---|
| `filters.MU_RHO_GRID_PM` | 1000 log-spaced points, 30–600 pm, rounded to 1e-9 pm (the same nodes on every CPU) | μ/ρ is tabulated here and interpolated log–log, so the web app reads the same numbers (`artifacts/tables/mu_rho.json`). Away from edges it agrees with xraylib to within 3e-6, and 500 points would already give 1e-5. Beyond 30–600 pm the end values are held. Absorption edges are kept sharp without changing the grid (2026-10-21, physics review finding 9; before, an edge was smeared over one grid step, 0.3 % in λ, which put the Zr mid-transmission point +0.07 pm and Mo up to +0.1 pm above λ_K): `filters.mu_rho_edges_pm` lists the K, L1–L3 edges of every element of the material inside the grid, each located as the step of xraylib's own `CS_Total` (bisection when the table is built, exported as `edge_lambda_pm` in both tables; `EdgeEnergy` is only the starting point and stays the Moseley reference, `K_EDGE_KEV`: the step lies 0.0018 pm from it for Zr K, but up to 0.17 pm for L edges, and for Ag L2 a grid node, 351.8326 pm, sits between the two, so the side of that node is decided by the CS step). In a grid interval that holds an edge `filters.interp_log_mu` extrapolates log μ/ρ log–log from the two nodes on λ's own side of the edge (λ < λ_e: nodes i−1, i; λ ≥ λ_e: i+1, i+2); at a grid end the end value is held. Two edges in one or neighbouring intervals are refused (`edge_intervals` raises; none of the exported materials has them). Edges whose step is below 2 % (the trace K in Pyrex) are dropped. Elsewhere the result equals the plain interpolation to 1e-12. The tube-factor integral S(U) (`scan._photons_out`) splits its trapezoid lattice at the edges of the filters only, evaluating both sides of each (Ag plate at 30 kV was +1.06 %, Zr plate −0.38 %, Zr foil at 21 kV −0.27 %); air (Ar K 386.7 pm) and Pyrex edges are left out because T there is ~1e-62 (contribution < 1e-15), which keeps every no-foil fixture byte-identical. Crystal μ tables (`crystal.mu_edges_pm`, exported in `crystals.json`) use the same interpolation: calcite Ca K 307.0 pm, muscovite K K 343.6 pm, NaCl Cl K 439.3 pm (used only through the cross-crystal ratio `mu_factor`, so the NaCl scan itself is unchanged). Absorber μ/ρ tables: `artifacts/tables/mu_rho_absorbers.json`, same grid. The range covers λ_min at 35 kV and 1st order at θ = 85° |
| `analysis.PEAK_HALF_WINDOW_DEG` | 0.7° | Half-width of the region marked around each line, the leaflet's "entire width" of a peak, cut halfway to its neighbours. It is set by an a-priori criterion: reach Kβ₂, 0.37° below Kβ₁,₃ in 3rd order, plus ≈ 2.7σ. It does not change R̄. On the noise-free leaflet scan the model's own blend mean is 63.0945 pm (Kβ) and 71.0768 pm (Kα). At 0.7° the single orders give Kβ 63.075 / 63.094 / 63.103 pm for n = 1/2/3. The 1st order sits 0.02 pm low from a straight baseline under the curved continuum, the 3rd 0.007 pm high from the clipped Kβ₂ tail. They partly cancel in the mean (63.091 pm). Each ±0.1° of window moves λ̄(Kβ) by 0.008–0.016 pm (0.6° → 63.107, 0.8° → 63.083), below its 1σ counting error of 0.040 pm at the leaflet settings. Narrower windows miss Kβ₂ (0.4° → 63.18 pm), and from 1.0° on the 1st-order continuum biases Kβ low (63.06 pm). Chosen on 2026-09-24 in notebook 04; numbers from the 2026-09-25 refit |
| `analysis.MAX_LINE_FWHM_DEG`, `MIN_LINE_WIDTH_STEPS`, `MIN_PROMINENCE_SIGMA`, `MAX_STEP_DEG` | 0.8°, 1.2 steps, 5, 0.23° | A peak counts as a line if it is 1.2 Δβ steps to 0.8° wide and stands 5σ of Poisson noise above its surroundings. For XRF the same 5 is applied to area/area_err of `gauss_fit_fixed` on the *expected* counts, i.e. a median significance: a run expected at exactly 5σ falls below it half the time. Brass Pb Lα reaches 5σ at ≈ 81 s at 35 kV / 1 mA and 7.4σ at the guide's 180 s; the 0.5 Pearson floor makes the criterion conservative at low counts. This excludes the 35 kV bremsstrahlung hump (≈ 1.2° wide) and lone noise spikes. A line with FWHM 0.28° needs ≥ 1.2 steps across it, so Δβ > 0.23° raises. Lowering the width limit cannot exclude the hump at 30 kV, which is 0.2–0.8° wide in noisy scans; `FIRST_LINE_DEG` handles that case |
| `analysis.FIRST_LINE_DEG` | 6.02° | 1st-order Kβ₂ (6.32°) minus 0.3° (≈ 2.5σ). No Mo K line reflects lower, so any peak below this is the bremsstrahlung hump |
| `analysis.MIN_PEAK_SEPARATION_DEG` | 0.5° | Of peaks closer than this, only the most prominent is kept. That is above the Kβ₁,₃–Kβ₂ spacing (0.37° in 3rd order, resolved at σ = 0.05°) and below the closest distinct pair (1st-order Kβ–Kα, 0.81°). The whole blend still falls inside its ±0.7° window, so the centroid is unchanged |
| `analysis.MAX_ORDER_SPREAD_PM`, `MAX_KB_KA_RATIO_DEV` | 3 pm, 3 % | Pairing checks: λ of one line across orders, and λ(Kβ)/λ(Kα) = 0.888 per order. A wrong pairing is off by ≥ 30 pm or ≥ 40 %. These limits also stay above the honest near-edge bias of 1st-order Kβ, so they reject mislabelling, not bias. The scan must also start ≥ `PEAK_HALF_WINDOW_DEG` below 1st-order Kβ and hold at least two orders |
| `analysis.THRESHOLD_HALF_WINDOW_DEG`; the teacher-key sweep | ±0.5°; 22–35 kV in 1 kV steps at 0.1 mA, Δt = 10 s | Line-threshold evaluation (`line_threshold_kv`, `model/scripts/teacher_key.py`). The window's lower end (6.7°) is ≈ 2.3σ above 1st-order Kβ₁,₃. That tail scales with the line, so it rescales the areas without moving U_K. The sweep starts at 22 kV, where the 1st-order Kα is visible, and runs at 0.1 mA to keep dead time small. Noise-free bias budget: straight baseline −0.18 kV, dead time +0.10 kV (0.1 mA) or +0.70 kV and m → 1.35 (1 mA). The fit recovers the model's own power law (m, `source.LINE_EXPONENT_M`), so it validates the method, not the near-threshold physics. Chosen 2026-09-25 |
| `analysis.EDGE_SPLIT_HALF_WINDOW_DEG`, `EDGE_FIT_HALF_WINDOW_DEG` | 0.3°, 0.5° | Absorption-edge search (`k_edge_deg`). Coarse step: mean T over 0.3° (3 points at Δβ = 0.1°) on each side of every split, ≈ 2.4σ of the instrument width: long enough to average noise, short enough that the two sides see one edge. Fine step: the convolved step-with-slope fit over ±0.5° (≈ 4σ). Window stability, noise-free, 2026-10-20: Ag moves 0.0004° and In 0.005° between ±0.3° and ±0.7°; Zr and Mo move 0.012° and 0.024° (their open spectrum is steep, see below) |
| `analysis.MAX_EDGE_STEP_DEG` | 0.15° | Coarsest Δβ `k_edge_deg` accepts. At 0.16° the 0.3° split window holds only one point per side (the coarse search needs two) and no edge is found; the ±0.5° fit window then also has fewer than 6 points. Checked noise-free 2026-10-20 with the limit lifted: 0.15° works, 0.16° fails |
| `analysis.attenuation_fit` (EPN Práctica 1) | ln T = −μ d through the origin, weights = Poisson variance of each R_i; R₀ and background errors propagated as a common (correlated) term; no dead-time correction | T = (R − b)/(R₀ − b) as in the guide. T(0) = 1 is exact, so the line has no free intercept. The common R₀ error would be wrongly shrunk by 1/√N if treated as independent weights. Dead time (non-paralysable, `detector.dead_time_correct` is its inverse) is left to the caller because the guide does not correct it and it bends the data at ≈ 1000/s. For the polychromatic beam μ is an effective value: noise-free Al wheel (0.5 → 3 mm, true rates, 2026-10-20), μ_eff/ρ = 6.91 → 5.38 cm²/g at 21 kV (xraylib Mo Kα alone: 5.11); with the collimator Zr filter 6.97 → 5.91 (21 kV, straighter) and 4.21 → 2.92 (35 kV, not straighter: the spread grows from 1.04 to 1.29). The Pyrex wall at ×0.8 / ×1.2 moves μ_eff by +7.7 / −5.8 % at 0.5 mm and +3.6 / −2.9 % at 3 mm. Added 2026-10-20 |

## Absorber thicknesses (`filters.FOILS_MM`, `filters.WHEELS_MM`)

Areal density = 100 · thickness_mm · ρ (xraylib; polystyrene from the NIST compound). Added 2026-10-14.

| Item | Thickness (mm) | Source |
|---|---|---|
| Foil set 554 832 | Zr 0.05, Mo 0.1, Ag 0.05, In 0.3, Al 0.5, Fe 0.5, Cu 0.07 | LD catalog |
| 554 834 Al plate | open, Al 0.5, 1.0, 1.5, 2.0, 2.5, 3.0 (slots at 0°, 10° … 60°) | LD catalog |
| 554 834 material plate | open, Polystyrene, Al, Fe, Cu, Zr, Ag (slots at 0°, 10° … 60°), 0.5 each | Slot order and 0.5 mm from LD P6.3.2.1 (2026-10-29; open question 10 answered); 0.5 mm also in the LD catalog. User decision 2026-10-29 supersedes the earlier 0.4 mm (2026-10-14) |

Foil set 554 832 as used (thickness from the LD catalog × bulk density from xraylib `ElementDensity`; added 2026-10-20):

| Foil | Thickness (mm) | ρ (g/cm³) | ρx (mg/cm²) |
|---|---|---|---|
| Zr | 0.05 | 6.506 | 32.53 |
| Mo | 0.1 | 10.22 | 102.2 |
| Ag | 0.05 | 10.50 | 52.50 |
| In | 0.3 | 7.31 | 219.3 |
| Al | 0.5 | 2.699 | 134.9 |
| Fe | 0.5 | 7.874 | 393.7 |
| Cu | 0.07 | 8.96 | 62.72 |

Bulk density is an assumption: a rolled foil can be a few % lighter, and every ρx scales T as exp(−μ/ρ·ρx). The Moseley
practice (P5) reads only the edge *position*, which does not depend on ρx.

**Material plate readings (EPN Práctica 1, run 2a; added 2026-10-20).** At 30 kV the 0.5 mm plates transmit (open beam = 1, no
dead time or background):

| Absorber | T | True rate at 0.02 mA (/s) | True rate at 1 mA (/s) | Rτ at 1 mA |
|---|---|---|---|---|
| Polystyrene | 0.97 | 3145 | 1.6e5 | 16 |
| Al | 0.56 | 1798 | 9.0e4 | 9.0 |
| Fe | 1.3e-3 | 4.1 | 205 | 0.02 |
| Cu | 1.3e-4 | 0.42 | 21 | 0.002 |
| Zr | 1.6e-3 | 5.3 | 264 | 0.03 |
| Ag | 3.9e-4 | 1.3 | 64 | 0.006 |

At the guide's 0.02 mA the four heavy plates would read only 2–22× the 0.24/s background, so the counting statistics and the background
dominate. At 1 mA (the guide's setting for them) they read 21–264/s, and dead time is negligible. The light plates are the reverse:
at 1 mA they would paralyse the GM, so the guide counts them at 0.02 mA. This is real, it is why the guide changes I between materials,
and the app does not hide it (test `test_material_plate_needs_more_current_for_heavy_absorbers`). Zr transmits more than Fe: Mo Kα (17.5 keV) lies just below the Zr K edge (18.0 keV), in Zr's low-absorption window, and the 30 kV beam is rich there (Kα is ≈ 70 % of what passes the Zr plate), while Fe and Cu pass only the weak hard end of the continuum (23–29 keV). Kβ (19.6 keV) lies above the Zr edge and is absorbed. μ/ρ against Z is not monotonic across an edge.
Dead time still enters the heavy plates' T through the open-beam reference (read at 0.02 mA, Rτ ≈ 0.32, 24 % loss) and must be corrected before the ×50 scaling (`analysis.scaled_transmission`); for Al and polystyrene it is the dominant systematic (Al −20 % uncorrected).

### Moseley analysis (EPN Práctica 5): known deviations

The K edge found by `analysis.k_edge_deg` (Gaussian-convolved step with its own plateau slope) differs from the
tabulated θ(λ_K) = asin(λ_K/2d). Noise-free at P5 settings (35 kV, 1 mA, Δβ = 0.1°, Δt = 5 s, ±0.5° window, measured
2026-10-21, sharp edges), edge minus θ(λ_K), with the 1σ counting error σ_θ of one P5 scan:

| Foil | Edge − θ(λ_K) | σ_θ | of which (a) resolution | (b) μ/ρ grid ramp (removed) | (c) dead time | (d) leak, scatter, background |
|---|---|---|---|---|---|---|
| Zr | −0.047° | 0.0055° | main part | none (sharp) | ≤ 0.006° | < 0.0003° |
| Mo | −0.061° | 0.0103° | main part | none (sharp) | ≤ 0.006° | < 0.0003° |
| Ag | −0.002° | 0.0106° | main part | none (sharp) | ≤ 0.006° | < 0.0003° |
| In | −0.006° | 0.0121° | main part | none (sharp) | ≤ 0.006° | < 0.0003° |

- **(a) The tube's Mo lines inside a ratio of convolved spectra (the cause of the Zr and Mo offsets).** The counter sees
  the reflected spectrum convolved with the instrument Gaussian (`sigma_deg` = 0.123°), so T = R_foil/R_open is a ratio
  of two convolved spectra, not a convolved T. Mo Kβ₂ (62.102 pm) lies 0.11 pm and Kβ₁ (63.253 pm) 1.3 pm beyond Mo's K
  edge (61.992 pm), and Kα (70.9 pm) 2 pm beyond Zr's (68.887 pm): within 1–2σ of the Zr and Mo edges a strong line
  that the foil transmits (Kβ₂ through the Mo foil: T = 0.261) pulls the steepest rise of T to lower angle. Ag and In
  are far from the lines. A real goniometer has the same effect. It is not tuned away. Control (2026-10-21,
  `line_to_cont = 0`, P5 settings, ±0.5°), edge − θ(λ_K): continuum only Zr +0.0049°, Mo +0.0087°, Ag −0.0015°, In
  −0.0057° (all within 0.015°: `k_edge_deg` is unbiased on a smooth spectrum; R/R_tab − 1 = +0.7 %, σ_K 3.56, χ²/dof
  0.38); with the lines −0.0473°, −0.0607°, −0.0015°, −0.0057° (R −2.6 %, χ²/dof 3.2). The extra offset is −3.6σ_θ (Zr)
  and −5.1σ_θ (Mo), 0.000° (Ag), 0.000° (In). Zr and Mo shift with the fit window (−0.046° to −0.058° and −0.058° to
  −0.076° from ±0.7° to ±0.3°); Ag and In hardly do (0.0004° and 0.005°). Mo is the most biased point on every
  crystal: on LiF, pull (λ_fit − λ_K)/σ_λ, with the lines Zr −1.3, Mo −6.0, Ag 0.0, In −0.5 (χ²/dof 7.5), without
  them −0.1, +0.1, 0.0, −0.5 (0.49). The LiF R (and NaCl-without-lines R) matches the tabulated-edge fit within 0.1 %
  because the tilt of the errors cancels in the fit; with the lines that is a coincidence, not an unbiased edge set.
- **(b) μ/ρ grid ramp (removed 2026-10-21).** Until then the absorber's μ/ρ was interpolated across the grid interval
  holding λ_K, so the edge was a 0.3 % ramp. For Mo that ramp wrongly attenuated the tube's own Kβ₂ in the 0.1 mm foil
  (T = 0.073 against 0.261 from xraylib, same grid interval); that, not a "cancelling" of the resolution effect, is
  ≈ 0.0175° of Mo's −0.021° change (≈ 0.004° is the sharper continuum edge). For Zr, Ag and In the ramp shifted the edge
  by +0.006, −0.005, −0.001° and partly hid (a) (Ag's λ_K sits at 84 % of its interval). With sharp edges Zr moves from
  −0.0445° to −0.0473°, Mo from −0.0397° to −0.0607°, Ag from −0.0079° to −0.0015°, In stays at −0.006° (noise-free,
  ±0.5° window). Edge-wavelength errors against the tabulated λ_K, before → after: NaCl Zr −0.435 → −0.462 pm, Mo −0.388
  → −0.594, Ag −0.078 → −0.015, In −0.058 → −0.056; LiF Zr −0.009 → −0.065, Mo −0.107 → −0.377, Ag −0.073 → −0.001,
  In −0.010 → −0.056.
- **(c) Dead time.** The observed (dead-time-affected) rates are used, as the students take them. This adds at most
  0.006° to the offset; its sign varies by foil.
- **(d) Leak, scatter and background** are negligible (< 0.0003°).
- **Correlation.** The four foil scans share one open scan, so their edges are slightly correlated (up to ≈ 40 % of T's
  variance on the Zr plateau); `moseley_fit` treats them as independent.

Effect on the Moseley fit (√(1/λ_K) against Z), weighted by the counting errors as `moseley_fit` is used in the teacher key:

| Edges | R (m⁻¹) | σ_K | χ²/dof |
|---|---|---|---|
| Tabulated (xraylib) | 1.0836e7 (0.987 R∞) | 3.41 | |
| Model, noise-free (weighted) | 1.055e7 (0.962 R∞) | 2.78 | 3.2 |
| Model, noise-free, continuum only (weighted) | 1.092e7 (0.995 R∞) | 3.56 | 0.38 |

So the bias is R −2.6 % and σ_K −0.63 against the tabulated edges (before the sharp edges: −2.3 % and −0.57). A single P5 measurement has a counting error of
±1.0 % on R and ±0.20 on σ_K, so the bias is ≈ 2.6σ and 3.2σ of one measurement: a systematic the quoted ± does not
include (the unweighted fit gives −3.3 % and −0.78). The noise-free χ²/dof of 3.2 says the four edges no longer lie on a line within their counting errors: the Zr and Mo bias is larger than their ±. Neither is tuned away.

- **Foil K fluorescence is not modelled.** The foil re-emits ≈ 63 % of the photons absorbed above its edge as K X-rays
  (Zr: ω_K = 0.734 × (1 − 1/J) with jump factor J = 6.75). Only ≈ 1–2 % of the absorbed flux reaches the counter, after solid
  angle, self-absorption and detector efficiency, which is how the transmission just above the Zr edge goes from 0.046
  to ≈ 0.065. This is an estimate (Plan-New-Features physics review, 2026-10-14), not a model output. It changes the
  depth of the edge, not its position.

## Apparatus assumptions (web emulator)

Added 2026-10-14. No measurement behind any of them.

| Name | Value | Why |
|---|---|---|
| Direct-beam profile (`scan.direct_rate` `sensor_deg`) | Gaussian, width = `leak_width_deg` | Without a crystal the counter sees the beam's angular profile; its width is assumed equal to the fitted leak halo |
| `scan.COLLIMATOR_WIDTH_MM`, `scan.COUNTER_SLIT_WIDTH_MM` | 0.2 mm, 0.3 mm (2026-10-30) | Effective slit widths for the angular resolution σ(s₁, s₂); the LD sheets give no slit widths. Chosen, not fitted, so that at the reference the collimator term is 29 % and the counter term 45 % of σ² (residual 26 %); rms of a uniform slit is w/(s√12) |
| `scan.SOURCE_TO_COLLIMATOR_CM` | 7 cm (2026-10-30) | Tube focus → collimator slit; the 12 cm anode → crystal of `AIR_PATH_CM` at s₁ = 5. Used only in the direct-beam inverse square |
| `scan.REF_S1_CM`, `scan.REF_S2_CM` | 5 cm, 6 cm (2026-10-30) | Geometry of the Fig. 4 fit (leaflet). Everything fitted (σ, scale, leak, scatter) is quoted there |
| `scan.DIRECT_REF_S1_CM`, `scan.DIRECT_REF_S2_CM` | 5 cm, 5 cm (2026-10-30) | Geometry of the `direct_per_s` anchor (EPN Práctica 1) |
| `WHEEL_WINDOW_DEG` | 3° | A 554 834 slot is in the beam within ±3° of its centre; between slots the frame blocks it (background only). Binary window, to be confirmed by the lab staff |
| `Apparatus.saturated` threshold | dead-time loss 1 − m/R = m·τ > 0.30 (R·τ > 0.43) | For a non-paralysable counter the lost fraction equals the observed m·τ. The warning fires when more than 30 % of the pulses are lost, i.e. when the dead-time model choice and the uncorrected rates start to dominate the evaluation. Changed 2026-10-30 from R·τ = 0.3 (23 % loss), which tripped at the guide's own settings (30 kV, 0.02 mA, open slot: ≈ 24 % loss in our model, whose rate is ≈ 1.33× the leaflet's tabulated 1841/s, i.e. ≈ 18 % there; the polystyrene 0.5 mm reading of P1 run 2a, 24 %, no longer trips either). Wording says what is lost, not that the counter is broken. Web-only UI threshold, no model value changes |

## Geometry: s₁ and s₂ (added 2026-10-30)

`expected_rate(..., s1_cm, s2_cm)` and `direct_rate(..., s1_cm, s2_cm)`. No new fitted parameter: every factor is 1
at the reference geometry, so the Fig. 4 match, the fixtures and `direct_per_s` (EPN P1 anchor) are unchanged there.

- **Resolution** `angular_sigma_deg`: σ² = σ_col² + σ_slit² + σ_res², σ_col = w_col/(s₁√12), σ_slit = w_slit/(s₂√12)
  (widths in the table above). σ_res² = `sigma_deg`² − σ_col²(5) − σ_slit²(6), i.e. fixed by σ(5, 6) = 0.1228°, and
  stands for the crystal mosaic, the focal spot and the Kα doublet. σ also sets the rocking-curve width. With
  these widths σ = 0.264° (s₂ = 2), 0.100° (s₂ = 12) at s₁ = 5; 0.151° (s₁ = 3), 0.111° (s₁ = 8) at s₂ = 6.
- **Bragg signal and scatter** `crystal_factor` = (6 cm/s₂)². The collimator fixes what reaches the crystal (power
  independent of s₁); the illuminated spot is a source of fixed power and the counter slit of fixed area subtends
  Ω ∝ 1/s₂² (a slit, not a round window, so it is not 1/s₂). Line area scales with it; the peak height by that over σ.
- **Direct beam** (`direct_rate`, the leak halo) `direct_beam_factor` = (r_ref/r)², r = 7 cm + s₁ + s₂: with no
  crystal the counter slit collects the diverging beam as from a point source at the tube. `direct_rate` is normalised at
  s₁ = s₂ = 5 cm (the anchor); the halo at the Bragg reference (5, 6). So the same beam at (5, 6) reads
  (17/18)² = 0.89 of the anchor, which is the physical consequence of the two references.
- **Not modelled:** the air path (≤ 0.4 %/cm for Mo Kα), the crystal footprint exceeding the crystal at small s₁,
  a θ-dependent σ, the counter slit height. Arm collision limits stay in `apparatus/collision.ts`.
- The factors are scalings, not measurements: they give the right trend (leaflet: smaller s₂, more counts, worse
  resolution) but the exponents and widths should be checked against a real scan at another s₂.

## Calibration-only (never used by the model)

| Name | Value | Where | Meaning |
|---|---|---|---|
| `FIG4_BETA_OFFSET_DEG` | 0.090 ± 0.004° | `tests/test_scan.py`, notebook 03 | The digitized Fig. 4 peaks sit a constant +0.09° above the Bragg angles. The leaflet's Table 3 lists the measured angles at the Bragg angles, so the shift comes from how the figure was drawn, or from the digitizer: both panels share the pixel zero `x0 = 97`, and 1.9 px would explain it. It is constant across all six peaks (0.07–0.11°, no trend), and the linear panel alone gives 0.094°. The fit compares the model at β − offset, and `expected_rate` does not include it |

## Known deviations

- **`tube_factor` counts photons without ε_GM(λ) weighting.** Its U-dependence is the photon rate leaving the tube, not what the GM counts (existing approximation, unchanged; the XRF flux scale does weight by `detector.gm_efficiency`, anchored at the 21 kV reading so the two weightings never meet). Size of the gap (physics review 2026-10-22): with ε_GM weighting the GM rate at 35 kV / 1 mA would be 1.68e5 instead of 2.97e5, T(Cu 0.4 mm, 30 kV) 1.45e-4 instead of 4.84e-4, T(Al 0.3 mm, 21 kV) 0.497 instead of 0.559. Open question 12 in Plan-New-Features.md decides whether `direct_rate` should weight by ε_GM.
- **The XRF flux may count part of ε_GM(λ) twice.** The Fig. 4-fitted absorber already carries part of the counter's λ-dependence (next bullet), and the XRF anchor applies `detector.gm_efficiency` on top of it. Same open question 12.

- **Line tips are 0.70–0.94 × Fig. 4.** The fit matches the log-panel wings. The tips come
  out 6–30 % low (Kβ in 2nd order is worst, 0.70; 1st- and 3rd-order Kα are best, 0.94). Freeing Kβ/Kα, giving the lines
  their own σ, a pseudo-Voigt profile, and τ ∈ 0–100 µs did not close the gap. We did not add a free peak-sharpness term. The relative
  heights across orders agree within 25 %.
- **Counter efficiency ε(λ) is constant.** The 559 01 fill gas is unknown, so a λ-dependent ε would be
  degenerate with the absorber. A constant ε cancels in T; the direct-beam μ_eff (EPN P1) inherits the Fig. 4-fitted detected shape (ε(λ) included, 35–200 pm); the residual ≈ 1–2 % on μ_eff comes from the crystal's Q(λ) ∝ λ³/μ treated as constant in the fit, not from ε. Not needed now (physics review 2026-10-20).
- **One σ for every angle.** σ depends on s₁ and s₂ (next section) but not on θ or λ (Kα₁/Kα₂ dispersion, which grows with θ, is inside the residual).
- **Distance dependence is an assumption, not a measurement** (2026-10-30). See "Geometry: s₁ and s₂" below.
- **Mosaic crystal: Q/2μ taken as constant within an order.** In reality, λ³/μ_NaCl(λ) rises
  ≈ 27 % from 40 to 200 pm. Adding it (xraylib, no free parameter) improves the fit by only 0.0003 dex
  and moves the absorber by ≈ 6 %. The fitted absorber absorbs it. Extinction is folded
  into B.
- **The ≈ 3° minimum is too shallow.** The model's floor is scatter plus background (5.54/s) plus the leak tail: at β = 2.7°
  it gives 7.9/s against 5.7/s in Fig. 4, and at 2.8° it gives 6.6/s where the figure dips below its axis
  (≲ 4.4/s, a point the digitizer omits). Before the refit it was 11/s and 8.7/s, mostly because scatter dropped from 6.8/s to 5.5/s. A steeper leak shape could fix this but is not justified by
  the data yet.
- **1st-order Kβ reads low near the K edge.** The Kβ line sits on the steep rise of the continuum hump, which a
  straight baseline cannot follow. λ̄(Kβ) is 63.09 pm at 35 kV, 63.05 pm at 30 kV and 62.9 pm at
  25 kV (mean of noisy scans), where 1st-order Kβ alone gives ≈ 62.5 pm. Kα and higher orders are unaffected. This is a limit of the
  evaluation, not of the model, and students at low U would see it too.
- **Analysis tested range** (noisy Monte Carlo, `wavelength_table`, 2°→25°, Δβ = 0.1°): 0 mislabelled tables at 25, 30 and 35 kV,
  Δt = 1–10 s, σ = 0.05–0.2°. Failures are clear ValueErrors: 0.2 % at the leaflet settings, 11 % at 25 kV, and 65 % at σ = 0.03°,
  where lines are narrower than 1.2 steps.
- **Counts after dead time are drawn as Poisson.** A dead-time-limited GM counter is slightly
  sub-Poissonian (variance ≈ N(1 − Rτ)², 0.58× at the 1st-order Kα tip). `detector.sample_counts` ignores this.
- **Leak and scatter are phenomenological.** They have no explicit dependence on the slits or the crystal,
  and their I·S(U) scaling is assumed. In uncoupled geometry the leak ignores the crystal shadowing the direct beam. With the tube off the model reads only the natural background, dead_time(`background_per_s`).
- **Rocking width = σ.** With target and sensor uncoupled, the Bragg signal falls off as a Gaussian of width σ in
  S/2 − β. The real rocking curve is the crystal's mosaic spread folded with the beam divergence, and only part of
  the coupled σ. The model lumps all of σ into it rather than adding a parameter no data constrain.
  In coupled scans it plays no role.
- **No Mo K absorption edge in the continuum.** Self-absorption in the anode would put a small step at 61.9 pm
  (λ_K). The effective glass absorber has no such edge.

## Validity range

What the model is trustworthy for, beyond the 35 kV, 1 mA, 2°–25° scan it was fitted to:

- **U ≳ 15 kV.** At lower voltages the whole spectrum lies where the effective absorber cuts it by orders of
  magnitude, and there its shape (glass, not the real wall and anode) is untested. At 10 kV R̄ is essentially zero.
- **|β| ≳ 1.5°.** Below that the rate is the leak's Gaussian extrapolation, ×380 beyond the data, and dead time
  (τ unverified) reduces it by up to ×4 (7280/s instead of 26 800/s at β = 1°).
- **Duane–Hunt tasks at 20–35 kV** work: the onset angle follows λ_min = hc/eU. At lower U the onset moves into
  the absorber-dominated region above.
- **Line threshold.** Lines switch on at U_K = 20.0 kV as (U/U_K − 1)^1.67, so they become visible only well
  above it. The answer key extrapolates line area against U to zero instead of reading the first visible
  peak (Bragg-Simulation-Plan.md, Phase 9).
- **Orders n ≥ 4 (β > 25°)** are extrapolation: r₄ = 0.089 and r₅ = 0.038 follow from the Debye–Waller factor
  fitted to orders 1–3, and no data beyond 25° test them.
- **`direct_rate` while Rτ ≲ 0.3** (true rate ≲ 3000/s). Above that a real GM counter paralyses and reads far less
  than the non-paralyzable R/(1 + Rτ): the open beam at 30 kV, 1 mA (1.6e5/s true) would read 9418/s here. Even polystyrene
  0.5 mm at 30 kV, 0.02 mA loses 24 % to dead time. `Apparatus.saturated` warns at such rates.
- **Still unverified:** `LINE_EXPONENT_M` (only 35 kV data) and τ of the 559 01 counter.
