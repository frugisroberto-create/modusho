#!/usr/bin/env python3
"""
Legge i 25 file Excel LQA già tradotti e genera lqa_sections.json
pronto per l'import in ModusHO via TypeScript.
"""
import openpyxl
import json
import os
import re

STANDARD_BOOK_DIR = "/sessions/dreamy-elegant-cerf/mnt/DomusGO/Standard_Book"
OUTPUT_JSON = "/sessions/dreamy-elegant-cerf/mnt/DomusGO/scripts/lqa_sections.json"

# Metadati per ogni sezione: num -> (title_it, dept_codes, sheet_prefix)
# dept_codes: lista di codici reparto (dal seed). Stringa vuota = tutti i reparti (ROLE/OPERATOR)
# FO = Front Office, RM = Housekeeping/Room Division, FB = F&B,
# MT = Maintenance, SP = Spa/Wellness
SECTION_META = {
    "01": {
        "title": "LQA — Porter & Doorman Arrival",
        "deptCodes": ["FO"],
        "file": "LQA_Check_01_Porter_Doorman.xlsx",
    },
    "02": {
        "title": "LQA — Check-In",
        "deptCodes": ["FO"],
        "file": "LQA_Check_02_CheckIn.xlsx",
    },
    "03": {
        "title": "LQA — Guest Communications (Tel & Digital)",
        "deptCodes": ["FO"],
        "file": "LQA_Check_03_GC_TelDigital.xlsx",
    },
    "04": {
        "title": "LQA — Guest Communications (In Person)",
        "deptCodes": ["FO"],
        "file": "LQA_Check_04_GC_InPerson.xlsx",
    },
    "05": {
        "title": "LQA — Check-Out & Departure",
        "deptCodes": ["FO"],
        "file": "LQA_Check_05_CheckOut_Departure.xlsx",
    },
    "06": {
        "title": "LQA — Housekeeping: Arrivo Ospite",
        "deptCodes": ["RM"],
        "file": "LQA_Check_06_HK_Arrival.xlsx",
    },
    "07": {
        "title": "LQA — Turn-Down Service",
        "deptCodes": ["RM"],
        "file": "LQA_Check_07_Turndown.xlsx",
    },
    "08": {
        "title": "LQA — Room Servicing",
        "deptCodes": ["RM"],
        "file": "LQA_Check_08_Servicing.xlsx",
    },
    "09": {
        "title": "LQA — F&B: Colazione",
        "deptCodes": ["FB"],
        "file": "LQA_Check_09_Breakfast.xlsx",
    },
    "10": {
        "title": "LQA — F&B: Ristorante (Pranzo/Cena)",
        "deptCodes": ["FB"],
        "file": "LQA_Check_10_Restaurant.xlsx",
    },
    "11": {
        "title": "LQA — F&B: Buffet",
        "deptCodes": ["FB"],
        "file": "LQA_Check_11_Buffet.xlsx",
    },
    "12": {
        "title": "LQA — F&B: Light Meals",
        "deptCodes": ["FB"],
        "file": "LQA_Check_12_LightMeals.xlsx",
    },
    "13": {
        "title": "LQA — F&B: Servizio Bevande (Bar)",
        "deptCodes": ["FB"],
        "file": "LQA_Check_13_DrinksService.xlsx",
    },
    "14": {
        "title": "LQA — Room Service (In-Room Dining)",
        "deptCodes": ["FB", "RM"],
        "file": "LQA_Check_14_InRoomDining.xlsx",
    },
    "15": {
        "title": "LQA — Camera: Qualità e Standard",
        "deptCodes": ["RM"],
        "file": "LQA_Check_15_TheRoom.xlsx",
    },
    "16": {
        "title": "LQA — Aree Comuni (Public Areas)",
        "deptCodes": ["RM"],
        "file": "LQA_Check_16_PublicAreas.xlsx",
    },
    "17": {
        "title": "LQA — Fitness & Wellness",
        "deptCodes": ["SP"],
        "file": "LQA_Check_17_FitnessWellness.xlsx",
    },
    "18": {
        "title": "LQA — Spa: Strutture e Impianti",
        "deptCodes": ["SP"],
        "file": "LQA_Check_18_SpaFacilities.xlsx",
    },
    "19": {
        "title": "LQA — Spa: Trattamenti",
        "deptCodes": ["SP"],
        "file": "LQA_Check_19_SpaTreatment.xlsx",
    },
    "20": {
        "title": "LQA — Trasporto Ospiti",
        "deptCodes": ["FO"],
        "file": "LQA_Check_20_Transport.xlsx",
    },
    "22": {
        "title": "LQA — Prenotazioni (Reservations)",
        "deptCodes": ["FO"],
        "file": "LQA_Check_22_Reservations.xlsx",
    },
    "23": {
        "title": "LQA — Digital & Comunicazione Online",
        "deptCodes": ["FO"],
        "file": "LQA_Check_23_Digital.xlsx",
    },
    "24": {
        "title": "LQA — Sicurezza Ospiti",
        "deptCodes": ["MT", "FO"],
        "file": "LQA_Check_24_GuestSecurity.xlsx",
    },
    "25": {
        "title": "LQA — Lavanderia",
        "deptCodes": ["RM"],
        "file": "LQA_Check_25_Laundry.xlsx",
    },
    "26": {
        "title": "LQA — Housekeeping: EI Behavioural",
        "deptCodes": ["RM"],
        "file": "LQA_Check_26_HousekeepingEI.xlsx",
    },
}


def clean(val):
    """Normalizza il valore della cella: strip, None→''"""
    if val is None:
        return ""
    return str(val).replace("\n", " ").strip()


def read_standards(filepath):
    """
    Legge il file Excel e restituisce lista di dict:
    { num, subsection, en, it, classification }
    Salta le prime 3 righe (titolo, istruzioni, header).
    """
    wb = openpyxl.load_workbook(filepath, data_only=True)
    ws = wb.active
    standards = []
    for row in ws.iter_rows(min_row=4, values_only=True):
        num, sub, en, it, cls, _ = (list(row) + [None]*6)[:6]
        if num is None or not str(num).strip().isdigit():
            continue
        standards.append({
            "num": int(num),
            "subsection": clean(sub),
            "en": clean(en),
            "it": clean(it),
            "classification": clean(cls),
        })
    return standards


def build_html(standards):
    """Genera tabella HTML con gli standard della sezione."""
    rows_html = []
    for s in standards:
        cls_color = {
            "Efficiency": "#E3F2FD",
            "Behaviour": "#F3E5F5",
            "Condition": "#E8F5E9",
        }.get(s["classification"], "#FFF8E1")
        cls_text_color = {
            "Efficiency": "#1565C0",
            "Behaviour": "#6A1B9A",
            "Condition": "#2E7D32",
        }.get(s["classification"], "#E65100")

        rows_html.append(
            f'<tr>'
            f'<td style="width:3%;text-align:center;font-weight:700;vertical-align:top;padding:10px 8px;border-bottom:1px solid #E8E5DC;">{s["num"]}</td>'
            f'<td style="width:14%;font-size:11px;color:#666;vertical-align:top;padding:10px 8px;border-bottom:1px solid #E8E5DC;">{s["subsection"]}</td>'
            f'<td style="width:38%;font-size:12px;color:#555;vertical-align:top;padding:10px 8px;border-bottom:1px solid #E8E5DC;font-style:italic;">{s["en"]}</td>'
            f'<td style="width:38%;font-size:13px;color:#333;vertical-align:top;padding:10px 8px;border-bottom:1px solid #E8E5DC;">{s["it"]}</td>'
            f'<td style="width:7%;text-align:center;vertical-align:top;padding:10px 6px;border-bottom:1px solid #E8E5DC;">'
            f'<span style="background:{cls_color};color:{cls_text_color};font-size:10px;font-weight:600;padding:2px 6px;border-radius:0;">{s["classification"]}</span>'
            f'</td>'
            f'</tr>'
        )

    header = (
        '<table style="width:100%;border-collapse:collapse;font-family:Inter,sans-serif;">'
        '<thead><tr style="background:#F0EFE9;">'
        '<th style="padding:10px 8px;text-align:center;font-size:11px;color:#666;font-weight:600;border-bottom:2px solid #E8E5DC;">#</th>'
        '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#666;font-weight:600;border-bottom:2px solid #E8E5DC;">Sottosezione</th>'
        '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#666;font-weight:600;border-bottom:2px solid #E8E5DC;">Standard (EN)</th>'
        '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#666;font-weight:600;border-bottom:2px solid #E8E5DC;">Standard (IT)</th>'
        '<th style="padding:10px 8px;text-align:center;font-size:11px;color:#666;font-weight:600;border-bottom:2px solid #E8E5DC;">Classe</th>'
        '</tr></thead>'
        '<tbody>'
    )
    footer = '</tbody></table>'
    return header + "\n".join(rows_html) + footer


def main():
    sections = []
    errors = []

    for num, meta in sorted(SECTION_META.items()):
        filepath = os.path.join(STANDARD_BOOK_DIR, meta["file"])
        if not os.path.exists(filepath):
            errors.append(f"File non trovato: {filepath}")
            continue

        try:
            standards = read_standards(filepath)
        except Exception as e:
            errors.append(f"Errore lettura {meta['file']}: {e}")
            continue

        body_html = build_html(standards)

        sections.append({
            "num": num,
            "title": meta["title"],
            "standardSource": "LQA",
            "deptCodes": meta["deptCodes"],
            "standardCount": len(standards),
            "bodyHtml": body_html,
        })
        print(f"  ✓ Sezione {num}: {meta['title']} — {len(standards)} standard")

    if errors:
        print("\n⚠ ERRORI:")
        for e in errors:
            print(f"  {e}")

    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(sections, f, ensure_ascii=False, indent=2)

    total = sum(s["standardCount"] for s in sections)
    print(f"\n✅ JSON generato: {OUTPUT_JSON}")
    print(f"   {len(sections)} sezioni, {total} standard totali")


if __name__ == "__main__":
    main()
