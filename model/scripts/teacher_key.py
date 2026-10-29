"""Write the teacher answer key for the guided tasks and the LD P6.3.3.1 evaluation.

    python model/scripts/teacher_key.py

Writes docs/teacher-key.md from the reference model: a simulated leaflet scan evaluated like
Tables 3–5 (braggsim.analysis), the Mo K line threshold from a voltage sweep, and the expected
answers of the web app's guided tasks. The simulated counts use a fixed seed, so the output is
the same on every run. Generated file: do not edit it by hand.
"""

from pathlib import Path

import numpy as np
import xraylib

import braggsim
from braggsim.analysis import (
    MAX_EDGE_STEP_DEG,
    MAX_STEP_DEG,
    MIN_PROMINENCE_SIGMA,
    THRESHOLD_HALF_WINDOW_DEG,
    attenuation_fit,
    edge_wavelength_table,
    line_threshold_kv,
    moseley_fit,
    order_means_pm,
    peak_center,
    scaled_transmission,
    wavelength_table,
)
from braggsim.constants import HC_KEV_PM, K_EDGE_KEV, MO_K_EDGE_KEV, MO_KA_PM, MO_KB_PM, R_INF_PER_M
from braggsim.crystal import theta_from_lambda
from braggsim.detector import sample_counts
from braggsim.filters import FOILS_MM, WHEELS_MM, areal_density_mg_cm2
from braggsim.scan import DEFAULT, coupled_betas, direct_rate, expected_rate
from braggsim.source import LINE_EXPONENT_M, lambda_min_pm

OUT = Path(__file__).resolve().parents[2] / "docs" / "teacher-key.md"
SEED = 2026
DT_S = 10.0  # s, leaflet measuring time per step
SWEEP_U_KV = np.arange(22.0, 35.1, 1.0)
SWEEP_I_MA = 0.1  # mA; dead-time loss ≈ 2.6 % at the 35 kV peak tip (≈ 21 % at 1 mA)
LINE_NAMES = {"Ka": "Kα", "Kb": "Kβ"}
# EPN Práctica 5 (Moseley): NaCl, COUPLED 3.7° → 7.5°, Δβ = 0.1°, 35 kV, 1 mA, Δt = 5 s.
P5_BETA_RANGE_DEG = (3.7, 7.5)
P5_STEP_DEG = 0.1
P5_DT_S = 5.0
P5_Z = {"Zr": 40, "Mo": 42, "Ag": 47, "In": 49}
# EPN Práctica 1 (attenuation): GM counter in the direct beam, Al wheel and 0.5 mm material plates.
P1_AL_GATE_S = 90.0  # 3 × 30 s
P1_ZR_GATE_S = 200.0
P1_BG_GATE_S = 100.0
P1_MATERIAL_GATE_S = 90.0
P1_PLATE_I_MA = {"Polystyrene": 0.02, "Al": 0.02, "Fe": 1.0, "Cu": 1.0, "Zr": 1.0, "Ag": 1.0}
P1_PLATE_Z = {"Polystyrene": 6, "Al": 13, "Fe": 26, "Cu": 29, "Zr": 40, "Ag": 47}
LD_EXAMPLE_R_PER_M = 1.056e7  # LD's published Moseley example
LD_EXAMPLE_SIGMA_K = 2.7


def _theta(lam_pm, n=1):
    return float(theta_from_lambda(lam_pm, n))


def _leaflet_section(rng):
    beta = coupled_betas(2.0, 25.0, 0.1)
    rate = sample_counts(expected_rate(beta, 35.0, 1.0), DT_S, rng) / DT_S
    rows = wavelength_table(beta, rate, DT_S)
    means = order_means_pm(rows)
    out = [
        "## Tables 3–5: λ from three orders (task `lambda-three-orders`)",
        "",
        "One simulated scan at the leaflet settings (35 kV, 1.00 mA, Δt = 10 s, Δβ = 0.1°, "
        "COUPLED 2° → 25°), evaluated as in the leaflet: whole-peak centroid, λ = 2d sin θ / n, "
        "mean over orders. Errors are counting statistics only (1σ). A student's own scan scatters "
        "by about these errors.",
        "",
        "| n | Line | θ (°) | λ (pm) |",
        "|---|---|---|---|",
    ]
    for r in rows:
        out.append(
            f"| {r['n']} | {LINE_NAMES[r['line']]} "
            f"| {r['theta_deg']:.3f} ± {r['theta_err_deg']:.3f} "
            f"| {r['lambda_pm']:.2f} ± {r['lambda_err_pm']:.2f} |"
        )
    out += ["", "| Line | Mean λ (pm) | Literature (pm) |", "|---|---|---|"]
    for line, lit in (("Ka", MO_KA_PM), ("Kb", MO_KB_PM)):
        lam, err = means[line]
        out.append(f"| {LINE_NAMES[line]} | {lam:.2f} ± {err:.2f} | {lit:.2f} |")
    out += [
        "",
        "Prediction question: *the same λ in all three orders*. The order changes the angle, not "
        "the wavelength; the spread of λ over the orders above is counting noise.",
        "",
        "The task is met by a finished, exported COUPLED scan at steady U and I that holds every "
        f"line of orders 1–3 with its marked window, uses Δβ ≤ {MAX_STEP_DEG}°, and whose weakest "
        f"line (3rd-order Kβ) is expected to stand {MIN_PROMINENCE_SIGMA}σ above its background. "
        "At 35 kV and 1 mA, Δt = 1 s falls just short; the leaflet's 10 s is comfortable.",
        "",
    ]
    return out


def _moseley_section(rng):
    beta = coupled_betas(*P5_BETA_RANGE_DEG, P5_STEP_DEG)

    def scan(filters=(), noisy=True):
        rate = expected_rate(beta, 35.0, 1.0, filters=filters)
        return sample_counts(rate, P5_DT_S, rng) / P5_DT_S if noisy else rate

    def fit(noisy):
        r_open = scan(noisy=noisy)
        foils = {el: scan(((el, areal_density_mg_cm2(el, FOILS_MM[el])),), noisy) for el in P5_Z}
        rows = edge_wavelength_table(beta, r_open, foils, P5_DT_S)
        lam = [r["lambda_pm"] for r in rows]
        return rows, moseley_fit(z, lam, [r["lambda_err_pm"] for r in rows])

    z = list(P5_Z.values())
    rows, (R, R_err, sigma, sigma_err, chi2) = fit(noisy=True)
    # The same evaluation on the noise-free scans isolates the resolution bias from the noise.
    _, (R_exact, _, sigma_exact, _, chi2_exact) = fit(noisy=False)
    lam_tab = [HC_KEV_PM / K_EDGE_KEV[el] for el in P5_Z]
    R_tab, _, sigma_tab, _, _ = moseley_fit(z, lam_tab)
    th = {el: _theta(lam) for el, lam in zip(P5_Z, lam_tab, strict=True)}
    bias_R = f"{100 * (R_exact / R_tab - 1):+.1f}".replace("-", "−")
    bias_sigma = f"{sigma_exact - sigma_tab:+.2f}".replace("-", "−")
    out = [
        "## Moseley's law (task `moseley-k-edges`)",
        "",
        f"One open scan and one scan per foil (Zr, Mo, Ag, In) at the EPN Práctica 5 settings: "
        f"COUPLED {beta[0]:.1f}° → {beta[-1]:.1f}°, Δβ = {P5_STEP_DEG:.1f}°, 35 kV, 1.00 mA, "
        f"Δt = {P5_DT_S:.0f} s, the foil at the sensor. Simulated counts, errors are counting "
        "statistics (1σ). The K edge is the steepest rise of T = R(foil)/R(open) in β "
        "(`braggsim.analysis.k_edge_deg`); θ → λ_K by Bragg's law, first order.",
        "",
        "| Foil | Z | θ edge (°) | λ_K (pm) | Tabulated λ_K (pm) | Tabulated θ (°) |",
        "|---|---|---|---|---|---|",
    ]
    for r, zz, lam, el in zip(rows, z, lam_tab, P5_Z, strict=True):
        out.append(
            f"| {el} | {zz} | {r['theta_deg']:.3f} ± {r['theta_err_deg']:.3f} "
            f"| {r['lambda_pm']:.2f} ± {r['lambda_err_pm']:.2f} | {lam:.2f} | {th[el]:.3f} |"
        )
    out += [
        "",
        "Fit of √(1/λ_K) = √R (Z − σ_K):",
        "",
        "| Source | R (10⁷ m⁻¹) | σ_K | χ²/dof |",
        "|---|---|---|---|",
        f"| This simulated measurement | {R / 1e7:.3f} ± {R_err / 1e7:.3f} "
        f"| {sigma:.2f} ± {sigma_err:.2f} | {chi2:.1f} |",
        f"| The same evaluation, noise-free | {R_exact / 1e7:.3f} | {sigma_exact:.2f} "
        f"| {chi2_exact:.1f} |",
        f"| Tabulated (xraylib) edges | {R_tab / 1e7:.3f} | {sigma_tab:.2f} | |",
        f"| LD's published example | {LD_EXAMPLE_R_PER_M / 1e7:.3f} | {LD_EXAMPLE_SIGMA_K:.1f} | |",
        f"| Rydberg constant R∞ (CODATA 2022) | {R_INF_PER_M / 1e7:.3f} | | |",
        "",
        "Prediction question: *where does the Ag edge fall compared with Zr?* At a smaller "
        f"angle ({th['Ag']:.2f}° against {th['Zr']:.2f}°): Ag has the higher Z, so the higher "
        "K binding energy and the shorter λ_K, and a shorter wavelength reflects at a smaller "
        "angle.",
        "",
        f"The noise-free evaluation lands {100 * (1 - R_exact / R_INF_PER_M):.1f} % below R∞ "
        f"(this simulated measurement {100 * (1 - R / R_INF_PER_M):.1f} %; the difference is "
        "counting noise). Two causes add up, and the rows above separate them.",
        "",
        f"- **Physics, {100 * (1 - R_tab / R_INF_PER_M):.1f} % (tabulated row).** The straight "
        "line absorbs two Z-dependent effects of opposite sign. Relativistic binding alone would "
        "raise R (a Dirac 1s fit with constant σ gives ≈ 1.07 R∞), and outer-electron screening "
        "that grows with Z outweighs it.",
        f"- **Instrument, {100 * (1 - R_exact / R_tab):.1f} % (noise-free row against tabulated "
        "row).** Zr and Mo land 0.047° and 0.061° below their tabulated angles, Ag and In "
        "within 0.006°. The cause is the tube's own Mo lines: Kβ₂ (62.10 pm) lies 0.11 pm and "
        "Kβ₁ (63.25 pm) 1.3 pm longer than Mo's K edge (61.99 pm), and Kα (70.9 pm) lies 2 pm "
        "beyond Zr's (68.89 pm). The counter blurs the open and the foil spectra before they are "
        "divided, and "
        "near a strong line the ratio T = R(foil)/R(open) then steps earlier than T(λ) itself. "
        "A continuum-only control (no Mo lines) puts every edge within 0.015° of the tabulated "
        "angle, R +0.7 % and χ²/dof 0.4, so the analysis is unbiased on a smooth spectrum. With "
        f"the lines the shift is uneven and tilts the line: R {bias_R} % and σ_K {bias_sigma} "
        "against the tabulated edges (`model/PARAMETERS.md`). A real goniometer does the same. "
        "The Explore edge markers sit at the tabulated angles, so the measured steps fall just "
        "below them.",
        "",
        "The quoted ± is the counting error only: a measurement scatters by it around the "
        f"noise-free row, not around the tabulated one. χ²/dof = {chi2:.1f} (noise-free "
        f"{chi2_exact:.1f}) with 2 degrees of freedom: "
        "the Zr and Mo edges sit further below the tabulated ones than their counting errors "
        "allow (the instrument bias above), so a ± that covers noise only "
        "is too small for the fit as a whole.",
        "",
        f"The task is met by the scans, not by the student's R: a COUPLED window that covers "
        f"{P5_BETA_RANGE_DEG[0]}° → {P5_BETA_RANGE_DEG[1]}° with Δβ ≤ {MAX_EDGE_STEP_DEG}°, "
        "and all four foils plus an open scan, all five at the same U and I and exported. On the "
        "expected rates, each edge must pass the coarse test of `k_edge_deg`: the rise of the "
        f"mean T across the edge stands ≥ {MIN_PROMINENCE_SIGMA}σ. A student's R "
        "scatters by about the error above and sits below R∞.",
        "",
    ]
    return out


def _sweep(I_mA, rng=None):
    """1st-order Kα window and peak areas over SWEEP_U_KV, noise-free or sampled with ``rng``."""
    theta = _theta(MO_KA_PM)
    w = THRESHOLD_HALF_WINDOW_DEG
    beta = coupled_betas(round(theta - w, 1), round(theta + w, 1), 0.1)
    peaks = []
    for U in SWEEP_U_KV:
        rate = expected_rate(beta, U, I_mA)
        if rng is not None:
            rate = sample_counts(rate, DT_S, rng) / DT_S
        peaks.append(peak_center(beta, rate, DT_S, beta[0], beta[-1]))
    return beta, [p.area for p in peaks], [p.area_err for p in peaks]


def _threshold_section(rng):
    beta, area, err = _sweep(SWEEP_I_MA, rng)
    U_K, U_K_err, m, m_err = line_threshold_kv(SWEEP_U_KV, area, err)
    # Dead-time bias: noise-free fits at the sweep current and at 1 mA.
    U_low, _, _, _ = line_threshold_kv(SWEEP_U_KV, *_sweep(SWEEP_I_MA)[1:])
    U_high, _, m_high, _ = line_threshold_kv(SWEEP_U_KV, *_sweep(1.0)[1:])
    out = [
        "## Line threshold (task `line-threshold`)",
        "",
        f"Expected answer: the Mo K lines exist only above U_K = {MO_K_EDGE_KEV:.1f} kV, where eU "
        f"equals the Mo K binding energy ({MO_K_EDGE_KEV:.1f} keV). Kβ vanishes there too, not at "
        f"its own photon energy ({HC_KEV_PM / MO_KB_PM:.2f} keV). The common wrong answer is "
        f"{HC_KEV_PM / MO_KA_PM:.2f} kV, "
        "where λ_min = λ(Kα). Between the two, the continuum still reaches the Kα angle (e.g. "
        f"λ_min = {float(lambda_min_pm(19.0)):.1f} pm at 19.0 kV) but no Kα line is emitted.",
        "",
        'How to measure it: do not take "the first U where a peak is visible". The line area '
        f"grows as (U/U_K − 1)^m (model exponent m = {LINE_EXPONENT_M}), so a peak only stands "
        "out well above U_K. Measure the 1st-order Kα peak area at several U and extrapolate to "
        "zero. Keep the emission current low: at 1 mA the counter's dead time flattens the top "
        f"of the sweep, pushes the extrapolated U_K up by {U_high - U_low:.1f} kV and the "
        f"exponent m down to {m_high:.2f} (noise-free fits).",
        "",
        f"Simulated sweep: COUPLED {beta[0]:.1f}° → {beta[-1]:.1f}°, I = {SWEEP_I_MA:.2f} mA, "
        f"Δt = {DT_S:.0f} s; area above a straight baseline through the window ends.",
        "",
        "| U (kV) | Kα area (1/s · °) |",
        "|---|---|",
    ]
    out += [
        f"| {U:.1f} | {a:.2f} ± {e:.2f} |" for U, a, e in zip(SWEEP_U_KV, area, err, strict=True)
    ]
    out += [
        "",
        f"Fit area = A (U/U_K − 1)^m: **U_K = {U_K:.2f} ± {U_K_err:.2f} kV**, "
        f"m = {m:.2f} ± {m_err:.2f}. U_K and m are strongly correlated; fixing m at "
        f"{LINE_EXPONENT_M} would understate the error on U_K.",
        "",
        "Caveat: the simulation's lines grow exactly as this power law, so the fit checks the "
        "method, not the physics right above U_K. A real tube's yield near threshold need not "
        "follow a pure power law, so a real sweep can land a little off 20.0 kV.",
        "",
    ]
    return out


def _attenuation_section(rng):
    zr = (("Zr", areal_density_mg_cm2("Zr", 0.05)),)
    d_mm = np.array([mm for _, mm in WHEELS_MM["al"][1:]])
    rho_al = areal_density_mg_cm2("Al", 1.0) / 100  # g/cm³
    tau = DEFAULT.tau_s

    def read(U_kV, I_mA, filters, dt_s):
        return sample_counts(direct_rate(U_kV, I_mA, filters), dt_s, rng) / dt_s

    bg = read(0.0, 0.0, (), P1_BG_GATE_S)
    runs = {
        "1a, 21 kV, 0.05 mA, no Zr": (21.0, 0.05, P1_AL_GATE_S, ()),
        "1b, 21 kV, 0.15 mA, Zr": (21.0, 0.15, P1_ZR_GATE_S, zr),
        "35 kV, 0.01 mA, Zr (not in the guide)": (35.0, 0.01, P1_ZR_GATE_S, zr),
    }
    fits = {}
    for name, (U, I_mA, dt, f) in runs.items():
        r0 = read(U, I_mA, f, dt)
        r = [read(U, I_mA, (*f, ("Al", areal_density_mg_cm2("Al", mm))), dt) for mm in d_mm]
        fits[name] = (r0, attenuation_fit(d_mm, r, r0, dt, dt, bg, P1_BG_GATE_S))
    mu_ka = xraylib.CS_Total_CP("Al", HC_KEV_PM / MO_KA_PM)
    out = [
        "## Attenuation (EPN Práctica 1)",
        "",
        "Al wheel (0.5 → 3.0 mm in 0.5 mm steps) in the direct beam, GM counter at the sensor, "
        f"background {bg:.2f}/s from a {P1_BG_GATE_S:.0f} s run at 0 kV. T = (R − b)/(R₀ − b); "
        "μ from ln T = −μ d through the origin, weighted by the counting errors of the points, "
        "with the common error of R₀ and b propagated (`braggsim.analysis.attenuation_fit`). "
        "Simulated counts, errors 1σ. μ/ρ = 10 μ/ρ_Al, ρ_Al = "
        f"{rho_al:.3f} g/cm³.",
        "",
        "| Run | R₀ (1/s) | μ (1/mm) | μ/ρ (cm²/g) | χ²/dof |",
        "|---|---|---|---|---|",
    ]
    for name, (r0, f) in fits.items():
        out.append(
            f"| {name} | {r0:.0f} | {f.mu_per_mm:.3f} ± {f.mu_err_per_mm:.3f} "
            f"| {10 * f.mu_per_mm / rho_al:.2f} ± {10 * f.mu_err_per_mm / rho_al:.2f} "
            f"| {f.chi2_dof:.0f} |"
        )
    out += [
        "",
        "Per point, μ_eff/ρ = −10 ln T/(ρ d) in cm²/g (beam hardening: it falls with d):",
        "",
        "| d (mm) | " + " | ".join(fits) + " |",
        "|---|" + "---|" * len(fits),
    ]
    for j, mm in enumerate(d_mm):
        cells = " | ".join(f"{10 * f.mu_eff_per_mm[j] / rho_al:.2f}" for _, f in fits.values())
        out.append(f"| {mm:.1f} | {cells} |")
    fa = fits["1a, 21 kV, 0.05 mA, no Zr"][1]
    fz = fits["1b, 21 kV, 0.15 mA, Zr"][1]
    f35 = fits["35 kV, 0.01 mA, Zr (not in the guide)"][1]

    def mu_rho(f, j=None):
        return 10 * (f.mu_per_mm if j is None else f.mu_eff_per_mm[j]) / rho_al

    spread_a = mu_rho(fa, 0) - mu_rho(fa, -1)
    spread_z = mu_rho(fz, 0) - mu_rho(fz, -1)
    out += [
        "",
        f"**Against xraylib.** At Mo Kα alone, μ/ρ of Al is {mu_ka:.2f} cm²/g. No run reaches it, "
        "and that is physics, not a mistake. At 21 kV the Mo K lines are barely excited (≈ 5 % of "
        "the photons): the beam is bremsstrahlung from λ_min = 59 pm upward, centred near 76 pm "
        "(16 keV), softer on average than Mo Kα, so the fit without Zr "
        f"({mu_rho(fa):.2f} cm²/g) lies above {mu_ka:.2f}. Thin Al removes the softest photons "
        f"first, so μ_eff falls from {mu_rho(fa, 0):.2f} at 0.5 mm to {mu_rho(fa, -1):.2f} at "
        "3 mm (beam hardening). χ²/dof ≫ 1 says the points are not on a line; the ± is only the "
        "counting error of a line fitted to a curve. The Zr filter does not turn the beam into "
        "Mo Kα. At 21 kV it removes the hard end (59–69 pm, above the Zr K edge at 18.0 keV) and "
        "leaves a continuum band at about 69–92 pm. The fit with Zr "
        f"({mu_rho(fz):.2f} cm²/g) is therefore higher, not closer to {mu_ka:.2f}, and the line "
        f"is only somewhat less curved (μ_eff spread {spread_z:.2f} instead of {spread_a:.2f} "
        "cm²/g) because the band is narrower. At 35 kV with Zr the lines are strong (≈ 40 % of "
        "the photons), but the continuum above the Zr edge (18–35 keV) leaks through and "
        f"survives the Al best, so μ/ρ drops to {mu_rho(f35):.2f} and keeps falling with d. "
        "The counter's dead time (τ = 100 µs, ≈ 9 % loss at the open ≈ 950/s, less behind the "
        "absorbers) is not corrected here. It lowers the fitted μ/ρ by about 4 % and μ_eff at "
        "0.5 mm by 6–7 %, and it hides part of the curvature (noise-free true rates give "
        "6.91 → 5.38, `PARAMETERS.md`). The fitted μ depends on the thickness range, U, filter "
        "and dead time; a student who quotes it should state them.",
        "",
        "The 35 kV row is not in the guide. On a real tube the emission at 0.01 mA may drift, so "
        "read R₀ before and after.",
        "",
    ]
    d_plate = 0.5
    open_obs = read(30.0, 0.02, (), P1_MATERIAL_GATE_S)
    out += [
        "**Material plates (run 2a).** 0.5 mm plates at 30 kV, "
        f"{P1_MATERIAL_GATE_S:.0f} s each, 0.02 mA for the first three and 1 mA for the rest. "
        "The open beam is read at 0.02 mA. Each rate is corrected for dead time, the background "
        "is subtracted, and the open beam is scaled by the current "
        "(`braggsim.analysis.scaled_transmission`). μ/ρ = −ln T/ρx. The error includes the "
        "counts of the plate and of the open beam, the dead-time Jacobian and the background "
        "error. A real dead-time-limited GM is sub-Poissonian (variance ≈ N (1 − Rτ)²), which "
        "roughly cancels that Jacobian, while the simulation draws plain Poisson counts.",
        "",
        "| Plate | Z | I (mA) | T | μ/ρ (cm²/g) | xraylib, Mo Kα (cm²/g) |",
        "|---|---|---|---|---|---|",
    ]
    for m, z in P1_PLATE_Z.items():
        ad = areal_density_mg_cm2(m, d_plate)
        i = P1_PLATE_I_MA[m]
        obs = read(30.0, i, ((m, ad),), P1_MATERIAL_GATE_S)
        T, T_err = scaled_transmission(
            obs, open_obs, i, 0.02, P1_MATERIAL_GATE_S, P1_MATERIAL_GATE_S, bg, P1_BG_GATE_S, tau
        )
        mu_rho = -np.log(T) / (ad / 1000)
        mu_err = T_err / T / (ad / 1000)
        ref = xraylib.CS_Total_CP(m, HC_KEV_PM / MO_KA_PM)
        out.append(f"| {m} | {z} | {i:g} | {T:.2g} | {mu_rho:.2f} ± {mu_err:.2f} | {ref:.2f} |")
    out += [
        "",
        "Each plate gives one effective value, −ln T/ρx, for the beam it actually sees. Fe and "
        "Cu pass only 0.01–0.13 %, and what survives is the hard end of the 30 kV continuum "
        "(≈ 23–29 keV), where their μ/ρ is far below the Mo Kα value. Ag filters the beam "
        "itself: its K edge is at 25.5 keV, so the survivors sit just below it (≈ 22–25 keV), "
        "again far below its Mo Kα value. Zr is the anomaly. In the monochromatic column μ/ρ "
        "drops from Cu's 49 to Zr's 16 cm²/g, because Mo Kα (17.5 keV) lies below the Zr K edge "
        "(18.0 keV): up to Z = 39 the K shell absorbs Mo Kα, from Z = 40 on it cannot. In the "
        "measurement the Zr plate transmits more than Fe or Cu because Mo Kα falls in Zr's "
        "low-absorption window just below its edge (≈ 70 % of what passes is Mo Kα). It is the "
        "only heavy plate above its Mo Kα value because Mo Kα sits near the minimum of Zr's μ/ρ "
        "over this beam, so every other photon (softer, below the edge, or harder, above it) is "
        'absorbed more. A student\'s μ/ρ-vs-Z plot should show the drop at Zr and not "fix" '
        "it. The light plates and the open beam are read at 1500–2450/s, where the counter "
        "loses 15–25 %. Without the dead-time correction Al would give 3.5 instead of 4.4 "
        "cm²/g, and τ = 90 µs instead of 100 µs moves it by 2.5 %. The polystyrene point has "
        "the largest error because its ρx (0.053 g/cm²) is the smallest: the counting error of "
        "ln T is divided by it.",
        "",
    ]
    return out


def main():
    # One independent stream per section: rng.poisson's draw count depends on the rates, so a model
    # change in one section must not move the simulated counts of the next.
    rngs = [np.random.default_rng(ss) for ss in np.random.SeedSequence(SEED).spawn(4)]
    ka3 = _theta(MO_KA_PM, 3)
    lines = [
        "# Teacher answer key",
        "",
        "<!-- Generated by model/scripts/teacher_key.py; do not edit by hand. -->",
        "",
        f"Reference model braggsim {braggsim.__version__}, simulated counts (seed {SEED}). "
        "Experiment: LD Physics Leaflet P6.3.3.1, X-ray apparatus 554 800; "
        "d = 282.01 pm (NaCl).",
        "",
        "## Third-order Kα (task `kalpha-third-order`)",
        "",
        f"θ = arcsin(3 λ(Kα) / 2d) = **{ka3:.2f}°** (leaflet Table 2: 22.21°). The task is met "
        f"on the nearest 0.1° step, {round(ka3, 1):.1f}°. The common wrong answer is "
        f"3 × {_theta(MO_KA_PM):.2f}° = {3 * _theta(MO_KA_PM):.2f}°, "
        f"{(ka3 - 3 * _theta(MO_KA_PM)) / DEFAULT.sigma_deg:.0f}σ short of the line "
        f"(σ = {DEFAULT.sigma_deg:.2f}°): there only continuum arrives. Third order, not second: "
        f"in second order the wrong answer ({2 * _theta(MO_KA_PM):.2f}°) is within σ of the line "
        f"({_theta(MO_KA_PM, 2):.2f}°) and would still see the peak.",
        "",
    ]
    lines += _threshold_section(rngs[0])
    lines += _leaflet_section(rngs[1])
    lines += _moseley_section(rngs[2])
    lines += _attenuation_section(rngs[3])
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
