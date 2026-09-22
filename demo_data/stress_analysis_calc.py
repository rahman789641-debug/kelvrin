"""
Sovereign Industrial Engineering - Stress Calculation Module
ASME Boiler and Pressure Vessel Code (BPVC) Section VIII, Division 1
Synthetic Calculation for Pressure Vessel PS-26117
"""

def compute_hoop_stress(pressure_psi: float, inner_radius_mm: float, wall_thickness_mm: float) -> float:
    """
    Computes circumferential (hoop) stress in a thin-walled cylindrical shell.
    Formula: S_h = (P * r) / t
    Converts pressure from PSI to MPa: 1 PSI = 0.00689476 MPa
    """
    p_mpa = pressure_psi * 0.00689476
    return (p_mpa * inner_radius_mm) / wall_thickness_mm

def compute_longitudinal_stress(pressure_psi: float, inner_radius_mm: float, wall_thickness_mm: float) -> float:
    """
    Computes longitudinal stress in a cylindrical shell.
    Formula: S_l = (P * r) / (2 * t)
    """
    return compute_hoop_stress(pressure_psi, inner_radius_mm, wall_thickness_mm) / 2.0

def verify_ps26117_safety_margins():
    # PS-26117 Parameters
    mawp_psi = 100.0
    hydro_psi = 150.0
    radius_mm = 600.0  # 1200mm diameter
    t_min_measured_mm = 14.2
    allowable_stress_mpa = 138.0  # SA-516 Grade 70 Carbon Steel at 350F
    
    hoop_operating = compute_hoop_stress(mawp_psi, radius_mm, t_min_measured_mm)
    long_operating = compute_longitudinal_stress(mawp_psi, radius_mm, t_min_measured_mm)
    hoop_hydro = compute_hoop_stress(hydro_psi, radius_mm, t_min_measured_mm)
    
    safety_factor_operating = allowable_stress_mpa / hoop_operating
    
    print(f"=== PS-26117 MECHANICAL STRESS ANALYSIS ===")
    print(f"Operating Hoop Stress (100 PSI):     {hoop_operating:.2f} MPa")
    print(f"Operating Longitudinal Stress:       {long_operating:.2f} MPa")
    print(f"Hydrostatic Hoop Stress (150 PSI):   {hoop_hydro:.2f} MPa")
    print(f"Allowable Material Stress (SA-516):  {allowable_stress_mpa:.2f} MPa")
    print(f"Operating Safety Factor:             {safety_factor_operating:.2f}x (Threshold >= 1.5x)")
    
    # Assertions
    assert safety_factor_operating >= 1.5, f"Safety factor {safety_factor_operating} below required 1.5"
    assert hoop_operating < allowable_stress_mpa, "Operating stress exceeds allowable limit"
    assert hoop_hydro < (1.3 * allowable_stress_mpa), "Hydrostatic stress exceeds test allowance"
    print("STATUS: ALL MECHANICAL STRESS SAFETY CHECKS PASSED [OK]")

if __name__ == "__main__":
    verify_ps26117_safety_margins()
