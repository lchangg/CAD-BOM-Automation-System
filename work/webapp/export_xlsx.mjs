import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "./spreadsheet-adapter.mjs";

const [, , inputPath, outputPath] = process.argv;
const { project, rows } = JSON.parse(await fs.readFile(inputPath, "utf8"));
const wb = Workbook.create(); const sheet = wb.worksheets.add("BOM审核"); sheet.showGridLines = false;
sheet.getRange("A1:M1").merge(); sheet.getRange("A1").values = [["配电系统 BOM"]]; sheet.getRange("A1:M1").format = { fill: "#12304A", font: { name: "Arial", size: 16, bold: true, color: "#FFFFFF" }, rowHeight: 28 };
sheet.getRange("A2:M2").merge(); sheet.getRange("A2").values = [[`项目：${project}；来源：本地 DWG 解析流程`]]; sheet.getRange("A2:M2").format = { font: { name: "Arial", size: 10, italic: true, color: "#475569" } };
const headers = ["柜体", "材料类别", "规格", "数量", "品牌", "型号", "采购价格", "匹配状态", "审核状态", "原始文字", "来源坐标", "识别规则", "人工备注"];
sheet.getRange("A4:M4").values = [headers]; sheet.getRange("A4:M4").format = { fill: "#1F6F8B", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" }, wrapText: true };
const values = (rows || []).map(r => { const matchStatus = r.price_id ? "已匹配价格" : (r.brand_id || r.product_id ? "已选择品牌" : "未选择品牌"); const price = r.price_value !== undefined && r.price_value !== null && r.price_value !== "" ? `${r.price_value} ${r.price_currency || "CNY"}` : ""; return [r.cabinet || "", r.category || "", r.spec || "", Number(r.quantity || 0), r.brand_name || "", r.product_model || "", price, matchStatus, r.status || "AI识别", (r.rawTexts || []).join("\n"), (r.coords || []).map(p => `(${Number(p.x).toFixed(3)}, ${Number(p.y).toFixed(3)})`).join("\n"), (r.rules || []).join("；"), r.note || ""]; });
if (values.length) { sheet.getRange(`A5:M${4 + values.length}`).values = values; sheet.getRange(`A5:M${4 + values.length}`).format = { font: { name: "Arial", size: 10, color: "#1F2937" }, wrapText: true, verticalAlignment: "center" }; sheet.tables.add(`A4:M${4 + values.length}`, true, "BOMReview").style = "TableStyleMedium2"; }
sheet.freezePanes.freezeRows(4); [26, 16, 24, 9, 16, 20, 16, 16, 14, 34, 38, 34, 24].forEach((w, i) => sheet.getRangeByIndexes(0, i, Math.max(5, values.length + 4), 1).format.columnWidth = w);
wb.recalculate(); const out = await SpreadsheetFile.exportXlsx(wb); await out.save(outputPath); console.log(outputPath);
