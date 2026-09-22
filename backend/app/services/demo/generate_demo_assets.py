import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from PIL import Image, ImageDraw, ImageFont
import openpyxl

DEMO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../demo_data"))
os.makedirs(DEMO_DIR, exist_ok=True)

def generate_inspection_pdf():
    pdf_path = os.path.join(DEMO_DIR, "ps26117_inspection_report.pdf")
    doc = SimpleDocTemplate(pdf_path, pagesize=letter, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('TitleStyle', parent=styles['Heading1'], fontSize=18, leading=22, textColor=colors.HexColor('#0F172A'))
    sub_style = ParagraphStyle('SubStyle', parent=styles['Normal'], fontSize=9, leading=12, textColor=colors.HexColor('#475569'))
    body_style = ParagraphStyle('BodyStyle', parent=styles['Normal'], fontSize=10, leading=14, textColor=colors.HexColor('#1E293B'))
    
    elements = []
    elements.append(Paragraph("SOVEREIGN INDUSTRIAL COMPLIANCE REPORT", title_style))
    elements.append(Paragraph("EQUIPMENT INSPECTION DOSSIER: PRESSURE VESSEL PS-26117", ParagraphStyle('H2', parent=styles['Heading2'], fontSize=12, textColor=colors.HexColor('#1E40AF'))))
    elements.append(Paragraph("Classification: SYNTHETIC DEMONSTRATION RECORD | Inspection Date: 2026-09-12 | Inspector ID: INS-8419", sub_style))
    elements.append(Spacer(1, 14))
    
    # Overview Table
    data = [
        ["Asset Tag", "PS-26117", "Asset Type", "Vertical Hydrotreater Separator"],
        ["Location", "Unit 4 Hydrotreating Complex", "Design Code", "ASME Section VIII Div 1"],
        ["Design Pressure (MAWP)", "100.0 PSI (689 kPa)", "Design Temperature", "350°F (176.7°C)"],
        ["Hydrostatic Test Pressure", "150.0 PSI (1.5x MAWP)", "Test Date", "2026-09-12 11:30 UTC"],
        ["Nominal Wall Thickness", "15.0 mm", "Minimum Measured Thickness", "14.2 mm (Shell Section 2)"],
        ["Ultrasonic NDT Status", "Grade 1 (Full Penetration)", "Weld Joints Examined", "Circumferential & Long. Seams"],
        ["Relief Valve PRV-261", "150.0 PSI (Calibrated/Passed)", "Popping Tolerance", "+/- 1.5% compliant"],
        ["Physical QA Stamp", "PENDING VERIFICATION", "Inspector Recommendation", "CONDITIONAL RECERTIFICATION"]
    ]
    t = Table(data, colWidths=[140, 130, 140, 130])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME', (2,0), (2,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor('#0F172A')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 14))
    
    elements.append(Paragraph("1.0 Ultrasonic Shell Thickness Profile", ParagraphStyle('H3', parent=styles['Heading3'], fontSize=11, textColor=colors.HexColor('#0F172A'))))
    elements.append(Paragraph("Precision ultrasonic examination was performed across 16 calibrated grid coordinates. The minimum recorded shell wall thickness was 14.2 mm on lower course shell section 2. All measured coordinates exceed the 12.0 mm retirement threshold established under SOP-704.", body_style))
    elements.append(Spacer(1, 10))
    
    elements.append(Paragraph("2.0 Weld Integrity & Hydrostatic Verification", ParagraphStyle('H3', parent=styles['Heading3'], fontSize=11, textColor=colors.HexColor('#0F172A'))))
    elements.append(Paragraph("All head-to-shell circumferential welds and shell longitudinal seam welds were inspected using ultrasonic phased-array testing. Zero crack-like indications, lack of fusion, or porosity clusters were observed. Hydrostatic proof pressure was held at 150 PSI for 60 minutes with zero observable pressure drop.", body_style))
    elements.append(Spacer(1, 10))
    
    elements.append(Paragraph("3.0 Finding & Compliance Action Item", ParagraphStyle('H3', parent=styles['Heading3'], fontSize=11, textColor=colors.HexColor('#B91C1C'))))
    elements.append(Paragraph("<b>CRITICAL NOTICE:</b> While physical mechanical tests comply with ASME standards, the secondary inspection QA stamp has not yet been physically verified on the vessel nameplate. Approval must remain <b>CONDITIONAL</b> until the on-site physical stamp is confirmed.", body_style))
    
    doc.build(elements)
    print(f"Generated {pdf_path}")

def generate_sop_pdf():
    pdf_path = os.path.join(DEMO_DIR, "sop704_standard.pdf")
    doc = SimpleDocTemplate(pdf_path, pagesize=letter, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('TitleStyle', parent=styles['Heading1'], fontSize=18, leading=22, textColor=colors.HexColor('#0F172A'))
    body_style = ParagraphStyle('BodyStyle', parent=styles['Normal'], fontSize=10, leading=14, textColor=colors.HexColor('#1E293B'))
    
    elements = []
    elements.append(Paragraph("STANDARD OPERATING PROCEDURE: SOP-704", title_style))
    elements.append(Paragraph("PRESSURE VESSEL RECERTIFICATION & MECHANICAL INTEGRITY MANDATE", ParagraphStyle('H2', parent=styles['Heading2'], fontSize=12, textColor=colors.HexColor('#1E40AF'))))
    elements.append(Paragraph("Effective Date: 2026-01-01 | Authority: Sovereign Engineering Quality Directorate", styles['Normal']))
    elements.append(Spacer(1, 14))
    
    elements.append(Paragraph("3.1 Minimum Allowable Shell Wall Thickness", ParagraphStyle('H3', parent=styles['Heading3'], fontSize=11, textColor=colors.HexColor('#0F172A'))))
    elements.append(Paragraph("Under no operational conditions shall any pressure vessel operating above 50 PSI be recertified if any shell section exhibits a measured wall thickness of less than <b>12.0 mm</b>. Assets with thickness between 12.0 mm and 13.0 mm must undergo quarterly recalculation.", body_style))
    elements.append(Spacer(1, 10))
    
    elements.append(Paragraph("3.2 Hydrostatic Proof Testing Rules", ParagraphStyle('H3', parent=styles['Heading3'], fontSize=11, textColor=colors.HexColor('#0F172A'))))
    elements.append(Paragraph("Hydrostatic proof testing must be executed at exactly <b>1.5 times the Maximum Allowable Working Pressure (MAWP)</b>. For vessels rated at 100 PSI MAWP, the mandatory test pressure is <b>150.0 PSI</b> held for a minimum of 60 minutes with calibrated digital gauges.", body_style))
    elements.append(Spacer(1, 10))
    
    elements.append(Paragraph("4.0 Recertification Sign-Off & Physical Stamp Mandatory Requirement", ParagraphStyle('H3', parent=styles['Heading3'], fontSize=11, textColor=colors.HexColor('#0F172A'))))
    elements.append(Paragraph("Final recertification requires two criteria: (a) All mechanical inspection metrics meet or exceed Section 3 criteria, and (b) An authenticated <b>Secondary QA Stamp</b> is verified and recorded on the physical nameplate by a certified Level III NDT inspector. Automated or conditional approvals must withhold final return-to-service until the QA stamp is physically confirmed.", body_style))
    
    doc.build(elements)
    print(f"Generated {pdf_path}")

def generate_schematic_png():
    img_path = os.path.join(DEMO_DIR, "pressure_vessel_schematic.png")
    w, h = 900, 600
    img = Image.new("RGB", (w, h), "#0F172A")
    draw = ImageDraw.Draw(img)
    
    # Background Grid
    for x in range(0, w, 40):
        draw.line([(x, 0), (x, h)], fill="#1E293B", width=1)
    for y in range(0, h, 40):
        draw.line([(0, y), (w, y)], fill="#1E293B", width=1)
        
    # Title Header
    draw.rectangle([(20, 20), (w - 20, 70)], fill="#1E293B", outline="#3B82F6", width=2)
    draw.text((35, 30), "PRESSURE VESSEL PS-26117 - ENGINEERING SCHEMATIC", fill="#38BDF8")
    draw.text((35, 50), "DESIGN CODE: ASME SEC VIII DIV 1 | MAWP: 100 PSI | HYDRO: 150 PSI", fill="#94A3B8")
    
    # Vessel Body
    body_x1, body_y1 = 300, 160
    body_x2, body_y2 = 600, 480
    
    # Cylinder Shell
    draw.rectangle([(body_x1, body_y1), (body_x2, body_y2)], outline="#60A5FA", width=3, fill="#1E3A5F")
    
    # Top Head (Elliptical)
    draw.arc([(body_x1, body_y1 - 60), (body_x2, body_y1 + 60)], 180, 360, fill="#60A5FA", width=3)
    # Bottom Head (Elliptical)
    draw.arc([(body_x1, body_y2 - 60), (body_x2, body_y2 + 60)], 0, 180, fill="#60A5FA", width=3)
    
    # Circumferential Welds (Seams)
    draw.line([(body_x1, 260), (body_x2, 260)], fill="#34D399", width=2)
    draw.line([(body_x1, 380), (body_x2, 380)], fill="#34D399", width=2)
    
    # Nozzles
    # Top Nozzle (Relief Valve PRV-261)
    draw.rectangle([(425, 60), (475, 100)], fill="#3B82F6", outline="#93C5FD", width=2)
    draw.line([(450, 45), (450, 60)], fill="#93C5FD", width=2)
    draw.text((490, 65), "PRV-261 (150 PSI Set)", fill="#FCD34D")
    
    # Side Inlet Nozzle
    draw.rectangle([(240, 210), (300, 250)], fill="#3B82F6", outline="#93C5FD", width=2)
    draw.text((80, 220), "Inlet Nozzle N-1 (DN 150)", fill="#93C5FD")
    draw.line([(200, 230), (240, 230)], fill="#93C5FD", width=2)
    
    # Side Outlet Nozzle
    draw.rectangle([(600, 390), (660, 430)], fill="#3B82F6", outline="#93C5FD", width=2)
    draw.text((675, 400), "Liquid Drain N-2", fill="#93C5FD")
    
    # Callout: Minimum Measured Wall Thickness
    draw.line([(550, 320), (700, 320)], fill="#F87171", width=2)
    draw.line([(700, 320), (730, 290)], fill="#F87171", width=2)
    draw.rectangle([(730, 260), (880, 330)], fill="#1E293B", outline="#F87171", width=2)
    draw.text((740, 270), "MEASURED WALL:", fill="#F87171")
    draw.text((740, 290), "t_min = 14.2 mm", fill="#FFFFFF")
    draw.text((740, 310), "REQ: >= 12.0 mm (OK)", fill="#34D399")
    
    # Legend
    draw.rectangle([(25, 520), (400, 580)], fill="#1E293B", outline="#475569", width=1)
    draw.text((35, 530), "LEGEND:", fill="#E2E8F0")
    draw.line([(35, 550), (65, 550)], fill="#34D399", width=2)
    draw.text((75, 545), "Grade 1 NDT Ultrasonic Welds", fill="#94A3B8")
    draw.line([(35, 565), (65, 565)], fill="#F87171", width=2)
    draw.text((75, 560), "Critical Thickness Inspection Zone", fill="#94A3B8")
    
    img.save(img_path)
    print(f"Generated {img_path}")

def generate_ultrasonic_excel():
    xlsx_path = os.path.join(DEMO_DIR, "ultrasonic_thickness_log.xlsx")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "UT Thickness Log"
    
    headers = ["Point ID", "Component", "Elevation (mm)", "Azimuth (deg)", "Nominal (mm)", "Measured (mm)", "Threshold (mm)", "Status"]
    ws.append(headers)
    
    rows = [
        ["UT-01", "Top Head Knuckle", 4200, 0, 15.0, 14.8, 12.0, "COMPLIANT"],
        ["UT-02", "Top Head Knuckle", 4200, 90, 15.0, 14.9, 12.0, "COMPLIANT"],
        ["UT-03", "Top Head Knuckle", 4200, 180, 15.0, 14.7, 12.0, "COMPLIANT"],
        ["UT-04", "Top Head Knuckle", 4200, 270, 15.0, 14.8, 12.0, "COMPLIANT"],
        ["UT-05", "Shell Course 1", 3400, 45, 15.0, 14.6, 12.0, "COMPLIANT"],
        ["UT-06", "Shell Course 1", 3400, 135, 15.0, 14.5, 12.0, "COMPLIANT"],
        ["UT-07", "Shell Course 1", 3400, 225, 15.0, 14.6, 12.0, "COMPLIANT"],
        ["UT-08", "Shell Course 1", 3400, 315, 15.0, 14.7, 12.0, "COMPLIANT"],
        ["UT-09", "Shell Course 2 (Critical)", 2100, 0, 15.0, 14.3, 12.0, "COMPLIANT"],
        ["UT-10", "Shell Course 2 (Critical)", 2100, 90, 15.0, 14.2, 12.0, "COMPLIANT (MIN)"],
        ["UT-11", "Shell Course 2 (Critical)", 2100, 180, 15.0, 14.4, 12.0, "COMPLIANT"],
        ["UT-12", "Shell Course 2 (Critical)", 2100, 270, 15.0, 14.3, 12.0, "COMPLIANT"],
        ["UT-13", "Bottom Head", 500, 0, 15.0, 14.9, 12.0, "COMPLIANT"],
        ["UT-14", "Bottom Head", 500, 90, 15.0, 14.8, 12.0, "COMPLIANT"],
        ["UT-15", "Bottom Head", 500, 180, 15.0, 14.9, 12.0, "COMPLIANT"],
        ["UT-16", "Bottom Head", 500, 270, 15.0, 15.0, 12.0, "COMPLIANT"],
    ]
    for r in rows:
        ws.append(r)
        
    wb.save(xlsx_path)
    print(f"Generated {xlsx_path}")

def generate_coding_task_script():
    py_path = os.path.join(DEMO_DIR, "stress_analysis_calc.py")
    code = '''"""
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
'''
    with open(py_path, "w", encoding="utf-8") as f:
        f.write(code)
    print(f"Generated {py_path}")

if __name__ == "__main__":
    generate_inspection_pdf()
    generate_sop_pdf()
    generate_schematic_png()
    generate_ultrasonic_excel()
    generate_coding_task_script()
    print("All 5 synthetic demo assets generated successfully.")
