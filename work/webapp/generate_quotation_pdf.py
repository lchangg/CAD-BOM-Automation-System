import json
import os
import sys
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def setup_font():
    candidates = [
        os.environ.get("BOM_PDF_FONT", r"C:\Windows\Fonts\msyh.ttc"),
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\NotoSansSC-VF.ttf",
    ]
    for font_path in candidates:
        if not os.path.exists(font_path):
            continue
        try:
            pdfmetrics.registerFont(TTFont("QuoteCJK", font_path, subfontIndex=0 if font_path.lower().endswith(".ttc") else 0))
            return "QuoteCJK"
        except Exception:
            continue
    return "Helvetica"


def safe(value):
    return str(value or "-").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def money(value, currency="CNY"):
    return f"{float(value or 0):,.2f} {currency}"


def footer(canvas: Canvas, doc):
    canvas.saveState()
    canvas.setFont(doc.font_name, 8)
    canvas.setFillColor(colors.HexColor("#718391"))
    canvas.drawString(18 * mm, 10 * mm, "配电系统 BOM 客户报价")
    canvas.drawRightString(279 * mm, 10 * mm, f"第 {doc.page} 页")
    canvas.restoreState()


def build(input_path, output_path):
    with open(input_path, "r", encoding="utf-8") as stream:
        payload = json.load(stream)
    font_name = setup_font()
    project = payload.get("project") or {}
    customer = payload.get("customer") or {}
    quote = payload.get("quotation") or {}
    items = payload.get("items") or []
    currency = quote.get("currency") or "CNY"
    doc = SimpleDocTemplate(output_path, pagesize=landscape(A4), leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=16 * mm, title=f"{project.get('name', '项目')} 客户报价")
    doc.font_name = font_name
    styles = getSampleStyleSheet()
    title = ParagraphStyle("title", parent=styles["Title"], fontName=font_name, fontSize=20, leading=25, textColor=colors.HexColor("#12304A"), alignment=TA_CENTER, spaceAfter=4 * mm)
    subtitle = ParagraphStyle("subtitle", parent=styles["Normal"], fontName=font_name, fontSize=9, leading=13, textColor=colors.HexColor("#718391"), alignment=TA_CENTER, spaceAfter=7 * mm)
    label = ParagraphStyle("label", parent=styles["Normal"], fontName=font_name, fontSize=9, leading=13, textColor=colors.HexColor("#718391"))
    body = ParagraphStyle("body", parent=styles["Normal"], fontName=font_name, fontSize=9, leading=12, textColor=colors.HexColor("#1F2937"))
    body_center = ParagraphStyle("body_center", parent=body, alignment=TA_CENTER)
    body_right = ParagraphStyle("body_right", parent=body, alignment=TA_RIGHT)
    header = ParagraphStyle("header", parent=body, fontSize=8.5, leading=11, textColor=colors.white, alignment=TA_CENTER)
    story = [Paragraph("客户报价单", title), Paragraph(f"项目：{safe(project.get('name'))}  |  生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}", subtitle)]
    customer_data = [
        [Paragraph("客户名称", label), Paragraph(safe(customer.get("name")), body), Paragraph("联系人", label), Paragraph(safe(customer.get("contact")), body)],
        [Paragraph("联系电话", label), Paragraph(safe(customer.get("phone")), body), Paragraph("客户地址", label), Paragraph(safe(customer.get("address")), body)],
    ]
    customer_table = Table(customer_data, colWidths=[25 * mm, 83 * mm, 25 * mm, 123 * mm])
    customer_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E9F1F4")), ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#E9F1F4")), ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#C9D8DF")), ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#DCE6EA")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    story += [customer_table, Spacer(1, 7 * mm)]
    table_headers = ["柜体", "材料类别", "规格", "品牌", "型号", "数量", "单价", "金额", "价格状态"]
    table_data = [[Paragraph(safe(value), header) for value in table_headers]]
    for item in items:
        matched = bool(item.get("priceMatched"))
        table_data.append([
            Paragraph(safe(item.get("cabinet")), body), Paragraph(safe(item.get("category")), body), Paragraph(safe(item.get("spec")), body),
            Paragraph(safe(item.get("brandName")), body), Paragraph(safe(item.get("productModel")), body), Paragraph(str(item.get("quantity", 0)), body_center),
            Paragraph(money(item.get("unitPrice", 0), currency) if matched else "-", body_right), Paragraph(money(item.get("materialCost", 0), currency), body_right), Paragraph("已匹配" if matched else "未匹配", body_center),
        ])
    detail = Table(table_data, repeatRows=1, colWidths=[34 * mm, 25 * mm, 37 * mm, 25 * mm, 39 * mm, 14 * mm, 23 * mm, 25 * mm, 22 * mm])
    detail.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F6F8B")), ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#C9D8DF")), ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#DCE6EA")), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7FAFB")]), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story += [detail, Spacer(1, 8 * mm)]
    summary_data = [[Paragraph("费用汇总", header), "", ""], [Paragraph("材料成本", label), Paragraph(money(quote.get("materialCost"), currency), body_right), ""], [Paragraph("人工费", label), Paragraph(money(quote.get("laborFee"), currency), body_right), ""], [Paragraph("运输费", label), Paragraph(money(quote.get("transportFee"), currency), body_right), ""], [Paragraph("其他费用", label), Paragraph(money(quote.get("otherFee"), currency), body_right), ""], [Paragraph(f"利润（{float(quote.get('profitRate') or 0):.2f}%）", label), Paragraph(money(quote.get("profitAmount"), currency), body_right), ""], [Paragraph("最终报价", body), Paragraph(money(quote.get("totalAmount"), currency), ParagraphStyle("total", parent=body_right, fontSize=12, leading=15, textColor=colors.HexColor("#12304A"), fontName=font_name)), ""]]
    summary = Table(summary_data, colWidths=[40 * mm, 45 * mm, 140 * mm], hAlign="RIGHT")
    summary.setStyle(TableStyle([("SPAN", (0, 0), (-1, 0)), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#12304A")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#E9F1F4")), ("BOX", (0, 0), (1, -1), 0.5, colors.HexColor("#C9D8DF")), ("INNERGRID", (0, 1), (1, -1), 0.3, colors.HexColor("#DCE6EA")), ("BACKGROUND", (0, -1), (1, -1), colors.HexColor("#DDEEF2")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story.append(summary)
    if customer.get("notes"):
        story += [Spacer(1, 5 * mm), Paragraph(f"备注：{safe(customer.get('notes'))}", body)]
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("用法：generate_quotation_pdf.py input.json output.pdf")
    build(sys.argv[1], sys.argv[2])
