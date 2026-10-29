# EPN lab practices on the X-ray apparatus

Paraphrased settings and steps from three EPN lab guides (Laboratorio de Física Atómica y Molecular; credit them to
"Técnicos de Laboratorio del Departamento de Física de la EPN"), plus
accessory and sample data researched on the web. The guides are kept in `refs/` (gitignored). Cite them as
`EPN Práctica 1`, `EPN Práctica 5`, `EPN Práctica 6`. The roadmap that uses these facts is `Plan-New-Features.md`.

The guides use "target" and "sensor" for the two goniometer arms, and Δβ = 0 for the exposure-timer mode, as on the
554 800 panel (see `apparatus-554800.md`).

## Práctica 1: attenuation vs absorber thickness and material

**Setup.** Collimator, absorption accessory 554 834 on the target holder, GM counter in the sensor seat (cable to the
GM TUBE socket). s₁ = s₂ = 5 cm. Press ZERO, close the doors. The guide says calibration can be skipped if the
first reading is at least ≈ 950 /s.

**Absorber selection.** In TARGET mode, turn ADJUST to put one absorber in the beam. The absorbers sit about every 10°:
0°, 10°, … 60° (7 positions).

| Run | Absorbers | U | I | Δt | Notes |
|---|---|---|---|---|---|
| 1a thickness | Al 0.5 → 3.0 mm in 0.5 mm steps | 21 kV | 0.05 mA | ≥ 3 × 20–30 s | Δβ = 0, SCAN, read the mean with REPLAY |
| 1b thickness + Zr (optional) | same, Zr filter on the collimator | 21 kV | 0.15 mA | 200 s | |
| 2a material | open, C*, Al, Fe, Cu, Zr, Ag in increasing target angle (0°–60°) | 30 kV | 0.02 mA (first three, 0°–20°), 1 mA (30°–60°) | 20–30 s, ≥ 3 runs | the heavy ones need the higher current |
| 2b material + Zr (optional) | same, Zr filter | — | — | — | repeat 2a |
| 3 background | none | 0 kV | 0 mA | ≥ 100 s | Δβ = 0 |

\* The guide says C. In the LD catalog the lightest absorber of 554 834 is **polystyrene** (Z ≈ 6).
The guide gives the material-set thickness as 0.5 mm, the same as the LD catalog. **The project uses 0.5 mm** (user decision 2026-10-29, superseding 0.4 mm of 2026-10-14).
The Al thicknesses are as listed.

**Slot order (open question 10, answered 2026-10-29 from LD leaflet P6.3.2.1).** The material plate holds, at
0°, 10° … 60°: open, polystyrene ("C"), Al, Fe, Cu, Zr, Ag. The leaflet measures them in that order, the first three at
0.02 mA and the last four at 1 mA, like the Al plate whose open slot is also at 0°. The leaflet uses 0.5 mm, as does the
project.

**Analysis asked.** T vs thickness; μ from the slope of ln T vs thickness; T and μ for each material; μ vs Z.

## Práctica 5: Moseley's law and the Rydberg constant

**Setup.** Collimator, NaCl crystal on the target holder, GM counter on the sensor arm, s₁ = s₂ = 5 cm, COUPLED mode.

| Setting | Value |
|---|---|
| Δβ | 0.1° |
| β limits | 3.7° → 7.5° (another crystal needs another window) |
| U, I, Δt | 35 kV, 1 mA, 5 s |
| Foils | Zr, Mo, Ag, In, one scan each, foil in front of the sensor |

LD's own version of this experiment (CASSY Lab help page "Moseley's law and determination of the Rydberg constant")
uses the same U, I, Δβ and Δt, scans 3° → 8°, and records a reference scan without a foil first. The guide doesn't
mention the reference scan explicitly, but the transmission spectra it asks for need one.

**Analysis asked.** Diffraction spectrum per foil; transmission spectrum per foil; K-edge wavelength vs Z; Rydberg
constant and screening constant with errors against literature values.

## Práctica 6: brass composition by X-ray fluorescence

**Setup (summary).** Collimator; sensor arm parked at 90° before the energy detector is mounted (never move the arm
with it fitted); detector in the sensor seat, signal to the MCA box on Sensor-CASSY; s₁ = s₂ = 6 cm; target at 45°;
doors closed.

| MCA setting | Value |
|---|---|
| Channels | 512 |
| Pulses | negative |
| Gain | −2.5 |
| Time | 180 s |
| U, I | 35 kV, 1 mA |

**Energy calibration (two points).** Cu sheet → find the Cu Kα channel → 8.04 keV. Pb sheet → Pb Lα → 10.56 keV
(guide and LD value; xraylib Pb Lα₁ = 10.551 keV). Then switch the x axis from channel to energy.

**Samples measured.** Zn, leaded brass, and another metal object (a one-cent coin).

**Analysis asked.** Mark Cu Kα, Zn Kα and Pb Lα and their amplitudes; identify the lines of the brass spectrum;
composition from Gaussian fits or deconvolution, compared with literature; the same for the coin.

## Accessories, detector and samples (web research, 2026-10-14)

| Item | Facts | Source |
|---|---|---|
| Absorption accessory 554 834 | Al steps 0.5 … 3.0 mm; material absorbers polystyrene, Al, Fe, Cu, Zr, Ag (thickness 0.5 mm) | leybold-shop.com, product 554834 |
| Set of absorber foils 554 832 | Al 0.5, Fe 0.5, Cu 0.07, **Zr 0.05, Mo 0.1, Ag 0.05, In 0.3 mm**; foils 10 mm dia. in a 24 mm frame, fit the collimator or the counter holder | leybold-shop.com, product 554832 |
| X-ray energy detector 559 938 | Si-PIN photodiode, Peltier-cooled; active area 0.8 mm dia.; Si ≈ 150 µm; plastic entrance window ≈ 40 µm graphite equivalent; range ≈ 2–60 keV | LD instruction sheet 559 938 §5 |
| 559 938 resolution | FWHM(E) = 2√(2 ln 2) · √(σ_el² + F·ε·E), σ_el ≈ 160 eV, F ≈ 0.15 (Fano), ε = 3.8 eV per e–h pair; 0.40 keV at Fe Kα 6.40 keV | LD instruction sheet 559 938 §5–6 |
| 559 938 other | non-linearity < 1 % (3–35 keV, incl. MCA box); drift < 3 % after 4 h; rise ≈ 0.5 µs, fall ≈ 5 µs; **dead time ≈ 250 µs per pulse**; output BNC → MCA box 524 058 | LD instruction sheet 559 938 §5 |
| 559 938 housing lines | Fe, Co, Ni, Cu, Zn, Au or Ag lines can appear (Au L most often) | LD instruction sheet 559 938 §9 |
| Target-alloy set 554 848 | CuZn39Pb3 = 58 Cu / 39 Zn / 3 Pb (leaded brass); CuZn36 = 64 Cu / 36 Zn; X5CrNi18-10 = 72 Fe / 18 Cr / 10 Ni (wt %) | LD CASSY Lab help, experiments P7.5.1.1 / P7.5.1.2 |
| US cent, 1982 on (considered, not used) | zinc core (Zinc Alloy 190, 0.7–0.9 % Cu) plated with ≈ 8 µm pure Cu (≈ 7.5 µm centre, about twice at the rim); overall ≈ 97.5 Zn / 2.5 Cu; 2.5 g, 19.05 mm dia., 1.52 mm | Wikipedia "Penny (United States coin)"; CONECA (citing Concurrent Technologies Corp.); Stack's Bowers |
| Ecuador 1 centavo (**the 2003 issue is the project's coin**, user 2026-10-14) | 2000 issue: brass-plated steel (sources disagree, some say solid brass), 2.5 g, 19 mm; 2003 issue (KM# 104a): Cu-plated steel, magnetic, 2.35 g, 19 mm, 1.45 mm, struck in Mexico. Plating not published: estimate ≈ 18 µm Cu (range 10–25), from the RCM copper-plated steel cent of the same size and mass (4.5 % Cu by mass) | Wikipedia "Ecuadorian centavo coins"; Numista 3003 |

## Crystals in use at the lab (user, 2026-10-14)

NaCl, LiF, Si, calcite, mica. Catalog values: NaCl (100) d = 282 pm (LD 554 78, θ(Mo Kα) = 7.24°); LiF (100)
d = 201 pm (LD); NaCl cut along (110) d = 199.4 pm (LD 554 792, θ = 10.3°). **(verify)** before use: Si (111)
d ≈ 313.6 pm; calcite (104) d ≈ 303.5 pm; muscovite 2M1 (002) d ≈ 995 pm (a ≈ 5.20, b ≈ 9.03, c ≈ 20.1 Å,
β ≈ 95.8°; Wikipedia, webmineral, mindat).

## Published results and background (no EPN data exists; user, 2026-10-14)

| Quantity | Value | Source |
|---|---|---|
| GM end-window counter 559 01 background | ≤ 7 pulses/min (≈ 0.12 /s) with 50 mm Pb + 3 mm Al shielding | LD instruction sheet 559 01 |
| GM 559 01 dead time | ≤ 90 µs | LD instruction sheet 559 01 |
| Moseley, LD example | R = 1.056 × 10⁷ m⁻¹, σ_K = 2.7 from the Zr, Mo, Ag, In edges (lit. 1.0974 × 10⁷ m⁻¹, 3.6) | LD CASSY Lab help, Moseley's law and the Rydberg constant |
| Brass XRF, LD example | CuZn39Pb3 found 61.6 Cu / 35.6 Zn / 2.9 Pb (nominal 58/39/3); fit window 7.5–9.1 keV, three equal-width Gaussians (Cu Kα 8.04, Zn Kα 8.64, Cu Kβ 8.91 keV); densities Cu 8.96, Zn 7.10, Pb 11.34 g/cm³ | LD CASSY Lab help P7.5.1.2 |
