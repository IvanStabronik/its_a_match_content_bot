#!/usr/bin/env python3
"""Generate Russian user guide PDF from markdown source."""

from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    from fpdf import FPDF
except ImportError:
    print("Installing fpdf2...", file=sys.stderr)
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "fpdf2", "-q"])
    from fpdf import FPDF

ROOT = Path(__file__).resolve().parent.parent
MD_PATH = ROOT / "docs" / "RUKOVODSTVO-POLZOVATELYA.md"
PDF_PATH = ROOT / "docs" / "RUKOVODSTVO-POLZOVATELYA.pdf"

FONT_REGULAR = Path(r"C:\Windows\Fonts\arial.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\arialbd.ttf")
if not FONT_REGULAR.exists():
    FONT_REGULAR = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    FONT_BOLD = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")


class GuidePDF(FPDF):
    def header(self) -> None:
        if self.page_no() > 1:
            self.set_font("Guide", "B", 9)
            self.set_text_color(100, 116, 139)
            self.cell(0, 8, "Manual Content Publisher Bot — Руководство пользователя", align="R")
            self.ln(4)

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Guide", "", 9)
        self.set_text_color(100, 116, 139)
        self.cell(0, 10, f"Стр. {self.page_no()}", align="C")


def strip_md_inline(text: str) -> str:
    emoji_map = {
        "✅": "[OK]",
        "🕒": "[TIME]",
        "📝": "[EDIT]",
        "✨": "[AI]",
        "✂️": "[CUT]",
        "🎭": "[LIVE]",
        "🧹": "[FIX]",
        "❌": "[X]",
        "🗑": "[DEL]",
        "⬅️": "<-",
        "➡️": "->",
        "⚠️": "(!)",
        "⚠": "(!)",
    }
    for k, v in emoji_map.items():
        text = text.replace(k, v)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    return text.strip()


def write_wrapped(pdf: GuidePDF, text: str, size: int = 11, bold: bool = False) -> None:
    pdf.set_font("Guide", "B" if bold else "", size)
    pdf.set_text_color(26, 26, 26)
    pdf.multi_cell(0, size * 0.55, text)
    pdf.ln(2)


def parse_table(lines: list[str], start: int) -> tuple[list[list[str]], int]:
    rows: list[list[str]] = []
    i = start
    while i < len(lines) and lines[i].strip().startswith("|"):
        row = [strip_md_inline(c.strip()) for c in lines[i].strip().strip("|").split("|")]
        if not all(set(c) <= {"-", ":", " "} for c in row):
            rows.append(row)
        i += 1
    return rows, i


def render_table(pdf: GuidePDF, rows: list[list[str]]) -> None:
    if not rows:
        return
    col_count = max(len(r) for r in rows)
    width = (pdf.w - pdf.l_margin - pdf.r_margin) / col_count
    pdf.set_font("Guide", "", 9)
    for ri, row in enumerate(rows):
        if ri == 0:
            pdf.set_fill_color(241, 245, 249)
        else:
            pdf.set_fill_color(255, 255, 255)
        x0 = pdf.get_x()
        y0 = pdf.get_y()
        max_h = 6
        for ci in range(col_count):
            cell = row[ci] if ci < len(row) else ""
            pdf.set_xy(x0 + ci * width, y0)
            pdf.multi_cell(width, 5, cell, border=1, fill=True)
            max_h = max(max_h, pdf.get_y() - y0)
        pdf.set_y(y0 + max_h)
    pdf.ln(3)


def build_pdf(md_text: str) -> GuidePDF:
    pdf = GuidePDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_font("Guide", "", str(FONT_REGULAR))
    pdf.add_font("Guide", "B", str(FONT_BOLD))
    pdf.add_page()

    lines = md_text.splitlines()
    i = 0
    in_code = False
    code_buf: list[str] = []

    while i < len(lines):
        line = lines[i]
        raw = line.rstrip()

        if raw.strip().startswith("```"):
            if in_code:
                pdf.set_fill_color(248, 250, 252)
                pdf.set_font("Guide", "", 9)
                block = "\n".join(code_buf)
                pdf.multi_cell(0, 4.5, block, fill=True)
                pdf.ln(4)
                code_buf = []
                in_code = False
            else:
                in_code = True
            i += 1
            continue

        if in_code:
            code_buf.append(raw)
            i += 1
            continue

        if not raw.strip():
            pdf.ln(2)
            i += 1
            continue

        if raw.strip() == "---":
            pdf.ln(2)
            pdf.set_draw_color(226, 232, 240)
            pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
            pdf.ln(4)
            i += 1
            continue

        if raw.startswith("# "):
            pdf.ln(2)
            write_wrapped(pdf, strip_md_inline(raw[2:]), size=20, bold=True)
            i += 1
            continue

        if raw.startswith("## "):
            pdf.ln(4)
            pdf.set_text_color(30, 64, 175)
            write_wrapped(pdf, strip_md_inline(raw[3:]), size=14, bold=True)
            i += 1
            continue

        if raw.startswith("### "):
            pdf.ln(2)
            write_wrapped(pdf, strip_md_inline(raw[4:]), size=12, bold=True)
            i += 1
            continue

        if raw.strip().startswith("|"):
            rows, i = parse_table(lines, i)
            render_table(pdf, rows)
            continue

        if raw.startswith("> "):
            pdf.set_fill_color(239, 246, 255)
            pdf.set_text_color(30, 58, 95)
            pdf.set_font("Guide", "", 10)
            pdf.multi_cell(0, 5, strip_md_inline(raw[2:]), fill=True)
            pdf.ln(3)
            i += 1
            continue

        if raw.startswith("- "):
            write_wrapped(pdf, "• " + strip_md_inline(raw[2:]), size=10)
            i += 1
            continue

        write_wrapped(pdf, strip_md_inline(raw), size=11)
        i += 1

    return pdf


def main() -> None:
    md = MD_PATH.read_text(encoding="utf-8")
    pdf = build_pdf(md)
    PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(PDF_PATH))
    print(f"PDF written: {PDF_PATH} ({PDF_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
