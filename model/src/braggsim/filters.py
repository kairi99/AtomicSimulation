"""Transmission of X-rays through absorbers (air, windows, filters) via xraylib.

Mass attenuation coefficients: xraylib ``CS_Total_CP`` (Schoonjans et al., Spectrochim.
Acta B 66, 776 (2011)); ``material`` is a chemical formula ("Zr", "Be") or an xraylib NIST
compound name ("Air, Dry (near sea level)").
"""

import functools
import math

import numpy as np
import xraylib

from braggsim.constants import HC_KEV_PM

# Absorbers (xraylib names): the union of the LD foil set 554 832 and the absorption accessory
# 554 834 (Al wheel, material wheel). "Polystyrene" is the NIST compound for the LD "C" absorber.
ABSORBERS = ("Polystyrene", "Al", "Fe", "Cu", "Zr", "Mo", "Ag", "In")

# LD foil set 554 832, thickness in mm (LD catalog).
FOILS_MM = {"Zr": 0.05, "Mo": 0.1, "Ag": 0.05, "In": 0.3, "Al": 0.5, "Fe": 0.5, "Cu": 0.07}

# The two plates of the absorption accessory 554 834: 7 slots at target angles 0°, 10° … 60°
# ((material, thickness_mm) or None = open). The material plate's 0.5 mm is the LD catalog and
# LD P6.3.2.1 value (user decision 2026-10-29, superseding 0.4 mm); the slot order
# (open at 0°, then polystyrene "C", Al, Fe, Cu, Zr, Ag) comes from LD P6.3.2.1 (open question 10).
WHEELS_MM = {
    "al": (None, *(("Al", 0.5 * k) for k in range(1, 7))),
    "material": (None, *((m, 0.5) for m in ("Polystyrene", "Al", "Fe", "Cu", "Zr", "Ag"))),
}

# μ/ρ is tabulated on this fixed grid and interpolated log–log, so the web app can load the very
# same numbers (artifacts/tables/mu_rho.json) and match Python to 1e-9. It spans λ_min at 35 kV
# (35.4 pm) to 1st order at the arm limit θ = 85° (562 pm); beyond it the end values are held.
# Away from absorption edges the table is within 3e-6 of xraylib. Linear interpolation across a
# grid interval that holds an edge would smear it over one step (0.3 %, up to +0.1 pm on the Zr/Mo
# mid-transmission point), so ``transmission`` makes the edges sharp (see below) without touching
# the grid. The edge wavelengths of each material are exported with the tables.
MU_RHO_GRID_PM = np.round(np.geomspace(30.0, 600.0, 1000), 9)  # round: same nodes on every CPU


@functools.cache
def mu_rho_table(material):
    """Mass attenuation coefficient μ/ρ of ``material`` in cm²/g on ``MU_RHO_GRID_PM``."""
    table = np.array([xraylib.CS_Total_CP(material, HC_KEV_PM / x) for x in MU_RHO_GRID_PM])
    table.flags.writeable = False
    return table


_EDGE_SHELLS = (xraylib.K_SHELL, xraylib.L1_SHELL, xraylib.L2_SHELL, xraylib.L3_SHELL)
_LOG_GRID = np.log(MU_RHO_GRID_PM)
_EDGE_WINDOW = 5e-3  # relative energy window around EdgeEnergy that is searched for the CS step


def _cs_step_kev(cs_total, e_kev):
    """Energy (keV) of the step of ``cs_total(E)`` within ±0.5 % of ``e_kev``, by bisection,
    or None if it has no step there (jump below 2 %). The step of xraylib's tabulated cross section
    sits 0.0018 pm (Zr K) to 0.17 pm (L edges) away from ``xraylib.EdgeEnergy``, so the table's own
    step is what the interpolation must respect."""
    lo, hi = e_kev * (1 - _EDGE_WINDOW), e_kev * (1 + _EDGE_WINDOW)
    threshold = math.sqrt(cs_total(lo) * cs_total(hi))
    for _ in range(100):
        mid = (lo + hi) / 2
        if cs_total(mid) < threshold:
            lo = mid
        else:
            hi = mid
    if cs_total(hi * (1 + 1e-9)) < 1.02 * cs_total(lo * (1 - 1e-9)):
        return None
    return hi


def cs_step_edges_pm(atomic_numbers, cs_total):
    """Sorted wavelengths (pm) of the K, L1, L2, L3 steps of ``cs_total(E_keV)`` for the elements
    ``atomic_numbers``, rounded to 1e-6 pm, that lie in ``[MU_RHO_GRID_PM[0], MU_RHO_GRID_PM[-1])``.
    Each shell is located from ``xraylib.EdgeEnergy`` and refined to the step of ``cs_total``."""
    edges = set()
    for z in atomic_numbers:
        for shell in _EDGE_SHELLS:
            try:
                e_kev = xraylib.EdgeEnergy(int(z), shell)
            except ValueError:  # shell not present
                continue
            if (
                not HC_KEV_PM / MU_RHO_GRID_PM[-1] * 0.99
                < e_kev
                < HC_KEV_PM / MU_RHO_GRID_PM[0] * 1.01
            ):
                continue  # far outside the grid (the window below could leave xraylib's tables)
            try:
                step_kev = _cs_step_kev(cs_total, e_kev)
            except ValueError:  # window outside xraylib's tables
                continue
            if step_kev is None:
                continue
            lam = round(HC_KEV_PM / step_kev, 6)
            if MU_RHO_GRID_PM[0] <= lam < MU_RHO_GRID_PM[-1]:
                edges.add(lam)
    return tuple(sorted(edges))


@functools.cache
def mu_rho_edges_pm(material):
    """Absorption-edge wavelengths (pm) of ``material`` inside ``MU_RHO_GRID_PM``: the K and L1–L3
    steps of ``CS_Total_CP`` of every element, see ``cs_step_edges_pm`` (L steps differ from
    ``EdgeEnergy`` by up to 0.17 pm; K by ≤ 0.0018 pm)."""
    try:
        zs = xraylib.GetCompoundDataNISTByName(material)["Elements"]
    except ValueError:  # not a NIST name: a chemical formula
        zs = xraylib.CompoundParser(material)["Elements"]
    return cs_step_edges_pm(zs, lambda e_kev: xraylib.CS_Total_CP(material, e_kev))


def edge_intervals(edges_pm):
    """Pair each edge of ``edges_pm`` with the grid interval ``[g_i, g_{i+1}]`` (``g_i ≤ λ_e <
    g_{i+1}``) that holds it: a tuple of ``(i, λ_e)`` in ascending order (the web port repeats
    this lookup on the exported edges). Raises ValueError when two edges share or neighbour an
    interval: the one-side extrapolation would then run through the other edge."""
    out = []
    for lam_e in edges_pm:
        i = int(np.searchsorted(MU_RHO_GRID_PM, lam_e, side="right")) - 1
        if 0 <= i < len(MU_RHO_GRID_PM) - 1:
            if out and i - out[-1][0] <= 1:
                raise ValueError(
                    f"edges {out[-1][1]} and {lam_e} pm share or neighbour a grid interval"
                )
            out.append((i, lam_e))
    return tuple(out)


def interp_log_mu(lambda_pm, log_table, edges_pm=()):
    """log of a quantity tabulated on ``MU_RHO_GRID_PM`` (``log_table`` = its logs) at λ:
    log–log interpolation, end values held, with each absorption edge ``edges_pm`` kept sharp.

    In the grid interval [g_i, g_{i+1}] holding an edge λ_e the value is extrapolated log–log from
    the two nodes on the same side of the edge as λ: λ < λ_e (high-energy side) from g_{i-1}, g_i;
    λ ≥ λ_e from g_{i+1}, g_{i+2}. At a grid end (no second node) the end value is held. Without
    this a linear interpolation would smear the edge over one grid step (0.3 %, up to +0.1 pm).
    """
    lam = np.asarray(lambda_pm, dtype=float)
    x = np.log(lam)
    log_mu = np.interp(x, _LOG_GRID, log_table)
    n = len(_LOG_GRID)
    for i, lam_e in edge_intervals(edges_pm):
        inside = (lam >= MU_RHO_GRID_PM[i]) & (lam <= MU_RHO_GRID_PM[i + 1])
        if i >= 1:  # nodes i−1, i
            slope = (log_table[i] - log_table[i - 1]) / (_LOG_GRID[i] - _LOG_GRID[i - 1])
            low = log_table[i] + slope * (x - _LOG_GRID[i])
        else:
            low = log_table[0]
        if i + 2 < n:  # nodes i+1, i+2
            slope = (log_table[i + 2] - log_table[i + 1]) / (_LOG_GRID[i + 2] - _LOG_GRID[i + 1])
            high = log_table[i + 1] + slope * (x - _LOG_GRID[i + 1])
        else:
            high = log_table[n - 1]
        log_mu = np.where(inside, np.where(lam < lam_e, low, high), log_mu)
    return float(log_mu) if log_mu.ndim == 0 else log_mu


def log_mu_rho(lambda_pm, material):
    """log μ/ρ (μ/ρ in cm²/g) of ``material`` at ``lambda_pm``, edges kept sharp."""
    return interp_log_mu(lambda_pm, _log_mu_rho_table(material), mu_rho_edges_pm(material))


@functools.cache
def _log_mu_rho_table(material):
    table = np.log(mu_rho_table(material))
    table.flags.writeable = False
    return table


def transmission(lambda_pm, material, areal_density_mg_cm2):
    """Fraction T = exp(−μ/ρ · ρx) transmitted through ``areal_density_mg_cm2`` of material."""
    return np.exp(-np.exp(log_mu_rho(lambda_pm, material)) * areal_density_mg_cm2 / 1000)


def areal_density_mg_cm2(material, thickness_mm):
    """Areal density ρx in mg/cm² of a ``thickness_mm`` foil: 100 · thickness_mm · ρ(g/cm³)."""
    if material == "Polystyrene":
        rho_g_cm3 = xraylib.GetCompoundDataNISTByName(material)["density"]
    else:
        rho_g_cm3 = xraylib.ElementDensity(xraylib.SymbolToAtomicNumber(material))
    return 100 * thickness_mm * rho_g_cm3


def check_filters(filters):
    """Raise ValueError unless every ``(material, areal_density_mg_cm2)`` is one of ``ABSORBERS``
    (the web app has μ/ρ tables for those only) with a finite density ≥ 0."""
    for material, areal_density_mg_cm2 in filters:
        if material not in ABSORBERS:
            raise ValueError(f"no μ/ρ table for filter {material!r}: use one of {ABSORBERS}")
        if not (math.isfinite(areal_density_mg_cm2) and areal_density_mg_cm2 >= 0):
            raise ValueError(f"filter areal density must be finite and ≥ 0: {areal_density_mg_cm2}")
