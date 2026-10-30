"""Export the data the web app loads and the golden cases its physics port must reproduce.

    python model/scripts/export_artifacts.py

artifacts/tables/    runtime data for the browser: μ/ρ on the fixed λ grid, the fitted parameters.
artifacts/fixtures/  one golden case per file: ``inputs`` → ``expected`` from the Python reference
                     model; Vitest compares R̄(β) at 1e-9 relative (web-physics-port rule).

The output is deterministic (sorted keys, shortest round-trip floats), so running the script twice
gives byte-identical files; tests/test_artifacts.py fails when the committed files are stale.
Files the script no longer produces are deleted.
"""

import dataclasses
import functools
import json
from pathlib import Path

import numpy as np
import xraylib

import braggsim
from braggsim import analysis, detector, fluorescence, forge, scan
from braggsim.constants import (
    HC_KEV_PM,
    MO_K_EDGE_KEV,
    MO_KA_COMPONENTS,
    MO_KA_PM,
    MO_KB_COMPONENTS,
    MO_KB_PM,
)
from braggsim.crystal import (
    FCC,
    NACL,
    PRESETS,
    Crystal,
    ForgeInputError,
    allowed_orders,
    build_basis,
    cell_scale,
    d_pm,
    density_g_cm3,
    extinction_table,
    mu_edges_pm,
    mu_per_cm_table,
    structure_factor_sq_rel,
    structure_factor_sq_rel_crystal,
    theta_from_lambda,
)
from braggsim.filters import (
    ABSORBERS,
    FOILS_MM,
    MU_RHO_GRID_PM,
    WHEELS_MM,
    areal_density_mg_cm2,
    edge_intervals,
    mu_rho_edges_pm,
    mu_rho_table,
    transmission,
)
from braggsim.source import lambda_min_pm

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"
LEAFLET_BETAS = scan.coupled_betas(2.0, 25.0, 0.1)  # LD P6.3.3.1 measurement settings


def _floats(a):
    return [float(x) for x in np.asarray(a, dtype=float).ravel()]


def _dump(obj, compact=False):
    obj = {"model_version": braggsim.__version__, **obj}
    kw = {"separators": (",", ":")} if compact else {"indent": 1}  # compact: forge_elements.json
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, allow_nan=False, **kw) + "\n"


def _rate_case(
    description,
    beta_deg,
    U_kV,
    I_mA,
    params=scan.DEFAULT,
    sensor_deg=None,
    filters=(),
    crystal=NACL,
    s1_cm=scan.REF_S1_CM,
    s2_cm=scan.REF_S2_CM,
):
    beta = np.asarray(beta_deg, dtype=float)
    inputs = {"beta_deg": _floats(beta), "U_kV": U_kV, "I_mA": I_mA,
              "params": dataclasses.asdict(params)}  # fmt: skip
    if sensor_deg is not None:
        sensor_deg = np.asarray(sensor_deg, dtype=float)
        inputs["sensor_deg"] = _floats(sensor_deg)
    if filters:
        inputs["filters"] = [[m, d] for m, d in filters]
    if (s1_cm, s2_cm) != (scan.REF_S1_CM, scan.REF_S2_CM):  # older fixtures stay as they were
        inputs["s1_cm"], inputs["s2_cm"] = s1_cm, s2_cm
    return {
        "function": "scan.expected_rate",
        "description": description,
        "inputs": inputs,
        "expected": {
            "rate_per_s": _floats(
                scan.expected_rate(
                    beta, U_kV, I_mA, params, sensor_deg, filters, crystal, s1_cm, s2_cm
                )
            )
        },
    }


def _direct_case(description, U_kV, I_mA, filters=(), sensor_deg=0.0, geometry_cm=None):
    inputs = {"U_kV": U_kV, "I_mA": I_mA, "filters": [[m, d] for m, d in filters],
              "sensor_deg": sensor_deg, "params": dataclasses.asdict(scan.DEFAULT)}  # fmt: skip
    geo = {}
    if geometry_cm is not None:  # older fixtures stay as they were
        geo = {"s1_cm": geometry_cm[0], "s2_cm": geometry_cm[1]}
        inputs.update(geo)
    return {
        "description": description,
        "inputs": inputs,
        "expected": {
            "rate_per_s": scan.direct_rate(U_kV, I_mA, filters, sensor_deg=sensor_deg, **geo)
        },
    }


def _transmission_case():
    # Grid nodes and midpoints, the grid ends, beyond them (end values held) and the brackets
    # of the Ar K (386.7 pm) and K K (343.7 pm) edges. 10 mg/cm²: nothing underflows.
    g = MU_RHO_GRID_PM
    base = np.r_[20.0, g[0], g[:-1:97], np.sqrt(g[:-1:97] * g[1::97]), 343.7, 386.7, g[-1], 700.0]
    lines = [lam for lam, _ in (*MO_KA_COMPONENTS, *MO_KB_COMPONENTS)]

    def lam_of(m):
        # per material: both sides of each edge (1e-5 relative), the two nodes on each side of the
        # edge interval, and the Mo line wavelengths, so the low and high branches are exercised
        extra = []
        for i, e in edge_intervals(mu_rho_edges_pm(m)):
            extra += [e * (1 - 1e-5), e * (1 + 1e-5), g[i], g[i + 1], g[i - 1], g[i + 2]]
        return np.r_[base, extra, lines]

    return {
        "function": "filters.transmission",
        "description": "T(λ) through 10 mg/cm²: log–log interpolation of the μ/ρ table",
        "cases": [
            {"inputs": {"lambda_pm": _floats(lam_of(m)), "material": m,
                        "areal_density_mg_cm2": 10.0},
             "expected": {"transmission": _floats(transmission(lam_of(m), m, 10.0))}}
            for m in (scan.AIR, scan.ABSORBER)
        ]
        + [  # absorbers: 1 mg/cm² of metal, 10 of polystyrene (min T stays far above underflow)
            {"inputs": {"lambda_pm": _floats(lam_of(m)), "material": m, "areal_density_mg_cm2": d},
             "expected": {"transmission": _floats(transmission(lam_of(m), m, d))}}
            for m in ABSORBERS
            for d in (10.0 if m == "Polystyrene" else 1.0,)
        ],
    }  # fmt: skip


def _rejected_case():
    # Inputs just outside each limit: the port must refuse exactly what Python refuses, so a limit
    # constant drifting between the two copies fails a test. (NaN cannot be written to JSON.)
    tube = {"U_kV": 35.0, "I_mA": 1.0}
    rate, betas = "expected_rate", "coupled_betas"
    cases = [
        (rate, "β above the coupled range", {"beta_deg": [85 + 1e-9], **tube}),
        (rate, "β below the coupled range", {"beta_deg": [-5 - 1e-9], **tube}),
        (rate, "U above 35 kV", {"beta_deg": [7.2], "U_kV": 35 + 1e-9, "I_mA": 1.0}),
        (rate, "U negative", {"beta_deg": [7.2], "U_kV": -1e-9, "I_mA": 1.0}),
        (rate, "I above 1 mA", {"beta_deg": [7.2], "U_kV": 35.0, "I_mA": 1 + 1e-9}),
        (rate, "sensor above +170°", {"beta_deg": [7.2], **tube, "sensor_deg": [170 + 1e-9]}),
        (rate, "sensor below −10°", {"beta_deg": [7.2], **tube, "sensor_deg": [-10 - 1e-9]}),
        (rate, "lengths differ", {"beta_deg": [7.2, 7.3], **tube, "sensor_deg": [14]}),
        (
            rate,
            "negative filter areal density",
            {"beta_deg": [7.2], **tube, "filters": [("Zr", -1.0)]},
        ),
        (
            rate,
            "filter material without a table",
            {"beta_deg": [7.2], **tube, "filters": [("Ni", 1.0)]},
        ),
        ("direct_rate", "U above 35 kV (direct beam)", {"U_kV": 35 + 1e-9, "I_mA": 1.0}),
        (rate, "s2 = 0", {"beta_deg": [7.2], **tube, "s2_cm": 0.0}),
        (rate, "s1 negative", {"beta_deg": [7.2], **tube, "s1_cm": -1.0}),
        ("direct_rate", "s1 = 0 (direct beam)", {"U_kV": 21.0, "I_mA": 0.05, "s1_cm": 0.0}),
        (betas, "upper limit below lower", {"lo_deg": 25.0, "hi_deg": 2.0, "step_deg": 0.1}),
        (betas, "Δβ = 0", {"lo_deg": 2.0, "hi_deg": 25.0, "step_deg": 0.0}),
        (betas, "too many steps", {"lo_deg": -5.0, "hi_deg": 85.0, "step_deg": 1e-4}),
    ]
    out = []
    for fn, description, inputs in cases:
        try:
            getattr(scan, fn)(**inputs)
        except ValueError as e:
            out.append({"function": f"scan.{fn}", "description": description, "inputs": inputs,
                        "expected": {"error": type(e).__name__}})  # fmt: skip
        else:
            raise AssertionError(f"scan.{fn} accepted {inputs}")
    return {"function": "rejected", "description": "Inputs the model refuses", "cases": out}


def _xrf_kernels_table():
    """Per-sample XRF kernels for the web port (``fluorescence.kernels``) plus the xraylib-derived
    detector efficiencies it cannot compute: ``pin_eff`` per line and at the midpoints of the
    scatter-continuum intervals (``detector.mca_counts``; the energies depend on the grid only)."""
    out = {}
    for name, sample in fluorescence.SAMPLES.items():
        kern = fluorescence.kernels(sample)
        # detected energies hc/(λ + shift), ascending as in scattered_continuum: grid only, any U
        mid = {}
        for kind, shift in (("rayleigh", 0.0), ("compton", fluorescence.COMPTON_SHIFT_PM)):
            e = HC_KEV_PM / (kern.lam_pm + shift)[::-1]
            mid[kind] = 0.5 * (e[1:] + e[:-1])
        out[name] = {
            "lam_pm": _floats(kern.lam_pm),
            "lines": [
                {
                    "label": lk.label,
                    "energy_keV": lk.energy_keV,
                    "k": _floats(lk.k),
                    "pin_eff": float(detector.pin_efficiency(lk.energy_keV)),
                }
                for lk in kern.lines
            ],  # fmt: skip
            "rayleigh": _floats(kern.rayleigh),
            "compton": _floats(kern.compton),
            "pin_eff_mid_rayleigh": _floats(detector.pin_efficiency(mid["rayleigh"])),
            "pin_eff_mid_compton": _floats(detector.pin_efficiency(mid["compton"])),
        }
    mo = {
        ln.label: float(detector.pin_efficiency(ln.energy_keV))
        for ln in fluorescence.line_rates("Cu", 35.0, 1.0)
        if ln.label.startswith("Mo ")
    }
    return out, mo


_XRF_T_S = 180.0
# (sample, U_kV, I_mA, t_s, n_channels, gain). 15 kV: Pb L3 only (L2 15.20, L1 15.86 keV); 15.5 kV:
# L3 + L2; 9.3 kV: Cu K (8.98) excited, Zn K (9.66) not; 8.5 kV: below Cu K, scatter only.
_XRF_RUNS = (
    *((s, 35.0, 1.0, _XRF_T_S, 512, -2.5) for s in ("Cu", "CuZn39Pb3", "centavo2003")),
    *((s, 15.0, 0.6, _XRF_T_S, 512, -2.5) for s in ("Cu", "CuZn39Pb3", "centavo2003")),
    ("CuZn39Pb3", 35.0, 1.0, _XRF_T_S, 256, -5.0),
    ("CuZn39Pb3", 15.5, 1.0, _XRF_T_S, 512, -2.5),
    ("CuZn39Pb3", 9.3, 1.0, _XRF_T_S, 512, -2.5),
    ("Cu", 8.5, 1.0, _XRF_T_S, 512, -2.5),
    ("Cu", 35.0, 0.0, _XRF_T_S, 512, -2.5),
    ("Cu", 0.0, 1.0, _XRF_T_S, 512, -2.5),
    ("Cu", 35.0, 1.0, 0.0, 512, -2.5),
)


# Same, plus (collimator, sensor) foils as (material, mg/cm²) lists (the 554 800 tray's foils).
_XRF_FILTER_RUNS = (
    ("Cu", 35.0, 1.0, _XRF_T_S, 512, -2.5, (), ("Fe",)),
    ("CuZn39Pb3", 35.0, 1.0, _XRF_T_S, 512, -2.5, ("Zr",), ()),
    ("centavo2003", 35.0, 1.0, _XRF_T_S, 512, -2.5, ("Zr",), ("Fe",)),
    ("CuZn39Pb3", 35.0, 1.0, _XRF_T_S, 512, -2.5, (), ("Cu",)),  # Cu K edge between Cu Kβ and Zn Kβ
)


def _xrf_fixtures():
    out = {}
    runs = (*((*r, (), ()) for r in _XRF_RUNS), *_XRF_FILTER_RUNS)
    for sample, U, i_mA, t_s, n_ch, gain, coll, sens in runs:
        inputs = {"sample": sample, "U_kV": U, "I_mA": i_mA, "t_s": t_s,
                  "n_channels": n_ch, "gain": gain}  # fmt: skip
        name = f"{sample}_{U:g}kV_{i_mA:g}mA_{n_ch}ch_{t_s:g}s"
        foils, note = {}, ""
        for key, names in (("collimator", coll), ("sensor", sens)):
            if names:  # the rounded values of tables/mu_rho_absorbers.json, as the web app uses
                foils[f"{key}_filters"] = [
                    [m, round(areal_density_mg_cm2(m, FOILS_MM[m]), 6)] for m in names
                ]
                inputs[f"{key}_filters"] = foils[f"{key}_filters"]
                name += f"_{key[:4]}-{'-'.join(names)}"
                note += f", {key} foil {'+'.join(names)}"
        counts, live, e_ch = fluorescence.mca_spectrum(sample, U, i_mA, t_s, n_ch, gain, **foils)
        lines = fluorescence.line_rates(sample, U, i_mA, **foils)
        out[name] = {
            "function": "fluorescence.xrf",
            "description": f"XRF of {sample} at {U:g} kV, {i_mA:g} mA: line rates and expected MCA "
            f"spectrum ({n_ch} channels, gain {gain:g}, {t_s:g} s)"
            + note,
            "inputs": inputs,
            "expected": {
                "line_rates": [{"label": ln.label, "energy_keV": ln.energy_keV,
                                "rate_per_s": ln.rate_per_s} for ln in lines],
                "mca_counts": _floats(counts),
                "live_time_s": float(live),
                "channel_energy_keV": _floats(e_ch),
            },
        }  # fmt: skip
    return out


def _xrf_rejected_case():
    ok = {"sample": "Cu", "U_kV": 35.0, "I_mA": 1.0, "t_s": 180.0}
    cases = [
        ("U above 35 kV", {**ok, "U_kV": 35 + 1e-9}),
        ("I above 1 mA", {**ok, "I_mA": 1 + 1e-9}),
        ("unknown sample", {**ok, "sample": "unobtainium"}),
        ("channel wider than σ_el", {**ok, "n_channels": 256, "gain": -2.0}),
        ("negative t_s", {**ok, "t_s": -1.0}),
        ("non-integer channel count", {**ok, "n_channels": 512.5}),
        ("gain 0", {**ok, "gain": 0.0}),
    ]
    out = []
    for description, inputs in cases:
        try:
            fluorescence.mca_spectrum(**inputs)
        except ValueError as e:
            out.append({"function": "fluorescence.xrf", "description": description,
                        "inputs": inputs, "expected": {"error": type(e).__name__}})  # fmt: skip
        else:
            raise AssertionError(f"fluorescence.mca_spectrum accepted {inputs}")
    return {"function": "rejected", "description": "XRF inputs the model refuses", "cases": out}


_FIT_SIGMA = 2 * np.sqrt(2 * np.log(2))


def _fit_fixed_fixtures():
    """gauss_fit_fixed on seeded Poisson spectra (input counts stored; fit of counts, not of R̄),
    in fixtures/xrf/fit/ (apart from the MCA cases, which fluorescence.test.ts iterates)."""
    ref = fluorescence.reference_lines_keV()
    runs = [
        ("fit_fixed_brass", "CuZn39Pb3", ["Cu Kα", "Zn Kα", "Cu Kβ", "Zn Kβ"], 1),
        ("fit_fixed_pb_brass", "CuZn39Pb3", ["Pb Lα"], 1),
        ("fit_fixed_cu", "Cu", ["Cu Kα", "Cu Kβ"], 2),
    ]
    out = {}
    for name, sample, labels, seed in runs:
        exp, _, e_ch = fluorescence.mca_spectrum(sample, 35.0, 1.0, 180.0, 512, -2.5)
        counts = detector.sample_counts(exp, 1.0, np.random.default_rng(seed))
        centers = [ref[lb] for lb in labels]
        sigma = [float(detector.pin_fwhm_keV(c)) / _FIT_SIGMA for c in centers]
        fit = analysis.gauss_fit_fixed(e_ch, counts, centers, sigma)
        out[name] = {
            "function": "analysis.gauss_fit_fixed",
            "description": f"Fixed-centre, fixed-σ line fit of a Poisson sample (seed {seed}) of "
            f"{sample} at 35 kV, 1 mA, 180 s: {', '.join(labels)}",
            "inputs": {
                "channel_energy_keV": _floats(e_ch), "counts": [int(c) for c in counts],
                "centers_keV": centers, "sigma_keV": sigma, "window_keV": None,
            },
            "expected": {
                "area": _floats(fit.area), "area_err": _floats(fit.area_err),
                "area_cov": _floats(fit.area_cov), "chi2_dof": fit.chi2_dof,
                "channel_keV": fit.channel_keV, "background": _floats(fit.background),
                "evaluate_sum": _floats(fit.evaluate(e_ch).sum(axis=0)),
            },
        }  # fmt: skip
    return out


def _fit_fixed_rejected_case():
    e, y = np.arange(20.0), np.ones(20)
    ok = {"channel_energy_keV": _floats(e), "counts": _floats(y), "centers_keV": [10.0],
          "sigma_keV": [0.5], "window_keV": None}  # fmt: skip
    cases = [
        ("window with too few channels", {**ok, "window_keV": [9.0, 10.5]}),
        ("centres and sigmas of different length", {**ok, "sigma_keV": [0.5, 0.5]}),
        ("non-positive sigma", {**ok, "sigma_keV": [0.0]}),
        ("no lines", {**ok, "centers_keV": [], "sigma_keV": []}),
        # JSON has no NaN: null stands for a non-finite value (NaN in numpy, null in JS)
        ("non-finite sigma", {**ok, "sigma_keV": [None]}),
        ("non-finite centre", {**ok, "centers_keV": [None]}),
        ("centres too close", {**ok, "centers_keV": [10.0, 10.1], "sigma_keV": [0.5, 0.5]}),
        ("centre outside the window", {**ok, "window_keV": [2.0, 8.0]}),
    ]
    out = []
    for description, inputs in cases:
        x = {k: v for k, v in inputs.items()}
        try:
            analysis.gauss_fit_fixed(x["channel_energy_keV"], x["counts"], x["centers_keV"],
                                     x["sigma_keV"], x["window_keV"])  # fmt: skip
        except ValueError as err:
            out.append({"function": "analysis.gauss_fit_fixed", "description": description,
                        "inputs": inputs, "expected": {"error": type(err).__name__}})  # fmt: skip
        else:
            raise AssertionError(f"gauss_fit_fixed accepted {description}")
    return {
        "function": "rejected",
        "description": "Line-fit inputs the model refuses",
        "cases": out,
    }


def _crystal_tables():
    """Everything the port needs for ``expected_rate(..., crystal=X)`` without xraylib.

    r_n(params) = k · f_sq_rel[n−1] · exp(−2 B (n²−1) s_1²) with k = cell_scale, times
    exp(2 B_th / (2 d_NaCl)²), B_th = 13 000 pm² (NaCl thermal), when ``fitted_debye_waller`` is
    false, B = params.debye_waller_pm2 when it is true and 0 otherwise
    (scan.ModelParams.order_strengths). The μ_X(λ) tables are the
    very ones Python interpolates log–log (crystal.mu_per_cm_table), so mu_factor agrees exactly;
    the same holds for ``extinction`` (crystal.extinction_table, the reflectivity factor y·κ:
    extinction × anomalous dispersion, already rounded to 4 significant digits).
    ``allowed_orders`` is lookup data (crystal.allowed_orders), not recomputed in TS.
    """
    out = {}
    for name, c in PRESETS.items():
        out[name] = {
            "a_pm": c.a_pm, "b_pm": c.b_pm, "c_pm": c.c_pm,
            "alpha_deg": c.alpha_deg, "beta_deg": c.beta_deg, "gamma_deg": c.gamma_deg,
            "cut": list(c.cut),
            "d_pm": d_pm(c),
            "density_g_cm3": density_g_cm3(c),
            "reflectivity_model": c.reflectivity_model,
            "mosaic_fwhm_deg": c.mosaic_fwhm_deg,
            "extinction": [_floats(row) for row in extinction_table(c)],
            "fitted_debye_waller": c.fitted_debye_waller,
            "source": c.source,
            "max_order": scan.max_order(c),
            "cell_scale": cell_scale(c),
            "f_sq_rel": list(structure_factor_sq_rel_crystal(c, scan.max_order(c))),
            "allowed_orders": list(allowed_orders(c)),
            "mu_per_cm": _floats(mu_per_cm_table(c)),
            "mu_edges_pm": list(mu_edges_pm(c)),
        }  # fmt: skip
    return out


def _crystal_fixtures():
    """One 35 kV, 1 mA coupled scan per non-NaCl preset, orders 1–3 of Mo Kα/Kβ in the window."""
    out = {}
    for name, c in PRESETS.items():
        if c is NACL:
            continue
        d = d_pm(c)
        lo = 1.5 if name == "muscovite" else round(float(theta_from_lambda(MO_KB_PM, 1, d)) - 1, 1)
        hi = (
            8.0 if name == "muscovite" else round(float(theta_from_lambda(MO_KA_PM, 3, d)) + 1.5, 1)
        )
        case = _rate_case(
            f"{name}, 35 kV, 1 mA, coupled {lo:g}° → {hi:g}°, Δβ = 0.05° (orders 1–3 of Mo Kα/Kβ)",
            scan.coupled_betas(lo, hi, 0.05), 35.0, 1.0, crystal=c,
        )  # fmt: skip
        case["inputs"]["crystal"] = name
        out[f"crystal_{name.lower()}_35kV_1mA"] = case
    out.update(_crystal_fixtures_wide())
    return out


def _crystal_fixtures_wide():
    """Crystals off the 35 kV, 1 mA, unfiltered, coupled default: low kV, detached sensor, tail."""
    out = {}
    lif, calcite, mus = PRESETS["LiF"], PRESETS["calcite"], PRESETS["muscovite"]

    def add(key, crystal_key, case):
        case["inputs"]["crystal"] = crystal_key
        out[key] = case

    zr = (("Zr", areal_density_mg_cm2("Zr", 0.05)),)
    add(
        "crystal_lif_20kV_zr_filter",
        "LiF",
        _rate_case(
            "LiF, 20 kV (below the Mo K edge: continuum only), 1 mA, Zr 0.05 mm, "
            "coupled 5° → 30°, Δβ = 0.25° (orders 1–2 window)",
            scan.coupled_betas(5.0, 30.0, 0.25), 20.0, 1.0, filters=zr, crystal=lif,
        ),
    )  # fmt: skip
    th = float(theta_from_lambda(MO_KA_PM, 1, d_pm(calcite)))
    sensor = np.r_[
        2 * th - 0.3, 2 * th - 0.1, 2 * th, 2 * th + 0.1, 2 * th + 0.3, 0.0, 120.0, 2 * th
    ]
    beta = np.r_[np.full(7, th), th + 1.0]
    add(
        "crystal_calcite_detached_sensor",
        "calcite",
        _rate_case(
            "calcite, 35 kV, 1 mA: target at order-1 Kα θ, sensor at 2θ ± 0.3° and far off; "
            "last point target 1° off with the sensor at 2θ",
            beta, 35.0, 1.0, sensor_deg=sensor, crystal=calcite,
        ),
    )  # fmt: skip
    add(
        "crystal_muscovite_35kV_high_orders",
        "muscovite",
        _rate_case(
            "muscovite, 35 kV, 1 mA, coupled 60° → 85°, Δβ = 0.5° (high-order tail, "
            f"max_order {scan.max_order(mus)})",
            scan.coupled_betas(60.0, 85.0, 0.5), 35.0, 1.0, crystal=mus,
        ),
    )  # fmt: skip
    return out


FORGE_SEED = 20261021  # fixed seed of the random forged crystals (byte-identical exports)
FORGE_SYSTEMS = {  # name: (cell system, reflectivity model, forced elements, cut candidates)
    "cubic_mosaic": ("cubic", "mosaic_extinction", (), ((1, 0, 0), (1, 1, 0), (1, 1, 1))),
    "monoclinic_darwin": ("monoclinic", "darwin", (), ((0, 0, 1), (1, 0, 0), (0, 1, 0))),
    "triclinic_mosaic": ("triclinic", "mosaic_extinction", (), ((0, 0, 1), (0, 1, 0))),
    "tetragonal_zr_k_edge_darwin": ("tetragonal", "darwin", (40, 8), ((0, 0, 1), (1, 1, 0))),
    "orthorhombic_lead_ideal": ("orthorhombic", "ideal_mosaic", (82, 16), ((0, 0, 1), (1, 0, 0))),
}


def _random_forge_input(rng, system, model, forced, cuts):
    """One random cell, basis (2–5 atoms, Z from ``forced`` plus 3 … 40) and cut, as a ``Crystal``
    for the Forge fixtures. Drawn from ``rng`` only; the caller retries until it is valid."""
    a, b, c = (round(float(x), 1) for x in rng.uniform(350, 650, 3))
    ang = {"cubic": (90, 90, 90), "tetragonal": (90, 90, 90), "orthorhombic": (90, 90, 90),
           "monoclinic": (90, round(float(rng.uniform(95, 110)), 1), 90)}  # fmt: skip
    if system == "triclinic":
        ang["triclinic"] = tuple(round(float(x), 1) for x in rng.uniform(80, 100, 3))
    if system in ("cubic", "tetragonal"):
        b = a
    if system == "cubic":
        c = a
    zs = [*forced, *(int(z) for z in rng.integers(3, 41, int(rng.integers(1, 4))))]
    basis = tuple(
        (int(z), *(round(float(x), 4) for x in rng.random(3)),
         round(float(rng.uniform(0.3, 1.5)), 2), 1.0)
        for z in zs
    )  # fmt: skip
    eta = round(float(rng.uniform(0.05, 0.5)), 2) if model == "mosaic_extinction" else None
    cut = cuts[int(rng.integers(len(cuts)))]
    return Crystal(
        f"forge_{system}", a, b, c, *ang[system], basis, cut, "random Forge fixture",
        reflectivity_model=model, mosaic_fwhm_deg=eta,
    )  # fmt: skip


def _forge_input(c):
    """The Forge input dict (what the browser receives) of a ``Crystal``."""
    return {
        "name": c.name,
        "cell": {"a_pm": c.a_pm, "b_pm": c.b_pm, "c_pm": c.c_pm, "alpha_deg": c.alpha_deg,
                 "beta_deg": c.beta_deg, "gamma_deg": c.gamma_deg},
        "basis": [list(a) for a in c.basis],
        "cut": list(c.cut),
        "reflectivity_model": c.reflectivity_model,
        "mosaic_fwhm_deg": c.mosaic_fwhm_deg,
        "source": c.source,
    }  # fmt: skip


def _forge_case(description, c):
    """Forge fixture: the input crystal, its table-built entry, and one 35 kV, 1 mA coupled scan of
    the orders 1–3 window computed from the forged crystal (``scan.expected_rate``)."""
    d = d_pm(c)
    reach = 2 * d * np.sin(np.radians(scan.BETA_MAX_DEG))
    n_hi = max(n for n in (1, 2, 3) if n * MO_KA_PM <= reach)
    lo = max(round(float(theta_from_lambda(MO_KB_PM, 1, d)) - 1, 1), 2.0)
    hi = min(round(float(theta_from_lambda(MO_KA_PM, n_hi, d)) + 1.5, 1), 85.0)
    case = _rate_case(
        f"{c.name} (forged), 35 kV, 1 mA, coupled {lo:g}° → {hi:g}°, Δβ = 0.05°",
        scan.coupled_betas(lo, hi, 0.05), 35.0, 1.0, crystal=forge.forged(c),
    )  # fmt: skip
    return {
        "function": "forge.entry",
        "description": description,
        "input": _forge_input(c),
        "entry": forge.entry(c),
        "warnings": list(forge.warnings(c)),
        "scan": case,
    }  # fmt: skip


@functools.cache
def _forge_fixtures():
    """Forged LiF, Si and calcite (the presets' cell, basis, cut, model: the port must agree with
    the tables' entry) and five seeded random crystals, among them a monoclinic, a triclinic, two
    mosaic ones and a Zr-containing one (K edge 68.9 pm between Mo Kβ and Kα)."""
    out = {}
    for name in ("LiF", "Si", "calcite"):
        c = dataclasses.replace(PRESETS[name], source="Forge copy of the preset")
        out[name.lower()] = _forge_case(f"Forge copy of the {name} preset", c)
    rng = np.random.default_rng(FORGE_SEED)
    for key, spec in FORGE_SYSTEMS.items():
        for _ in range(500):
            try:
                c = _random_forge_input(rng, *spec)
            except ValueError:  # cut reflection systematically absent
                continue
            n_max = scan.max_order(c)
            if n_max <= 25 and "no_line_reflects" not in forge.warnings(c):
                break
        else:
            raise RuntimeError(f"no valid random crystal for {key}")
        out[key] = _forge_case(f"Random {key.replace('_', ' ')} crystal (seed {FORGE_SEED})", c)
    # disordered Cu3Au (Cu 0.75 + Au 0.25 on each fcc site): mixed occupancy, a cut with a negative
    # index, Cu K and Au L edges (B and η are assumptions)
    alloy = Crystal(
        "Cu3Au_disordered", 374.8, 374.8, 374.8, 90.0, 90.0, 90.0,
        build_basis([(((29, 0.75), (79, 0.25)), (0, 0, 0), 0.6)], centrings=FCC),
        (1, -1, 1), "Forge test: disordered Cu3Au, a = 374.8 pm",
        reflectivity_model="mosaic_extinction", mosaic_fwhm_deg=0.2,
    )  # fmt: skip
    out["mixed_site_alloy"] = _forge_case("Disordered Cu3Au, cut (1, -1, 1)", alloy)
    out["warnings"] = _forge_warnings_fixture()
    out["invalid"] = _forge_invalid_fixture()
    out["atoms"] = _forge_atoms_fixture()
    return out


def _cubic(name, a, cut=(0, 0, 1), atoms=((14, 0, 0, 0, 0.5, 1.0),)):
    return Crystal(name, a, a, a, 90.0, 90.0, 90.0, atoms, cut, "Forge test")


def _forge_warnings_fixture():
    """Warning codes (no scan) of hand-made designs, and the oversized cell as a refusal."""
    skew = Crystal(
        "skewed", 400.0, 400.0, 500.0, 90.0, 90.0, 30.0,
        ((14, 0.02, 0.02, 0.1, 0.5, 1.0), (8, 0.98, 0.98, 0.1, 0.5, 1.0)), (0, 0, 1),
        "Forge test",
    )  # fmt: skip
    rows = [
        ("two atoms 31 pm apart across the cell boundary of a γ = 30° cell", skew),
        (
            "(10 0 0) of a 300 pm cube: 2 d sin 85° is shorter than Mo Kβ",
            _cubic("fine", 300.0, (10, 0, 0)),
        ),
        ("a 1500 pm cube: many orders, still buildable", _cubic("many", 1500.0)),
        ("a 2400 pm cube: many orders", _cubic("big", 2400.0)),
        ("a 5000 pm cube: refused, too many orders", _cubic("huge", 5000.0)),
        ("a plain 450 pm cube: nothing to say", _cubic("plain", 450.0)),
    ]
    cases = []
    for description, c in rows:
        case = {"description": description, "input": _forge_input(c)}
        if scan.max_order(c) > forge.MAX_ORDERS:
            try:
                forge.forged(c)
            except ForgeInputError as e:
                case["error_code"] = e.code
            else:
                raise RuntimeError("expected a refusal")
        else:
            case["warnings"] = list(forge.warnings(c))
        cases.append(case)
    assert [c.get("warnings") for c in cases][:2] == [["atoms_too_close"], ["no_line_reflects"]]
    return {
        "function": "forge.warnings",
        "description": "Warning codes of designs worth reconsidering; the oversized cell refusal",
        "cases": cases,
    }


def _forge_invalid_fixture():
    """Every refusal at the trust boundary: input -> stable code (and the hint of cut_absent)."""
    si = _forge_input(_cubic("v", 450.0, atoms=((14, 0, 0, 0, 0.5, 1.0),)))
    fcc = {  # Si (fcc lattice): (100) is systematically absent, (200) is present
        **_forge_input(_cubic("fcc", 543.0)),
        "basis": [list(a) for a in build_basis([(((14, 1.0),), (0, 0, 0), 0.5)], centrings=FCC)],
        "cut": [1, 0, 0],
    }

    def atom(**kw):
        z, b, occ = kw.get("z", 14), kw.get("b", 0.5), kw.get("occ", 1.0)
        return {**si, "basis": [[z, 0, 0, 0, b, occ]]}

    mosaic = {**si, "reflectivity_model": "mosaic_extinction"}
    rows = [
        ("Z = 0", atom(z=0), "bad_z"),
        ("Z = 93", atom(z=93), "bad_z"),
        ("Z = 14.5", atom(z=14.5), "bad_z"),
        ("occupancy 0", atom(occ=0.0), "bad_occupancy"),
        ("occupancy 1.5", atom(occ=1.5), "bad_occupancy"),
        ("B < 0", atom(b=-0.1), "bad_b"),
        ("B above the 30 Å² cap", atom(b=30.5), "b_too_large"),
        (
            "impossible cell (all angles 150°)",
            {
                **si,
                "cell": {**si["cell"], "alpha_deg": 150.0, "beta_deg": 150.0, "gamma_deg": 150.0},
            },
            "bad_cell",
        ),
        ("zero cell length", {**si, "cell": {**si["cell"], "a_pm": 0.0}}, "bad_cell"),
        ("no atoms", {**si, "basis": []}, "bad_cell"),
        ("atom with five numbers", {**si, "basis": [[14, 0, 0, 0, 0.5]]}, "bad_atom"),
        (
            "site holds occupancy 1.3",
            {**si, "basis": [[14, 0, 0, 0, 0.5, 0.7], [8, 0, 0, 0, 0.5, 0.6]]},
            "site_overfilled",
        ),
        ("non-integer cut", {**si, "cut": [0.5, 0, 0]}, "bad_cut"),
        ("zero cut", {**si, "cut": [0, 0, 0]}, "bad_cut"),
        ("cut of two numbers", {**si, "cut": [1, 0]}, "bad_cut"),
        ("absent (100) of a face-centred cell", fcc, "cut_absent"),
        ("unknown reflectivity model", {**si, "reflectivity_model": "dynamical"}, "bad_model"),
        ("mosaic_extinction without a mosaic", mosaic, "bad_mosaic"),
        ("mosaic_extinction with η = 0", {**mosaic, "mosaic_fwhm_deg": 0.0}, "bad_mosaic"),
        ("a mosaic spread for a darwin crystal", {**si, "mosaic_fwhm_deg": 0.2}, "bad_mosaic"),
    ]
    cases = []
    for description, inp, code in rows:
        try:
            forge.from_input(inp)
        except ForgeInputError as e:
            assert e.code == code, (description, e.code)
            cases.append({"description": description, "input": inp, "code": code,
                          "hint": list(e.hint) if e.hint else None})  # fmt: skip
        else:
            raise RuntimeError(f"{description}: not refused")
    return {
        "function": "forge.invalid",
        "description": "Designs outside the trust boundary: stable error codes for the UI",
        "cases": cases,
    }


def _forge_atoms_fixture():
    """The atomic data a forged crystal reads, per Z = 1 … 92: f0 at a few s (beyond 3 Å⁻¹ the last
    value is held), f′ and f″ at the grid ends and the Mo lines, σ at every edge (±1e-9 relative
    in λ) and beyond the ends of the grid. Test data only (never shipped)."""
    s_inv_a = [0.0, 0.004, 0.05, 0.37, 1.0, 2.0, 2.995, 3.0, 3.4]
    lam_fp = [float(MU_RHO_GRID_PM[0]), MO_KB_PM, MO_KA_PM, float(MU_RHO_GRID_PM[-1])]
    t = forge.TABLES
    elements = []
    for z in range(1, forge.Z_MAX + 1):
        edges = forge.element_tables()["elements"][z - 1]["edges_pm"]
        lo, hi = float(MU_RHO_GRID_PM[0]), float(MU_RHO_GRID_PM[-1])
        lam_sig = [lo / 2, lo, MO_KA_PM, hi, hi * 2]
        for e in edges:
            lam_sig += [
                e * (1 - 1e-9),
                e * (1 + 1e-9),
            ]  # not e itself: ties go either way by an ulp of log
        lam_sig = [float(x) for x in lam_sig]
        elements.append({
            "z": z,
            "f0": [t.f0(z, s) for s in s_inv_a],
            "f_prime": [float(t.f_prime(z, HC_KEV_PM / x)) for x in lam_fp],
            "f_second": [t.f_second(z, HC_KEV_PM / x) for x in lam_fp],
            "sigma_lambda_pm": lam_sig,
            "sigma_cm2": [float(t.sigma_cm2(z, x)) for x in lam_sig],
        })  # fmt: skip
    return {
        "function": "forge.atoms",
        "description": "TableAtoms values per element: f0(s), f'/f'' (E = hc/λ), σ(λ)",
        "s_inv_A": s_inv_a,
        "lambda_pm": lam_fp,
        "elements": elements,
    }


def _prominence_case():
    """Expected line prominence (weak-signal aid): NaCl, Si (extinct orders), a filter, no line."""
    zr = (("Zr", areal_density_mg_cm2("Zr", 0.05)),)
    mus = PRESETS["muscovite"]
    rows = [
        ("NaCl", NACL, 4.0, 24.0, 35.0, 1.0, 1.0, ()),
        ("Si", PRESETS["Si"], 4.0, 40.0, 35.0, 1.0, 1.0, ()),
        ("Si", PRESETS["Si"], 4.0, 24.0, 35.0, 0.05, 1.0, ()),
        ("calcite", PRESETS["calcite"], 3.0, 30.0, 30.0, 0.5, 10.0, zr),
        ("muscovite", mus, 1.0, 12.0, 35.0, 1.0, 1.0, ()),
        ("NaCl", NACL, 1.0, 3.0, 35.0, 1.0, 1.0, ()),  # no line in the window: 0
        ("NaCl", NACL, 2.0, 40.0, 15.0, 1.0, 1.0, ()),  # below the K edge
        ("NaCl", NACL, 5.0, 9.0, 19.5, 1.0, 1.0, ()),  # just below U_K: no line emitted, 0
        ("muscovite", mus, 1.0, 3.0, 35.0, 1.0, 1.0, ()),  # negative raw σ (leak): clamped to 0
    ]
    cases = []
    for name, c, lo, hi, u_kv, i_ma, dt, filters in rows:
        cases.append(
            {
                "inputs": {"crystal": name, "beta_lo_deg": lo, "beta_hi_deg": hi, "U_kV": u_kv,
                           "I_mA": i_ma, "dt_s": dt, "filters": [[m, d] for m, d in filters],
                           "params": dataclasses.asdict(scan.DEFAULT)},
                "expected": {
                    "sigma": analysis.line_prominence_sigma(lo, hi, u_kv, i_ma, dt, filters, c),
                    "strongest_rate_per_s": analysis.strongest_line_rate_per_s(
                        lo, hi, u_kv, i_ma, filters, c
                    ),
                },
            }
        )  # fmt: skip
    return {
        "function": "analysis.line_prominence_sigma",
        "description": "Expected prominence (σ) and strongest-line rate of the Mo K lines",
        "cases": cases,
    }


def _calibration_fixtures():
    """MCA two-point calibration: the guide's Cu Kα / Pb Lα pair, a reversed pair, a unit map."""
    rows = [(103.0, 8.04, 132.0, 10.56), (400.0, 10.56, 103.0, 8.04), (0.0, 0.0, 512.0, 20.48)]
    cases = []
    for ch1, e1, ch2, e2 in rows:
        slope, off = analysis.two_point_calibration(ch1, e1, ch2, e2)
        cases.append({"inputs": {"ch1": ch1, "E1_keV": e1, "ch2": ch2, "E2_keV": e2},
                      "expected": {"kev_per_channel": slope, "offset_keV": off}})  # fmt: skip
    bad = {"ch1": 100.0, "E1_keV": 8.04, "ch2": 100.0, "E2_keV": 10.56}
    try:
        analysis.two_point_calibration(**bad)
    except ValueError as e:
        rej = {"function": "analysis.two_point_calibration", "description": "equal channels",
               "inputs": bad, "expected": {"error": type(e).__name__}}  # fmt: skip
    else:
        raise AssertionError("two_point_calibration accepted equal channels")
    return (
        {"function": "analysis.two_point_calibration", "description": "E = slope·ch + offset",
         "cases": cases},
        {"function": "rejected", "description": "Calibration inputs the model refuses",
         "cases": [rej]},
    )  # fmt: skip


def _fixtures():
    duane_hunt_deg = float(theta_from_lambda(lambda_min_pm(35.0)))
    ka_deg = float(theta_from_lambda(MO_KA_PM))
    sweep = scan.coupled_betas(2 * ka_deg - 1.0, 2 * ka_deg + 1.0, 0.02)
    rocking = np.r_[ka_deg + np.arange(-0.6, 0.61, 0.02), ka_deg + 360.0, -ka_deg]
    return {
        "leaflet_35kV_1mA": _rate_case(
            "Leaflet Fig. 4 settings: 2°→25°, Δβ = 0.1°, 35 kV, 1 mA", LEAFLET_BETAS, 35.0, 1.0
        ),
        "below_k_edge_19kV": _rate_case(
            "Below the Mo K edge: continuum only, no lines", LEAFLET_BETAS, 19.0, 1.0
        ),
        "at_k_edge": _rate_case(
            "U exactly at the Mo K edge: lines still off (they need U > U_K)",
            LEAFLET_BETAS,
            MO_K_EDGE_KEV,
            1.0,
        ),  # fmt: skip
        "above_k_edge_25kV_0.3mA": _rate_case(
            "Weak lines just above the K edge, reduced current", LEAFLET_BETAS, 25.0, 0.3
        ),
        "edge_angles": _rate_case(
            "Arm limits, the other crystal face (β < 0), β ≈ 0 and the 35 kV Duane–Hunt angle",
            [
                -5.0,
                -0.05,
                0.0,
                0.005,
                0.05,
                duane_hunt_deg - 0.02,
                duane_hunt_deg,
                duane_hunt_deg + 0.05,
                85.0,
            ],
            35.0,
            1.0,
        ),  # fmt: skip
        "full_range_coarse": _rate_case(
            "Whole coupled range in 0.5° steps: far tails stay finite thanks to scatter",
            scan.coupled_betas(-5.0, 85.0, 0.5),
            35.0,
            1.0,
        ),  # fmt: skip
        "low_voltage_10kV": _rate_case(
            "10 kV: continuum onset at 12.7° where the absorber cuts deep, no lines",
            scan.coupled_betas(2.0, 40.0, 0.2),
            10.0,
            1.0,
        ),  # fmt: skip
        "higher_orders_20_to_45deg": _rate_case(
            "Beyond the leaflet range: 3rd to 6th order (4th-order Kα at 30.27°)",
            scan.coupled_betas(20.0, 45.0, 0.1),
            35.0,
            1.0,
        ),  # fmt: skip
        "voltage_series": {
            "function": "scan.expected_rate",
            "description": "20, 25, 30 kV: leak and scatter scale with the tube factor S(U)",
            "cases": [
                _rate_case(f"{U:g} kV", scan.coupled_betas(0.0, 25.0, 0.25), U, 1.0)
                for U in (20.0, 25.0, 30.0)
            ],
        },
        "sensor_sweep_fixed_target": _rate_case(
            "Target fixed at 1st-order Kα, sensor swept across 2θ (sensor_deg given)",
            np.full_like(sweep, ka_deg),
            35.0,
            1.0,
            sensor_deg=sweep,
        ),
        "target_sweep_fixed_sensor": _rate_case(
            "Sensor fixed at 2θ(Kα), target swept through the rocking curve and wrapped past 360°",
            rocking,
            35.0,
            1.0,
            sensor_deg=np.full_like(rocking, 2 * ka_deg),
        ),
        "transmission": _transmission_case(),
        "zr_filter_35kV": _rate_case(
            "Zr foil 0.05 mm (32.6 mg/cm²) between the Mo lines: Kβ cut far more than Kα",
            LEAFLET_BETAS,
            35.0,
            1.0,
            filters=(("Zr", 32.6),),
        ),
        "direct_beam": {
            "function": "scan.direct_rate",
            "description": "EPN Práctica 1: counter in the direct beam, no crystal, with absorbers",
            "cases": [
                _direct_case("21 kV, 0.05 mA, open (EPN anchor ≥ 950/s)", 21.0, 0.05),
                _direct_case("Al 1.0 mm", 21.0, 0.05, (("Al", 270.0),)),
                _direct_case("Zr 0.05 mm + Cu 0.4 mm", 30.0, 1.0, (("Zr", 32.6), ("Cu", 358.4))),
                _direct_case("Tube off: natural background only", 0.0, 0.05),
                _direct_case("Off-axis 1.5° (Gaussian profile, leak width)", 21.0, 0.05, (), 1.5),
                _direct_case("Off-axis 3°", 21.0, 0.05, (), 3.0),
                _direct_case(
                    "Counters at 2 cm and 2 cm (inverse square)", 21.0, 0.05, (), 0.0, (2.0, 2.0)
                ),
                _direct_case(
                    "Bragg geometry 5 cm / 6 cm, off-axis 1.5°", 21.0, 0.05, (), 1.5, (5.0, 6.0)
                ),
            ],
        },
        "tube_off_I0": _rate_case(
            "Emission current 0: natural background only", LEAFLET_BETAS, 35.0, 0.0
        ),
        "tube_off_U0": _rate_case(
            "Tube voltage 0: natural background only", LEAFLET_BETAS, 0.0, 1.0
        ),
        "geometry_counter_close": _rate_case(
            "s1 = 5 cm, s2 = 2 cm: broader (σ 0.26°) and stronger lines",
            LEAFLET_BETAS,
            35.0,
            1.0,
            s2_cm=2.0,
        ),
        "geometry_far_collimator_far_counter": _rate_case(
            "s1 = 8 cm, s2 = 12 cm: sharper and weaker; sensor/target uncoupled by 0.1°",
            scan.coupled_betas(2.0, 25.0, 0.1),
            30.0,
            0.5,
            sensor_deg=2 * scan.coupled_betas(2.0, 25.0, 0.1) + 0.1,
            s1_cm=8.0,
            s2_cm=12.0,
        ),
        "geometry_zr_filter_near": _rate_case(
            "s1 = 3 cm, s2 = 4.5 cm with a Zr foil",
            LEAFLET_BETAS,
            35.0,
            1.0,
            filters=(("Zr", 32.6),),
            s1_cm=3.0,
            s2_cm=4.5,
        ),
        "sigma_narrow": _rate_case(
            "Sharper resolution σ = 0.05° (short convolution kernel)",
            LEAFLET_BETAS,
            35.0,
            1.0,
            scan.DEFAULT.replace(sigma_deg=0.05),
        ),  # fmt: skip
        "sigma_wide": _rate_case(
            "Coarser resolution σ = 0.3° (Kα and Kβ start to merge)",
            LEAFLET_BETAS,
            35.0,
            1.0,
            scan.DEFAULT.replace(sigma_deg=0.3),
        ),  # fmt: skip
        "coupled_betas": {
            "function": "scan.coupled_betas",
            "description": "Scan angles: step not dividing the range, float noise, negative start",
            "cases": [
                {
                    "inputs": {"lo_deg": lo, "hi_deg": hi, "step_deg": step},
                    "expected": {"beta_deg": _floats(scan.coupled_betas(lo, hi, step))},
                }
                for lo, hi, step in [
                    (2.0, 25.0, 0.1),
                    (2.0, 25.0, 0.3),
                    (-5.0, 10.0, 0.1),
                    (0.0, 0.5, 0.25),
                    (80.0, 85.0, 0.3),
                    (7.2, 7.2, 0.1),
                ]
            ],
        },  # fmt: skip
        "rejected_inputs": _rejected_case(),
        "line_prominence": _prominence_case(),
        "two_point_calibration": _calibration_fixtures()[0],
        "two_point_calibration_rejected": _calibration_fixtures()[1],
    }


def build():
    """All artifact files as {path relative to artifacts/: text}."""
    files = {
        "tables/mu_rho.json": _dump(
            {
                "description": "Mass attenuation μ/ρ (cm²/g) on lambda_pm; interpolate log–log, "
                "hold the end values outside; edge_lambda_pm = K, L1-L3 edges in the grid, "
                "kept sharp (braggsim.filters.log_mu_rho)",
                "source": f"xraylib {xraylib.__version__} CS_Total_CP",
                "lambda_pm": _floats(MU_RHO_GRID_PM),
                "mu_rho_cm2_g": {m: _floats(mu_rho_table(m)) for m in (scan.AIR, scan.ABSORBER)},
                "edge_lambda_pm": {m: list(mu_rho_edges_pm(m)) for m in (scan.AIR, scan.ABSORBER)},
            }
        ),
        "tables/mu_rho_absorbers.json": _dump(
            {
                "description": "Mass attenuation μ/ρ (cm²/g) of the absorbers on the grid "
                "of mu_rho.json; same interpolation (braggsim.filters.transmission)",
                "source": f"xraylib {xraylib.__version__} CS_Total_CP",
                "mu_rho_cm2_g": {m: _floats(mu_rho_table(m)) for m in ABSORBERS},
                "edge_lambda_pm": {m: list(mu_rho_edges_pm(m)) for m in ABSORBERS},
                "foils_mg_cm2": {
                    m: round(areal_density_mg_cm2(m, t), 6) for m, t in FOILS_MM.items()
                },
                "wheels_mg_cm2": {
                    w: [
                        None if slot is None else [slot[0], round(areal_density_mg_cm2(*slot), 6)]
                        for slot in slots
                    ]
                    for w, slots in WHEELS_MM.items()
                },
                "wheels_mm": {
                    w: [None if slot is None else [slot[0], slot[1]] for slot in slots]
                    for w, slots in WHEELS_MM.items()
                },
            }
        ),
        "tables/structure_factor.json": _dump(
            {
                "description": "|F_n|²/|F_1|² of NaCl (2n 0 0), n = 1 … MAX_ORDER, atoms at rest; "
                "r_n multiplies it by exp(−2B (s_n² − s_1²)) (scan.ModelParams.order_reflectivity)",
                "source": f"xraylib {xraylib.__version__} FF_Rayl",
                "f_sq_rel": list(structure_factor_sq_rel(scan.MAX_ORDER)),
            }
        ),
        "tables/crystals.json": _dump(
            {
                "description": "Crystal presets (braggsim.crystal.PRESETS). r_n = k f_sq_rel[n−1] "
                "exp(−2B(n²−1)s_1²), s_1 = 1/(2 d_pm): k = cell_scale (× exp(2 B_th/(2 d_NaCl)²) "
                "if not fitted_debye_waller; B_th = 13 000 pm², s in pm⁻¹), B in pm², "
                "B = params.debye_waller_pm2 if fitted_debye_waller else 0 "
                "(scan.ModelParams.order_strengths). mu_factor is applied only for non-NaCl "
                "crystals, per order at λ_n = 2d sinθ/n on the θ grid before the Gaussian "
                "convolution, and per line component at its own λ. "
                "mu_edges_pm = K, L1-L3 absorption edges of its elements inside the grid, kept "
                "sharp "
                "(braggsim.filters.interp_log_mu); mu_per_cm = linear attenuation in 1/cm "
                "on lambda_pm of mu_rho.json (log–log interpolation, ends held); mu_factor = "
                "mu_per_cm[NaCl] / mu_per_cm[X] per λ. Non-NaCl crystals are also multiplied by "
                "extinction_ratio = (yκ)_X,n(λ)/(yκ)_NaCl,1(λ) at the same λ "
                "(crystal.extinction_ratio; y = extinction, "
                "κ = |F(f0+f′+if″)|²/|F(f0)|² anomalous dispersion) "
                "and k uses exp(2 B_th/(2 d_NaCl)²) with B_th = 13 000 pm² (1.3 Å², NaCl thermal) "
                "instead of B_fit. extinction[n−1] = y·κ of order n on the first len(row) nodes of "
                "lambda_pm of mu_rho.json (λ ≤ 2d sin85°/n plus one node; NaCl has order 1 only, "
                "the reference); interpolate log(yκ) vs log λ, end values held. "
                "allowed_orders = orders 1 … max_order that are not systematically absent "
                "(crystal.order_is_absent: at-rest |F|² ≥ 1e-12 (Σ occ Z)²)",
                "source": f"xraylib {xraylib.__version__} CS_Total, FF_Rayl, AtomicWeight",
                "crystals": _crystal_tables(),
            }
        ),
        "tables/model_params.json": _dump(
            {
                "description": "scan.DEFAULT, fitted to leaflet Fig. 4 (model/PARAMETERS.md)",
                "params": dataclasses.asdict(scan.DEFAULT),
            }
        ),
    }
    for name, case in _fixtures().items():
        files[f"fixtures/{name}.json"] = _dump({"name": name, **case})
    # Own folder: the TS fixture test globs fixtures/*.json only (C2.1: move up then).
    for name, case in _crystal_fixtures().items():
        files[f"fixtures/crystals/{name}.json"] = _dump({"name": name, **case})
    # Forge (user-designed crystals): the per-element tables and the entries built from them.
    files["tables/forge_elements.json"] = _dump(
        {
            "description": "Per-element tables for the Materials Forge (braggsim.forge). "
            "elements[Z−1]: f0 = Rayleigh form factor on s = i · f0_step_A (Å⁻¹, linear "
            "interpolation, last value held beyond f0_s_max_A); idx = nodes of lambda_pm of "
            "mu_rho.json kept for the element, with sigma_cm2 (atomic cross-section, cm², "
            "log–log in λ), f_prime (linear in λ) and f_second (xraylib Fii, negative, log–log in "
            "|f″|) on them, end values held; "
            "edges_pm = absorption steps of sigma (K, L, M) with edge_sigma_cm2 = [σ on the "
            "short-λ side, σ on the long-λ side], a step for the interpolation of sigma",
            "source": f"xraylib {xraylib.__version__} FF_Rayl, CS_Total, Fi, Fii, AtomicWeight",
            "constants": forge.CONSTANTS,
            **forge.element_tables(),
        },
        compact=True,
    )
    kernels_by_sample, mo_pin_eff = _xrf_kernels_table()
    for name, sample_table in kernels_by_sample.items():  # one file per sample: the web loads
        files[f"tables/xrf/{name}.json"] = _dump(  # only the samples in use, each < 500 kB
            {
                "description": "XRF kernels of braggsim.fluorescence.kernels for one sample: "
                "detected photons per incident photon on lam_pm (pm) then the four Mo components "
                "Kα1, Kα2, Kβ1,3, Kβ2 (every k, rayleigh, compton has len(lam_pm) + 4 entries); "
                "pin_eff = detector.pin_efficiency at the line energy, at the midpoints of the "
                "Rayleigh / Compton continuum intervals of mca_counts, and for the Mo scatter "
                "lines (pin_eff_mo_lines). scale_per_source_unit = "
                "fluorescence._scale(scan.DEFAULT); air_in_mg_cm2 = incident air path of _t_in",
                "source": f"xraylib {xraylib.__version__} CS_Total, "
                "CS_FluorLine_Kissel_Cascade, CS_Photo",
                "scale_per_source_unit": fluorescence._scale(scan.DEFAULT),
                "compton_shift_pm": fluorescence.COMPTON_SHIFT_PM,
                "air_in_mg_cm2": fluorescence._MG_CM2_PER_CM_AIR * fluorescence.AIR_IN_CM,
                "pin_eff_mo_lines": mo_pin_eff,
                "reference_lines_keV": fluorescence.reference_lines_keV(),
                "sample": sample_table,
            },
            compact=True,
        )
    for name, case in _xrf_fixtures().items():
        files[f"fixtures/xrf/{name}.json"] = _dump({"name": name, **case})
    files["fixtures/xrf/rejected_inputs.json"] = _dump(
        {"name": "rejected_inputs", **_xrf_rejected_case()}
    )
    for name, case in _fit_fixed_fixtures().items():
        files[f"fixtures/xrf/fit/{name}.json"] = _dump({"name": name, **case})
    files["fixtures/xrf/fit/rejected_inputs.json"] = _dump(
        {"name": "fit_rejected_inputs", **_fit_fixed_rejected_case()}
    )
    for name, case in _forge_fixtures().items():
        files[f"fixtures/forge/{name}.json"] = _dump({"name": name, **case})
    return files


def main():
    files = build()
    for old in ARTIFACTS.rglob("*.json"):
        if old.relative_to(ARTIFACTS).as_posix() not in files:
            old.unlink()
    for rel, text in files.items():
        path = ARTIFACTS / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")  # LF on Windows too
    print(f"wrote {len(files)} files to {ARTIFACTS}")


if __name__ == "__main__":
    main()
