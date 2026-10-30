import csv
from pathlib import Path

import numpy as np
import pytest
from pytest import approx

from braggsim.constants import MO_K_EDGE_KEV, MO_KA_PM, MO_KB_PM
from braggsim.crystal import theta_from_lambda
from braggsim.detector import dead_time
from braggsim.filters import WHEELS_MM, areal_density_mg_cm2
from braggsim.scan import DEFAULT, coupled_betas, direct_rate, expected_rate, tube_factor
from braggsim.source import lambda_min_pm

LEAFLET_BETAS = coupled_betas(2.0, 25.0, 0.1)


def test_leaflet_scan_has_231_steps():
    # LD P6.3.3.1: 2° → 25° in 0.1° steps.
    assert LEAFLET_BETAS.size == 231
    assert LEAFLET_BETAS[0] == 2.0 and LEAFLET_BETAS[-1] == 25.0


def test_scan_never_steps_past_the_upper_limit():
    # A Δβ that does not divide the range stops at the last step ≤ the upper limit, so a scan
    # to the arm limit (β = 85°) stays inside it.
    assert coupled_betas(2.0, 25.0, 0.3)[-1] == approx(24.8)
    assert coupled_betas(80.0, 85.0, 0.3)[-1] == approx(84.8)
    assert coupled_betas(0.0, 0.5, 0.25).tolist() == [0.0, 0.25, 0.5]


def test_scan_needs_a_positive_step_and_ordered_limits():
    # LD 554 800: Δβ = 0 is exposure-timer mode, not a scan; upper < lower refuses to scan.
    with pytest.raises(ValueError):
        coupled_betas(2.0, 25.0, 0.0)
    with pytest.raises(ValueError):
        coupled_betas(25.0, 2.0, 0.1)


@pytest.mark.parametrize(
    "lo, hi, step",
    [(np.nan, 25.0, 0.1), (2.0, np.inf, 0.1), (2.0, 25.0, np.nan), (0.0, 85.0, 1e-4)],
)
def test_scan_rejects_non_finite_limits_and_absurd_step_counts(lo, hi, step):
    with pytest.raises(ValueError):
        coupled_betas(lo, hi, step)


@pytest.mark.parametrize(
    "change",
    [{"sigma_deg": 0.0}, {"leak_width_deg": 0.0}, {"tau_s": -1e-4}, {"scale": np.nan},
     {"absorber_mg_cm2": np.inf}],
)  # fmt: skip
def test_unphysical_model_parameters_are_rejected(change):
    with pytest.raises(ValueError):
        DEFAULT.replace(**change)


def test_expected_rate_is_deterministic_and_non_negative():
    a = expected_rate(LEAFLET_BETAS, 35.0, 1.0)
    assert np.array_equal(a, expected_rate(LEAFLET_BETAS, 35.0, 1.0))
    assert np.all(a >= 0)


@pytest.mark.parametrize("n", [1, 2, 3])
@pytest.mark.parametrize("lam", [MO_KA_PM, MO_KB_PM])
def test_line_centroids_sit_at_leaflet_table_2_angles(n, lam):
    # Lines dominate (continuum ×1e-4 relative), no dead time: the intensity centroid of the
    # Kα1/Kα2 (or Kβ) blend is at the Bragg angle of the leaflet's mean wavelength.
    theta = float(theta_from_lambda(lam, n))
    beta = np.arange(theta - 0.5, theta + 0.5, 0.002)
    params = DEFAULT.replace(
        line_to_cont=1e4 * DEFAULT.line_to_cont, tau_s=0.0,
        leak_amp_per_s=0.0, scatter_per_s=0.0, background_per_s=0.0,
    )  # fmt: skip
    rate = expected_rate(beta, 35.0, 1.0, params)
    assert np.sum(beta * rate) / np.sum(rate) == approx(theta, abs=0.01)


def test_no_characteristic_lines_below_mo_k_edge():
    beta = np.arange(2.0, 25.0, 0.05)
    bragg = DEFAULT.replace(
        leak_amp_per_s=0.0, scatter_per_s=0.0, background_per_s=0.0
    )  # S(U) counts the lines too
    no_lines = bragg.replace(line_to_cont=0.0)
    for U in (19.0, MO_K_EDGE_KEV):  # lines switch on only above the edge itself
        assert expected_rate(beta, U, 1.0, bragg) == approx(expected_rate(beta, U, 1.0, no_lines))
    assert not np.allclose(
        expected_rate(beta, 35.0, 1.0, bragg), expected_rate(beta, 35.0, 1.0, no_lines)
    )


def test_continuum_onset_moves_with_voltage():
    beta = np.arange(3.0, 8.0, 0.01)
    params = DEFAULT.replace(leak_amp_per_s=0.0, scatter_per_s=0.0, background_per_s=0.0)
    onsets = []
    for U in (25.0, 30.0, 35.0):
        rate = expected_rate(beta, U, 1.0, params)
        onsets.append(beta[np.argmax(rate > 0.05 * rate.max())])
    assert onsets == sorted(onsets, reverse=True)


def test_continuum_starts_at_duane_hunt_angle():
    # λ_min(35 kV) = 35.42 pm → θ_min = arcsin(λ_min / 2d) = 3.60° (LD P6.3.3.1). With σ = 0 no
    # continuum below θ_min, and some right above it.
    theta_min = float(theta_from_lambda(lambda_min_pm(35.0)))
    assert theta_min == approx(3.60, abs=0.005)
    params = DEFAULT.replace(
        leak_amp_per_s=0.0, scatter_per_s=0.0, background_per_s=0.0, sigma_deg=1e-3
    )
    below, above = expected_rate(np.array([theta_min - 0.02, theta_min + 0.05]), 35.0, 1.0, params)
    assert below == approx(0, abs=1e-6) and above > 1


def test_dead_time_acts_on_the_total_rate_at_the_ka_peak():
    # Non-paralyzable R/(1+Rτ) on everything the counter sees (lines, continuum, leak, scatter).
    beta = np.array([float(theta_from_lambda(MO_KA_PM))])
    true = expected_rate(beta, 35.0, 1.0, DEFAULT.replace(tau_s=0.0))
    assert expected_rate(beta, 35.0, 1.0) == approx(true / (1 + true * DEFAULT.tau_s), rel=1e-12)
    assert true[0] > 2000  # the tip is where dead time matters (≈ 24 % loss)


def test_rate_is_linear_in_current_without_dead_time():
    params = DEFAULT.replace(tau_s=0.0, background_per_s=0.0)
    r1 = expected_rate(LEAFLET_BETAS, 35.0, 0.5, params)
    r2 = expected_rate(LEAFLET_BETAS, 35.0, 1.0, params)
    assert r2 == approx(2 * r1, rel=1e-12)


def test_tube_off_gives_only_the_natural_background():
    # Scatter and leak follow the tube; the GM natural background does not.
    bg = dead_time(DEFAULT.background_per_s, DEFAULT.tau_s)
    assert expected_rate(LEAFLET_BETAS, 35.0, 0.0) == approx(bg, rel=1e-12)
    assert expected_rate(LEAFLET_BETAS, 0.0, 1.0) == approx(bg, rel=1e-12)
    assert direct_rate(0.0, 1.0) == approx(bg, rel=1e-12)


def test_empty_filters_change_nothing_and_35kV_matches_the_unsplit_model():
    assert np.array_equal(
        expected_rate(LEAFLET_BETAS, 35.0, 1.0, filters=()), expected_rate(LEAFLET_BETAS, 35.0, 1.0)
    )
    # scatter 5.34 + background 0.2 is the fitted floor 5.54 at 35 kV, 1 mA (tube_factor = 1)
    old = DEFAULT.replace(scatter_per_s=5.54, background_per_s=0.0)
    assert expected_rate(LEAFLET_BETAS, 35.0, 1.0) == approx(
        expected_rate(LEAFLET_BETAS, 35.0, 1.0, old), rel=1e-12
    )


def test_zr_foil_between_the_mo_lines_cuts_kb_far_more_than_ka():
    zr = (("Zr", 32.6),)
    kb, ka = float(theta_from_lambda(MO_KB_PM)), float(theta_from_lambda(MO_KA_PM))
    beta = np.array([kb, ka])
    open_, filtered = (expected_rate(beta, 35.0, 1.0, filters=f) for f in ((), zr))
    assert (open_[0] / open_[1]) > 5 * (filtered[0] / filtered[1])


def test_filter_order_does_not_matter_and_a_second_foil_attenuates_more():
    p = DEFAULT.replace(tau_s=0.0, background_per_s=0.0)
    zr, cu = ("Zr", 32.6), ("Cu", 358.4)
    ab, ba = direct_rate(30.0, 1.0, (zr, cu), p), direct_rate(30.0, 1.0, (cu, zr), p)
    assert ab == approx(ba, rel=1e-12)
    # T multiplies per λ; for the whole spectrum a second foil can only lower the rate
    assert ab < direct_rate(30.0, 1.0, (zr,), p) < direct_rate(30.0, 1.0, (), p)


def test_direct_per_s_still_reproduces_its_epn_anchor():
    # Guard, not a check: direct_per_s was derived from this very number (PARAMETERS.md).
    assert direct_rate(21.0, 0.05) == approx(950, rel=1e-2)


def test_direct_beam_falls_with_aluminium_thickness():
    r = [direct_rate(21.0, 0.05, (("Al", 270.0 * mm),)) for mm in (0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0)]
    assert np.all(np.diff(r) < 0)


def test_direct_beam_is_linear_in_current_without_dead_time_or_background():
    p = DEFAULT.replace(tau_s=0.0, background_per_s=0.0)
    assert direct_rate(21.0, 0.1, (), p) == approx(2 * direct_rate(21.0, 0.05, (), p), rel=1e-12)


def test_direct_beam_rejects_voltage_above_the_tube_limit_and_negative_filters():
    with pytest.raises(ValueError):
        direct_rate(35.1, 1.0)
    with pytest.raises(ValueError):
        expected_rate([5.0], 35.0, 1.0, filters=(("Zr", -1.0),))


def test_small_angles_and_single_points_match_a_full_scan():
    # The continuum grid sits on a fixed lattice, so one β at a time equals a whole scan.
    beta = coupled_betas(-5.0, 10.0, 0.1)
    one_by_one = [expected_rate(np.array([b]), 35.0, 1.0)[0] for b in beta]
    assert one_by_one == approx(expected_rate(beta, 35.0, 1.0), rel=1e-12)


def test_voltage_and_current_outside_the_tube_range_are_rejected():
    # LD 554 800: U 0 … 35 kV, I 0 … 1 mA. Above 35 kV the model would extrapolate (and λ_min
    # would leave the μ/ρ table below 41 kV).
    for U_kV, I_mA in ((-1.0, 1.0), (35.0, -1.0), (35.1, 1.0), (35.0, 1.01), (np.nan, 1.0)):
        with pytest.raises(ValueError):
            expected_rate(LEAFLET_BETAS, U_kV, I_mA)


def test_angles_outside_sensor_arm_range_are_rejected():
    # LD 554 800: sensor arm −10° … +170°, so β = θ is limited to −5° … +85° when coupled.
    for beta in (86.0, -5.1, np.nan):
        with pytest.raises(ValueError):
            expected_rate(np.array([beta]), 35.0, 1.0)


def test_higher_orders_weaken_with_the_debye_waller_factor():
    r = list(DEFAULT.order_reflectivity.values())
    assert r[0] == 1.0 and np.all(np.diff(r) < 0)
    no_thermal = DEFAULT.replace(debye_waller_pm2=0.0).order_reflectivity
    assert all(r_n < no_thermal[n] for n, r_n in DEFAULT.order_reflectivity.items() if n > 1)


def test_fourth_order_ka_appears_beyond_the_leaflet_range():
    # 4 λ(Kα) = 2d sin θ → θ = 30.27°, outside the leaflet's 2°–25° scan but inside the arm range.
    theta = float(theta_from_lambda(MO_KA_PM, 4))
    assert theta == approx(30.27, abs=0.01)
    beta = np.arange(theta - 1.0, theta + 1.0, 0.01)
    rate = expected_rate(beta, 35.0, 1.0)
    assert beta[np.argmax(rate)] == approx(theta, abs=0.05)  # Kα₁/Kα₂ 0.20° apart at n = 4
    assert rate.max() > 3 * rate[0]


def test_leak_and_scatter_follow_the_photon_rate_leaving_the_tube():
    assert tube_factor(35.0, 1.0) == 1.0 and tube_factor(35.0, 0.5) == 0.5
    assert tube_factor(0.0, 1.0) == 0.0 and tube_factor(35.0, 0.0) == 0.0
    s = [tube_factor(U, 1.0) for U in np.arange(5.0, 35.01, 1.0)]
    assert np.all(np.diff(s) > 0)
    no_bragg = DEFAULT.replace(scale=0.0, tau_s=0.0, background_per_s=0.0)
    beta = np.array([1.0, 2.0, 3.0])
    assert expected_rate(beta, 20.0, 1.0, no_bragg) == approx(
        tube_factor(20.0, 1.0) * expected_rate(beta, 35.0, 1.0, no_bragg), rel=1e-12
    )


@pytest.mark.parametrize("beta", [2.0, 4.0, 6.43, 7.24, 12.0, 20.0, 30.0])
def test_rate_rises_with_voltage(beta):
    rate = [expected_rate(np.array([beta]), U, 1.0)[0] for U in np.arange(5.0, 35.01, 0.5)]
    assert np.all(np.diff(rate) >= 0)


def test_crystal_turned_half_a_turn_reflects_nothing():
    # The holder blocks the beam at β = θ + 180° (lab staff): only leak and scatter remain.
    ka = float(theta_from_lambda(MO_KA_PM))
    p = DEFAULT
    leak = p.leak_amp_per_s * np.exp(-0.5 * (2 * ka / p.leak_width_deg) ** 2)
    background = dead_time(
        p.background_per_s + tube_factor(35.0, 1.0) * (p.scatter_per_s + leak), p.tau_s
    )
    rate = expected_rate([ka + 180.0], 35.0, 1.0, sensor_deg=[2 * ka])[0]
    assert rate == approx(background, rel=1e-12)
    assert expected_rate([ka], 35.0, 1.0)[0] > 100 * rate


def test_rate_is_continuous_across_the_k_edge():
    # The lines switch on as (U/U_K − 1)^1.67, so there is no jump at U_K.
    for U in (MO_K_EDGE_KEV, MO_K_EDGE_KEV + 1e-6):
        assert expected_rate(LEAFLET_BETAS, U, 1.0) == approx(
            expected_rate(LEAFLET_BETAS, MO_K_EDGE_KEV - 1e-6, 1.0), rel=1e-5
        )


def test_coupled_scan_is_the_sensor_at_twice_the_target():
    beta = coupled_betas(-5.0, 30.0, 0.1)
    coupled = expected_rate(beta, 35.0, 1.0)
    assert np.array_equal(expected_rate(beta, 35.0, 1.0, sensor_deg=2 * beta), coupled)


def test_sensor_sweep_at_fixed_target_peaks_at_twice_the_bragg_angle():
    theta = float(theta_from_lambda(MO_KA_PM))
    sensor = np.arange(2 * theta - 1.0, 2 * theta + 1.0, 0.01)
    rate = expected_rate(np.full_like(sensor, theta), 35.0, 1.0, sensor_deg=sensor)
    assert sensor[np.argmax(rate)] == approx(2 * theta, abs=0.03)


def test_target_off_half_the_sensor_angle_follows_the_rocking_curve():
    # Same sensor angle, so the same reflected spectrum; the target 3σ off weakens it by e^−4.5.
    params = DEFAULT.replace(tau_s=0.0, leak_amp_per_s=0.0, scatter_per_s=0.0, background_per_s=0.0)
    sensor = np.array([10.0, 14.48, 30.0])
    on = expected_rate(sensor / 2, 35.0, 1.0, params, sensor_deg=sensor)
    off = expected_rate(sensor / 2 + 3 * params.sigma_deg, 35.0, 1.0, params, sensor_deg=sensor)
    assert off == approx(np.exp(-4.5) * on, rel=1e-12)


def test_leak_depends_on_the_sensor_angle_only():
    no_bragg = DEFAULT.replace(scale=0.0, background_per_s=0.0)
    sensor = np.full(4, 2.0)
    rate = expected_rate(np.array([1.0, 20.0, -90.0, 181.0]), 35.0, 1.0, no_bragg, sensor)
    assert np.all(rate == rate[0]) and rate[0] > 100


def test_target_arm_turns_without_limit():
    sensor = np.array([14.48])
    assert expected_rate(np.array([367.24]), 35.0, 1.0, sensor_deg=sensor) == approx(
        expected_rate(np.array([7.24]), 35.0, 1.0, sensor_deg=sensor), rel=1e-12
    )


@pytest.mark.parametrize("sensor", [[-10.5], [170.5], [np.nan], [10.0, 12.0]])
def test_sensor_outside_its_arm_range_or_mismatched_shape_is_rejected(sensor):
    with pytest.raises(ValueError):
        expected_rate(np.array([5.0]), 35.0, 1.0, sensor_deg=np.array(sensor))


# Fig. 4 regression. The digitized peaks sit a constant +0.090° above the Bragg angles, which
# the leaflet's own Table 3 does not show, so it is a figure offset: calibration-only, fitted in
# notebook 03, and never part of expected_rate (model/PARAMETERS.md).
FIG4_BETA_OFFSET_DEG = 0.090
FIG4_CSV = Path(__file__).resolve().parents[1] / "data" / "fig4_digitized.csv"


def _fig4_log_panel():
    with FIG4_CSV.open() as f:
        rows = [r for r in csv.DictReader(line for line in f if not line.startswith("#"))]
    b = np.array([float(r["beta_deg"]) for r in rows if r["panel"] == "log"])
    rate = np.array([float(r["rate_per_s"]) for r in rows if r["panel"] == "log"])
    return b, rate, expected_rate(b - FIG4_BETA_OFFSET_DEG, 35.0, 1.0)


def test_default_model_reproduces_fig4_log_panel():
    # Fit gives 0.054 dex; the two digitized panels agree to 0.012 dex, the digitization floor.
    b, data, model = _fig4_log_panel()
    assert np.sqrt(np.mean(np.log10(model / data) ** 2)) < 0.06


@pytest.mark.parametrize("n", [1, 2, 3])
@pytest.mark.parametrize("lam", [MO_KA_PM, MO_KB_PM])
def test_fig4_peak_heights_within_known_line_tip_deficit(n, lam):
    # Gaussian line tips come out 0.70–0.94 × Fig. 4 (PARAMETERS.md, Known deviations).
    b, data, model = _fig4_log_panel()
    near = np.abs(b - FIG4_BETA_OFFSET_DEG - theta_from_lambda(lam, n)) < 0.2
    assert 0.65 < model[near].max() / data[near].max() < 1.15


def test_direct_rate_falls_off_axis_and_rejects_bad_sensor():
    on, off = direct_rate(21.0, 0.05), direct_rate(21.0, 0.05, sensor_deg=3.0)
    assert off < on
    assert direct_rate(21.0, 0.05, sensor_deg=-3.0) == approx(off)
    with pytest.raises(ValueError):
        direct_rate(21.0, 0.05, sensor_deg=171.0)


def test_material_plate_needs_more_current_for_heavy_absorbers():
    # EPN P1 run 2a: 0.5 mm plates at 30 kV. Fe…Ag transmit < 1 %, so at 0.02 mA they sit near the
    # GM background floor; the guide's 1 mA lifts them well clear of it with negligible dead time,
    # while the light plates would paralyse the counter at 1 mA (PARAMETERS.md, material plate).
    bg = DEFAULT.background_per_s
    true = DEFAULT.replace(tau_s=0.0, background_per_s=0.0)
    rates = {
        m: [direct_rate(30.0, i, ((m, areal_density_mg_cm2(m, mm)),)) for i in (0.02, 1.0)]
        for m, mm in WHEELS_MM["material"][1:]
    }
    for m in ("Fe", "Cu", "Zr", "Ag"):
        low, high = rates[m]
        assert low < 100 * bg  # within two decades of the background floor
        assert high > 50 * bg  # Cu at 0.5 mm: 21/s, 100× the background
        r_true = direct_rate(30.0, 1.0, ((m, areal_density_mg_cm2(m, 0.5)),), true)
        assert r_true * DEFAULT.tau_s < 0.1  # dead time negligible at 1 mA
    for m in ("Polystyrene", "Al"):
        assert rates[m][0] > 1000 * bg
        r_true = direct_rate(30.0, 1.0, ((m, areal_density_mg_cm2(m, 0.5)),), true)
        assert r_true * DEFAULT.tau_s > 1  # would paralyse a real GM
    # Zr transmits more than Fe: Mo Kα sits just below the Zr K edge.
    assert rates["Zr"][1] > rates["Fe"][1]


@pytest.mark.parametrize("material, rho_x, U_kV", [("Ag", 20.0, 30.0), ("Zr", 32.0, 21.0)])
def test_tube_factor_integrates_through_a_filter_edge_without_ramping(material, rho_x, U_kV):
    # S(U) with a foil is the integral of continuum × T; the foil's absorption edge is a step, so
    # the trapezoid lattice is split there. Against a 400 000-point quadrature (2026-10-21) it
    # agrees to 1e-4; on the bare grid the Ag plate was +1.06 % and the Zr foil at 21 kV −0.27 %.
    from braggsim.scan import _photons_out, _transmission
    from braggsim.source import continuum

    params = DEFAULT.replace(line_to_cont=0.0)  # continuum only: the lines are single points
    filters = ((material, rho_x),)
    lam = np.linspace(30.0, 600.0, 400_001)
    dense = np.trapezoid(continuum(lam, U_kV, 1.0) * _transmission(lam, params, filters), lam)
    assert _photons_out(U_kV, params, filters) == approx(dense, rel=1e-4)


# ── Collimator and counter distances s1, s2 ──────────────────────────────────────────────────────
from braggsim import scan as _scan  # noqa: E402

GEOMETRIES_CM = [(2, 2), (5, 2), (5, 12), (3, 6), (8, 6), (12, 12), (5.3, 6.4)]
KA_THETA_DEG = float(theta_from_lambda(MO_KA_PM, 1, 282.01))


def _ka_peak(s1_cm, s2_cm):
    beta = np.linspace(KA_THETA_DEG - 1, KA_THETA_DEG + 1, 801)
    return expected_rate(beta, 35.0, 1.0, s1_cm=s1_cm, s2_cm=s2_cm).max()


def test_resolution_equals_the_fitted_sigma_at_the_leaflet_geometry():
    assert _scan.angular_sigma_deg(5.0, 6.0) == DEFAULT.sigma_deg
    assert _scan.angular_sigma_deg(5.0, 6.0, DEFAULT.replace(sigma_deg=0.3)) == 0.3


def test_default_geometry_leaves_every_rate_unchanged():
    ref = expected_rate(LEAFLET_BETAS, 35.0, 1.0)
    assert np.array_equal(expected_rate(LEAFLET_BETAS, 35.0, 1.0, s1_cm=5.0, s2_cm=6.0), ref)
    assert direct_rate(21.0, 0.05, s1_cm=5.0, s2_cm=5.0) == direct_rate(21.0, 0.05)


def test_resolution_improves_with_either_distance_and_stays_above_the_residual():
    s = [_scan.angular_sigma_deg(5, s2) for s2 in (2, 4, 6, 9, 12)]
    assert all(a > b for a, b in zip(s, s[1:], strict=False))
    s = [_scan.angular_sigma_deg(s1, 6) for s1 in (2, 3, 5, 8, 12)]
    assert all(a > b for a, b in zip(s, s[1:], strict=False))
    # infinite distances leave only the residual (mosaic, focal spot): finite and positive
    floor = _scan.angular_sigma_deg(1e9, 1e9)
    assert 0 < floor < _scan.angular_sigma_deg(12, 12)


def test_resolution_adds_the_two_slits_in_quadrature():
    # σ² differences between geometries are exactly the slit terms, whatever the residual
    def sq(s1, s2):
        return _scan.angular_sigma_deg(s1, s2) ** 2

    assert sq(5, 3) - sq(5, 6) == approx(sq(9, 3) - sq(9, 6), rel=1e-9)  # independent of s1
    # divergence ∝ 1/s: halving the distance quadruples a slit's variance
    w = _scan.COUNTER_SLIT_WIDTH_MM
    assert _scan._slit_sigma_sq_deg2(w, 3.0) == approx(4 * _scan._slit_sigma_sq_deg2(w, 6.0))


def test_resolution_in_the_assembly_range_is_a_sensible_instrument():
    # s2 = 2 cm is clearly broader than the fit (Kα/Kβ, 0.8° apart in 1st order, begin to merge),
    # s2 = 12 cm sharper but never below the residual.
    broad = _scan.angular_sigma_deg(5, 2)
    sharp = _scan.angular_sigma_deg(5, 12)
    assert 2 * DEFAULT.sigma_deg < broad < 0.4
    assert 0.07 < sharp < DEFAULT.sigma_deg


def test_counter_closer_gives_taller_peaks_and_farther_lower():
    peaks = [_ka_peak(5, s2) for s2 in (2, 4, 6, 9, 12)]
    assert all(a > b for a, b in zip(peaks, peaks[1:], strict=False))
    assert _ka_peak(3, 6) < _ka_peak(5, 6) < _ka_peak(8, 6)  # larger s1: sharper, taller


def test_bragg_signal_area_scales_with_the_overfilled_slit_height():
    # Integrated Kα counts above the floor follow s2_ref/s2 (out-of-plane overfill of the slit
    # height; in-plane the area is conserved and σ only redistributes it). No dead time.
    beta = np.linspace(KA_THETA_DEG - 2, KA_THETA_DEG + 2, 4001)
    p = DEFAULT.replace(tau_s=1e-12)

    def area(s2):
        r = expected_rate(beta, 35.0, 0.01, p, s1_cm=5.0, s2_cm=s2)
        floor = min(r[0], r[-1])
        return np.trapezoid(r - floor, beta)

    assert area(12.0) / area(6.0) == approx(0.5, rel=0.02)
    assert area(3.0) / area(6.0) == approx(2.0, rel=0.02)


def test_background_does_not_depend_on_the_geometry():
    ref = expected_rate([5.0], 0.0, 0.0)[0]
    for s1, s2 in GEOMETRIES_CM:
        assert expected_rate([5.0], 0.0, 0.0, s1_cm=s1, s2_cm=s2)[0] == ref


def test_direct_beam_anchor_is_exact_at_its_reference_and_follows_the_inverse_square():
    ref = direct_rate(21.0, 0.05)
    assert ref >= 950.0  # EPN Práctica 1
    assert direct_rate(21.0, 0.05, s1_cm=5.0, s2_cm=5.0) == ref
    p = DEFAULT.replace(tau_s=1e-12, background_per_s=0.0)
    far = direct_rate(21.0, 0.05, (), p, s1_cm=9.0, s2_cm=9.0)
    near = direct_rate(21.0, 0.05, (), p, s1_cm=5.0, s2_cm=5.0)
    assert far / near == approx(((7 + 10) / (7 + 18)) ** 2, rel=1e-9)
    assert direct_rate(21.0, 0.05, s1_cm=2.0, s2_cm=2.0) > ref


@pytest.mark.parametrize("s1_cm, s2_cm", [(0, 6), (5, -1), (float("nan"), 6), (5, float("inf"))])
def test_nonsense_geometry_is_rejected(s1_cm, s2_cm):
    with pytest.raises(ValueError):
        expected_rate([5.0], 35.0, 1.0, s1_cm=s1_cm, s2_cm=s2_cm)
    with pytest.raises(ValueError):
        direct_rate(21.0, 0.05, s1_cm=s1_cm, s2_cm=s2_cm)


def test_geometry_is_independent_of_which_betas_are_queried_together():
    # the convolution grid depends on σ: R̄ at one β must not depend on its neighbours
    grid = np.linspace(5, 9, 41)
    one = expected_rate([7.2], 35.0, 1.0, s1_cm=4.0, s2_cm=3.0)[0]
    many = expected_rate(grid, 35.0, 1.0, s1_cm=4.0, s2_cm=3.0)
    assert one == approx(many[np.argmin(abs(grid - 7.2))], rel=1e-9)
