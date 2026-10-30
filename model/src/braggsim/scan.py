"""Coupled 2:1 scan: the expected counting rate R̄(β) the GM counter sees (no noise).

In COUPLED mode the target (crystal) sits at β = θ and the sensor arm at 2θ (LD 554 800).
SENSOR and TARGET scans pass the sensor angle separately (``expected_rate(..., sensor_deg)``).
R̄(β) = dead_time( scale · Σ_n r_n [continuum_n + lines_n](β) + leak(β) + scatter ):
- r_n: strength of order n from the NaCl structure factor and one Debye–Waller factor;
- continuum_n: Kramers spectrum at λ_n(θ), times absorber transmission, the Jacobian
  dλ/dθ and the Lorentz-polarization factor, convolved with the instrument Gaussian σ;
- lines_n: Mo Kα1,2 / Kβ1,3 / Kβ2 δ-lines, same factors, as Gaussians at their Bragg angles;
- leak: tail of the direct beam reaching the counter at small 2θ;
- scatter: flat scattered radiation (air, crystal, housing).
Leak and scatter both follow the tube as I·S(U), the photon rate leaving it (``tube_factor``);
Fig. 4 (35 kV only) cannot test that. The GM natural background is added to the true rate
before the dead time and does not depend on the tube: with the tube off R̄ = dead_time(background).
``filters`` (absorber wheel, Moseley foils: tuples ``(material, areal_density_mg_cm2)``) attenuate
the Bragg signal exactly, and leak and scatter through the filtered ``tube_factor``.
``direct_rate`` is the attenuation practice: no crystal, the counter in the direct beam.
Every fitted value in ``DEFAULT`` is documented in model/PARAMETERS.md.
"""

import dataclasses
import math

import numpy as np

from braggsim.constants import MO_KA_COMPONENTS, MO_KB_COMPONENTS
from braggsim.crystal import (
    NACL,
    NACL_THERMAL_B_PM2,
    cell_scale,
    d_pm,
    dlambda_dtheta_pm_per_deg,
    extinction_ratio,
    lambda_from_theta,
    lorentz_polarization,
    mu_factor,
    structure_factor_sq_rel_crystal,
    theta_from_lambda,
)
from braggsim.detector import dead_time
from braggsim.filters import MU_RHO_GRID_PM, check_filters, mu_rho_edges_pm, transmission
from braggsim.source import continuum, lambda_min_pm, line_rates

# Air between anode and counter: path length is an assumption (≈ 12 cm anode → crystal plus
# s2 ≈ 6 cm), not fitted. Air density 1.205 mg/cm³ at 20 °C, 1 atm.
AIR = "Air, Dry (near sea level)"
AIR_PATH_CM = 18.0
AIR_MG_CM2 = 1.205 * AIR_PATH_CM

# Effective absorber standing in for the glass tube wall and anode self-absorption (thickness
# fitted). Borosilicate glass fits Fig. 4 as well as SiO2 or Al and better than Be or Mo.
ABSORBER = "Glass, Pyrex"
U_REF_KV = 35.0  # voltage at which leak_amp_per_s and scatter_per_s are quoted

# Goniometer geometry (model/PARAMETERS.md, "Apparatus assumptions"). s1: collimator slit → crystal,
# s2: crystal → counter slit, in cm. The fitted σ, leak, scatter and scale hold at the leaflet's
# s1 ≈ 5 cm, s2 ≈ 6 cm; the direct-beam anchor (EPN Práctica 1) at s1 = s2 = 5 cm.
REF_S1_CM, REF_S2_CM = 5.0, 6.0
DIRECT_REF_S1_CM, DIRECT_REF_S2_CM = 5.0, 5.0
# Effective slit widths (assumptions, neither measured nor fitted): the collimator exit slit and
# the counter entrance slit as seen by the Bragg angle. A uniform slit of width w at distance s
# smears the angle with rms w/(s√12).
COLLIMATOR_WIDTH_MM = 0.2
COUNTER_SLIT_WIDTH_MM = 0.3
# Tube focus → collimator slit (assumption): 12 cm anode → crystal (``AIR_PATH_CM``) less s1 = 5.
SOURCE_TO_COLLIMATOR_CM = 7.0

# Sensor arm range −10° … +170° (LD 554 800) → coupled target angle β = θ in −5° … +85°.
# The target arm turns without limit.
SENSOR_MIN_DEG, SENSOR_MAX_DEG = -10.0, 170.0
BETA_MIN_DEG, BETA_MAX_DEG = SENSOR_MIN_DEG / 2, SENSOR_MAX_DEG / 2
U_MAX_KV, I_MAX_MA = 35.0, 1.0  # LD 554 800 tube limits


def max_order(crystal=NACL, U_kV=U_MAX_KV):
    """Highest order that reaches the counter: n λ_min(U) ≤ 2d sin 85° (15 for NaCl at 35 kV)."""
    return max(
        int(2 * d_pm(crystal) * math.sin(math.radians(BETA_MAX_DEG)) / lambda_min_pm(U_kV)), 1
    )


MAX_ORDER = max_order(NACL)  # NaCl at 35 kV: the orders tabulated in artifacts/
# The 554 800 tops out at 3600 steps (0.1° over 360°); far above that is a units mistake.
MAX_SCAN_STEPS = 100_000
THETA_STEP_DEG = 0.01  # internal grid for the continuum convolution
KERNEL_HALF_WIDTH_SIGMA = 6


@dataclasses.dataclass(frozen=True)
class ModelParams:
    scale: float  # counts/s per relative source unit
    line_to_cont: float  # Kα line strength relative to the continuum (1/pm)
    debye_waller_pm2: float  # effective B of exp(−2B s²), weakening the higher orders
    sigma_deg: float  # Gaussian angular resolution at s1 = 5 cm, s2 = 6 cm (``angular_sigma_deg``)
    tau_s: float  # GM dead time
    leak_amp_per_s: float  # direct-beam halo at 2θ = 0, at 35 kV and 1 mA (extrapolated)
    leak_width_deg: float  # its Gaussian width in 2θ
    absorber_mg_cm2: float  # effective absorber areal density
    scatter_per_s: float = 0.0  # flat scattered radiation at 35 kV and 1 mA
    background_per_s: float = 0.0  # GM natural background, true rate, independent of the tube
    direct_per_s: float = 0.0  # direct beam at 35 kV, 1 mA, no absorber, sensor at 0°, no crystal

    def __post_init__(self):
        values = dataclasses.asdict(self)
        if not all(math.isfinite(v) and v >= 0 for v in values.values()):
            raise ValueError(f"model parameters must be finite and ≥ 0: {values}")
        if self.sigma_deg == 0 or self.leak_width_deg == 0:
            raise ValueError("sigma_deg and leak_width_deg must be > 0")

    def replace(self, **changes):
        return dataclasses.replace(self, **changes)

    @property
    def order_reflectivity(self):
        """``order_strengths(NACL)``: {n: r_n} relative to NaCl order 1."""
        return self.order_strengths(NACL)

    def order_strengths(self, crystal=NACL):
        """{n: r_n} of ``crystal``, relative to NaCl order 1, up to ``max_order(crystal)``:
        r_n = k · |F_n|²/|F_1|² · exp(−2B (s_n² − s_1²)), s_n = n/(2d) in pm⁻¹ (Debye–Waller
        factor, Warren ch. 3), k = ``cell_scale`` · exp(+2 B_NaCl,th s_1,NaCl²) (1 for NaCl).
        B is the fitted ``debye_waller_pm2`` for the NaCl anchor (``fitted_debye_waller``), 0 for
        the others, whose literature B is already inside F. B_NaCl,th (``NACL_THERMAL_B_PM2``,
        1.3 Å² = 13 000 pm²) is NaCl's room-temperature B, the same one the NaCl reference
        extinction y_NaCl,1 is computed with. The λ-dependent parts of the cross-crystal scale are
        ``crystal.mu_factor`` and ``crystal.extinction_ratio`` y_X,n(λ)/y_NaCl,1(λ) (applied per λ
        in the scan). Orders with n λ > 2d are skipped later."""
        d = d_pm(crystal)
        s1_sq = (1 / (2 * d)) ** 2
        b = self.debye_waller_pm2 if crystal.fitted_debye_waller else 0.0
        k = cell_scale(crystal)
        if not crystal.fitted_debye_waller:
            # The other crystals' thermal |F|² is divided by NaCl's at-rest |F|², but NaCl's scale
            # is its thermal one: put exp(+2 B_NaCl,th s_1²) back, with NaCl's physical B (not the
            # effective B_fit, which absorbs more than the thermal motion), in pm².
            k *= math.exp(2 * NACL_THERMAL_B_PM2 / (2 * d_pm(NACL)) ** 2)
        return {
            n: k * f * math.exp(-2 * b * (n * n - 1) * s1_sq)
            for n, f in enumerate(
                structure_factor_sq_rel_crystal(crystal, max_order(crystal)), start=1
            )
        }


# Fitted to leaflet Fig. 4 on 2026-09-25 (notebooks/03_full_spectrum_vs_fig4.ipynb); tau_s fixed.
# 2026-10-14: the fitted floor 5.54/s is split into scatter 5.34 + background 0.2 (bookkeeping, no
# refit); direct_per_s is anchored to EPN Práctica 1 (model/PARAMETERS.md).
DIRECT_ANCHOR_U_KV, DIRECT_ANCHOR_I_MA = 21.0, 0.05  # the guide's direct-beam reading
DIRECT_ANCHOR_PER_S = 950.0  # observed counts/s there: the guide's pass threshold
DEFAULT = ModelParams(
    scale=1.676e5,
    line_to_cont=7.43e-3,
    debye_waller_pm2=6.26e3,
    sigma_deg=0.1228,
    tau_s=1.0e-4,
    leak_amp_per_s=1.18e5,
    leak_width_deg=1.161,
    absorber_mg_cm2=326.0,
    scatter_per_s=5.34,
    background_per_s=0.2,
    direct_per_s=2.97e5,
)


def coupled_betas(lo_deg, hi_deg, step_deg):
    """Target angles β of a coupled scan from ``lo_deg`` in steps of ``step_deg`` up to at most
    ``hi_deg`` (degrees). ``np.round`` trims float noise; it rounds ties to even."""
    if not (math.isfinite(lo_deg) and math.isfinite(hi_deg) and step_deg > 0 and hi_deg >= lo_deg):
        raise ValueError("a scan needs Δβ > 0 and upper limit ≥ lower limit (LD 554 800)")
    n = int(np.floor((hi_deg - lo_deg) / step_deg + 1e-9)) + 1  # 1e-9: 0.3/0.1 = 2.9999…
    if n > MAX_SCAN_STEPS:
        raise ValueError(f"{n} steps: a scan has at most {MAX_SCAN_STEPS}")
    # np.minimum: the 1e-9 slack must never put the last β past the limit.
    return np.minimum(np.round(lo_deg + step_deg * np.arange(n), 10), hi_deg)


def _check_geometry(s1_cm, s2_cm):
    if not (math.isfinite(s1_cm) and math.isfinite(s2_cm) and s1_cm > 0 and s2_cm > 0):
        raise ValueError("s1_cm and s2_cm must be finite and > 0")


def _slit_sigma_sq_deg2(width_mm, distance_cm):
    """Variance in deg² of a uniform slit of ``width_mm`` seen from ``distance_cm``: (w/(s√12))²."""
    return math.degrees(width_mm / (10 * distance_cm) / math.sqrt(12)) ** 2


def angular_sigma_deg(s1_cm=REF_S1_CM, s2_cm=REF_S2_CM, params=DEFAULT):
    """Gaussian angular resolution σ in degrees at collimator distance ``s1_cm`` and counter
    distance ``s2_cm``: σ² = σ_col²(s1) + σ_slit²(s2) + σ_res², with the beam divergence
    σ_col = w_col/(s1 √12) and the counter acceptance σ_slit = w_slit/(s2 √12) (uniform slits,
    ``COLLIMATOR_WIDTH_MM``, ``COUNTER_SLIT_WIDTH_MM``). The residual σ_res (crystal mosaic,
    focal spot, Kα doublet remainder) is fixed by σ(REF_S1_CM, REF_S2_CM) = ``params.sigma_deg``,
    so there is no new free parameter. Leaflet P6.3.3.1: smaller s2 means worse resolution."""
    _check_geometry(s1_cm, s2_cm)
    if s1_cm == REF_S1_CM and s2_cm == REF_S2_CM:
        return params.sigma_deg
    ref = _slit_sigma_sq_deg2(COLLIMATOR_WIDTH_MM, REF_S1_CM) + _slit_sigma_sq_deg2(
        COUNTER_SLIT_WIDTH_MM, REF_S2_CM
    )
    res_sq = params.sigma_deg**2 - ref
    if res_sq < 0:
        raise ValueError("sigma_deg is below the geometric resolution at the reference slits")
    return math.sqrt(
        res_sq
        + _slit_sigma_sq_deg2(COLLIMATOR_WIDTH_MM, s1_cm)
        + _slit_sigma_sq_deg2(COUNTER_SLIT_WIDTH_MM, s2_cm)
    )


def direct_beam_factor(s1_cm, s2_cm, ref_s1_cm=REF_S1_CM, ref_s2_cm=REF_S2_CM):
    """Direct-beam intensity at the counter relative to the reference geometry, 1 there: the
    inverse square of the path from the tube focus, (r_ref/r)², r = SOURCE_TO_COLLIMATOR_CM + s1
    + s2. The collimator takes a fixed solid angle from the tube, and the counter slit (fixed
    area) collects the diverging beam as from a point source at the tube. Applies to the leak
    halo (the counter in the beam past the crystal) and ``direct_rate`` (own reference
    ``DIRECT_REF_*``, EPN Práctica 1)."""
    _check_geometry(s1_cm, s2_cm)
    r = SOURCE_TO_COLLIMATOR_CM + s1_cm + s2_cm
    return ((SOURCE_TO_COLLIMATOR_CM + ref_s1_cm + ref_s2_cm) / r) ** 2


def crystal_factor(s2_cm, ref_s2_cm=REF_S2_CM):
    """Intensity of what the crystal sends out (Bragg signal and scattered radiation) relative to
    the reference, s2_ref/s2. In the scattering plane the counter slit's acceptance w/s2 is already
    the σ_slit of the normalised kernel: every reflected photon passes the slit at some β, so the
    integrated area is conserved and only the peak height (∝ 1/σ) changes. The loss is out of the
    plane: the diffracted beam's vertical extent grows with s2 and overfills the slit height, so
    the captured fraction goes as 1/s2 (assumption, not fitted). Leaflet P6.3.3.1: smaller s2,
    more counts (a taller peak) and worse resolution."""
    _check_geometry(REF_S1_CM, s2_cm)
    return ref_s2_cm / s2_cm


def _transmission(lambda_pm, params, filters=()):
    t = transmission(lambda_pm, AIR, AIR_MG_CM2) * transmission(
        lambda_pm, ABSORBER, params.absorber_mg_cm2
    )
    for material, areal_density_mg_cm2 in filters:
        t = t * transmission(lambda_pm, material, areal_density_mg_cm2)
    return t


def _gaussian(x_deg, sigma_deg):
    return np.exp(-0.5 * (x_deg / sigma_deg) ** 2) / (sigma_deg * np.sqrt(2 * np.pi))


def _continuum_density(beta_deg, U_kV, I_mA, params, filters=(), crystal=NACL):
    """Σ_n r_n × continuum per degree of θ, convolved with the instrument Gaussian, at β."""
    # Grid on the fixed lattice θ = i·step, so R̄(β) does not depend on which βs are queried
    # together; at least one kernel long, because "same" mode assumes that.
    # ceil, not round: no tie-breaking rule (half-even vs half-up) for a port to get wrong.
    half = math.ceil(KERNEL_HALF_WIDTH_SIGMA * params.sigma_deg / THETA_STEP_DEG)
    i_lo = max(int(np.floor(beta_deg.min() / THETA_STEP_DEG)) - half, 1)
    i_hi = max(int(np.ceil(beta_deg.max() / THETA_STEP_DEG)) + half, i_lo + 2 * half)
    theta = THETA_STEP_DEG * np.arange(i_lo, i_hi + 1)
    density = np.zeros_like(theta)
    d = d_pm(crystal)
    for n, r_n in params.order_strengths(crystal).items():
        lam = lambda_from_theta(theta, n, d)
        spec = continuum(lam, U_kV, I_mA)
        on = spec > 0
        if on.any():
            term = (
                r_n * spec[on] * _transmission(lam[on], params, filters)
                * dlambda_dtheta_pm_per_deg(theta[on], n, d) * lorentz_polarization(theta[on])
            )  # fmt: skip
            if crystal is not NACL:
                term = term * mu_factor(crystal, lam[on]) * extinction_ratio(crystal, n, lam[on])
            density[on] += term
    k = THETA_STEP_DEG * np.arange(-half, half + 1)
    kernel = _gaussian(k, params.sigma_deg)
    smoothed = np.convolve(density, kernel / kernel.sum(), mode="same")
    return np.interp(beta_deg, theta, smoothed)


def _line_density(beta_deg, U_kV, I_mA, params, filters=(), crystal=NACL):
    """Σ_n r_n × Mo K line components as Gaussians at their Bragg angles, at β."""
    ka, kb = line_rates(U_kV, I_mA, params.line_to_cont)
    lines = [(lam, ka * f) for lam, f in MO_KA_COMPONENTS] + [
        (lam, kb * f) for lam, f in MO_KB_COMPONENTS
    ]
    out = np.zeros_like(beta_deg)
    d = d_pm(crystal)
    for n, r_n in params.order_strengths(crystal).items():
        for lam, rate in lines:
            theta = theta_from_lambda(lam, n, d)
            if rate == 0 or np.isnan(theta):
                continue
            weight = r_n * rate * _transmission(lam, params, filters) * lorentz_polarization(theta)
            if crystal is not NACL:
                weight = weight * float(mu_factor(crystal, lam) * extinction_ratio(crystal, n, lam))
            out += weight * _gaussian(beta_deg - theta, params.sigma_deg)
    return out


def _photons_out(U_kV, params, filters=()):
    """Kramers continuum plus Mo K lines leaving the tube through the absorber, per mA."""
    lam = MU_RHO_GRID_PM
    edges = sorted({e for material, d in filters if d > 0 for e in mu_rho_edges_pm(material)})
    if edges:  # both sides of each filter edge, so the trapezoid rule does not ramp across the step
        lam = np.unique(np.concatenate([lam, edges, np.nextafter(edges, 0.0)]))
    total = np.trapezoid(continuum(lam, U_kV, 1.0) * _transmission(lam, params, filters), lam)
    ka, kb = line_rates(U_kV, 1.0, params.line_to_cont)
    for rate, components in ((ka, MO_KA_COMPONENTS), (kb, MO_KB_COMPONENTS)):
        for lam_pm, fraction in components:
            total += rate * fraction * float(_transmission(lam_pm, params, filters))
    return total


def tube_factor(U_kV, I_mA, params=DEFAULT, filters=()):
    """I · S(U): how leak and scatter follow the tube, 1 at 35 kV and 1 mA.

    S(U) is the photon rate leaving the tube through the absorber, Kramers continuum
    (trapezoid rule on the fixed μ/ρ grid, split at the absorption edges of the ``filters``)
    plus Mo K lines, relative to 35 kV. No free parameter; only its 35 kV value is tested by
    Fig. 4 (model/PARAMETERS.md). ``filters`` are added to the photon rate leaving the tube; the
    35 kV reference stays unfiltered, so a filter gives a factor below 1 even at 35 kV and 1 mA.
    """
    if I_mA == 0 or U_kV == 0:
        return 0.0
    return I_mA * float(_photons_out(U_kV, params, filters) / _photons_out(U_REF_KV, params, ()))


def _check_tube(U_kV, I_mA):
    if not (0 <= U_kV <= U_MAX_KV and 0 <= I_mA <= I_MAX_MA):  # NaN fails too
        raise ValueError(f"U_kV must be in 0 … {U_MAX_KV}, I_mA in 0 … {I_MAX_MA} (LD 554 800)")


def expected_rate(
    beta_deg, U_kV, I_mA, params=DEFAULT, sensor_deg=None, filters=(), crystal=NACL,
    s1_cm=REF_S1_CM, s2_cm=REF_S2_CM,
):  # fmt: skip
    """Expected observed counting rate R̄ in counts/s (deterministic).

    ``beta_deg``: target (crystal) angles; ``U_kV``: tube voltage; ``I_mA``: emission current.
    ``sensor_deg``: sensor arm angles, same shape as β; ``None`` is the 2:1 coupled scan
    (sensor at 2β). Negative angles reflect off the other crystal face.

    A photon reaching the sensor at angle S left the lattice planes at incidence S/2, so the
    reflected spectrum is that of θ = |S|/2 whatever the target angle. A target off S/2 by
    ε = S/2 − β only weakens it, by exp(−½ (ε/σ)²): the rocking curve, given the same width σ
    as the coupled line profile (no new parameter; model/PARAMETERS.md). The direct-beam leak
    depends on the sensor alone and scatter on neither. The rocking weight is centred on S/2
    only, so a crystal turned half a turn (β = S/2 + 180°) reflects nothing: its holder blocks
    the beam (confirmed by the lab staff, 2026-09-25).

    ``filters``: absorbers in the beam, ``(material, areal_density_mg_cm2)`` each. They attenuate
    the Bragg signal exactly; leak and scatter follow the filtered ``tube_factor`` (exact for the
    direct-beam halo, an assumption for scatter). The natural background is added before the
    dead time and ignores the tube and the filters.

    ``crystal``: a ``crystal.Crystal`` (default NaCl, the calibrated anchor). Others scale the
    reflected signal by the kinematic mosaic-crystal ratio to NaCl (``ModelParams.order_strengths``,
    ``crystal.mu_factor``) times the extinction ratio y_X,n(λ)/y_NaCl,1(λ)
    (``crystal.extinction_ratio``:
    Darwin–Prins for the near-perfect crystals, secondary extinction for LiF); leak, scatter and
    background do not depend on the crystal.

    ``s1_cm``, ``s2_cm``: collimator and counter distances (``REF_S1_CM``, ``REF_S2_CM`` at the
    fit). They set σ (``angular_sigma_deg``, replacing ``params.sigma_deg``, also in the rocking
    curve), the Bragg signal and the scatter (``crystal_factor``) and the leak halo
    (``direct_beam_factor``); the natural background is independent. Defaults leave R̄ unchanged.
    """
    _check_geometry(s1_cm, s2_cm)
    sigma_deg = angular_sigma_deg(s1_cm, s2_cm, params)
    if sigma_deg != params.sigma_deg:
        params = params.replace(sigma_deg=sigma_deg)
    gain = crystal_factor(s2_cm)
    halo = direct_beam_factor(s1_cm, s2_cm)
    beta = np.asarray(beta_deg, dtype=float)
    if sensor_deg is None:
        if not np.all((beta >= BETA_MIN_DEG) & (beta <= BETA_MAX_DEG)):  # NaN fails too
            raise ValueError(f"β outside the coupled range {BETA_MIN_DEG}° … {BETA_MAX_DEG}°")
        sensor = 2 * beta
    else:
        sensor = np.asarray(sensor_deg, dtype=float)
        if sensor.shape != beta.shape or not np.all(np.isfinite(beta)):
            raise ValueError("target and sensor angles must be finite arrays of the same shape")
        if not np.all((sensor >= SENSOR_MIN_DEG) & (sensor <= SENSOR_MAX_DEG)):
            raise ValueError(f"sensor outside its range {SENSOR_MIN_DEG}° … {SENSOR_MAX_DEG}°")
        beta = (beta + 180) % 360 - 180  # the target arm turns without limit
    _check_tube(U_kV, I_mA)
    check_filters(filters)
    if beta.size == 0:
        return beta
    theta = np.abs(sensor) / 2
    true_rate = params.background_per_s + tube_factor(U_kV, I_mA, params, filters) * (
        params.scatter_per_s * gain
        + halo * params.leak_amp_per_s * np.exp(-0.5 * (sensor / params.leak_width_deg) ** 2)
    )
    if I_mA > 0 and U_kV > 0:
        rocking = np.exp(-0.5 * ((sensor / 2 - beta) / params.sigma_deg) ** 2)
        true_rate = true_rate + gain * params.scale * rocking * (
            _continuum_density(theta, U_kV, I_mA, params, filters, crystal)
            + _line_density(theta, U_kV, I_mA, params, filters, crystal)
        )
    return dead_time(true_rate, params.tau_s)


def direct_rate(
    U_kV, I_mA, filters=(), params=DEFAULT, sensor_deg=0.0,
    s1_cm=DIRECT_REF_S1_CM, s2_cm=DIRECT_REF_S2_CM,
):  # fmt: skip
    """Observed counting rate in counts/s with the counter in the direct beam: no crystal, sensor
    at ``sensor_deg``. EPN Práctica 1 (attenuation; collimator, s1 = s2 = 5 cm, GM counter).

    ``direct_per_s`` is anchored to the guide's ≥ 950/s at 21 kV and 0.05 mA, and the tube
    dependence is ``tube_factor``. The absorber wheel and the Moseley foils are both just entries
    in ``filters``, ``(material, areal_density_mg_cm2)`` each. Without the crystal the counter sees
    the angular profile of the direct beam, a Gaussian in the sensor angle; its width is assumed
    equal to the fitted leak halo ``leak_width_deg`` (an assumption, no measurement).

    ``s1_cm``, ``s2_cm``: collimator and counter distances; the rate follows ``direct_beam_factor``
    relative to the anchor's own s1 = s2 = 5 cm, so the anchor stays exact there.
    """
    _check_geometry(s1_cm, s2_cm)
    if not (math.isfinite(sensor_deg) and SENSOR_MIN_DEG <= sensor_deg <= SENSOR_MAX_DEG):
        raise ValueError(f"sensor outside its range {SENSOR_MIN_DEG}° … {SENSOR_MAX_DEG}°")
    _check_tube(U_kV, I_mA)
    check_filters(filters)
    profile = math.exp(-0.5 * (sensor_deg / params.leak_width_deg) ** 2)
    true_rate = (
        params.direct_per_s
        * direct_beam_factor(s1_cm, s2_cm, DIRECT_REF_S1_CM, DIRECT_REF_S2_CM)
        * tube_factor(U_kV, I_mA, params, filters)
        * profile
        + params.background_per_s
    )
    return float(dead_time(true_rate, params.tau_s))
