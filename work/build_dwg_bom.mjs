import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "./webapp/spreadsheet-adapter.mjs";

const root = process.cwd();
const inputPath = `${root}/outputs/device_candidate_validation.json`;
const outputDir = `${root}/outputs`;
const outputXlsx = `${outputDir}/dwg_bom.xlsx`;
const outputJson = `${outputDir}/dwg_bom.json`;
const previewPath = `${root}/work/dwg_bom_preview.png`;
const detailPreviewPath = `${root}/work/dwg_bom_detail_preview.png`;

const source = JSON.parse(await fs.readFile(inputPath, "utf8"));
const project = source.项目?.[0] ?? { 项目名: "未命名项目", 柜体: [] };

// Merge only identical candidate material keys within each cabinet.
const cabinetResults = [];
const bomRows = [];
const detailRows = [];
let serial = 1;
for (const cabinet of project.柜体 ?? []) {
  const merged = new Map();
  for (const candidate of cabinet.材料候选 ?? []) {
    const key = `${candidate.标准名称}\u0000${candidate.规格 ?? ""}`;
    if (!merged.has(key)) {
      merged.set(key, {
        柜名称: cabinet.柜名称,
        类别: candidate.标准名称,
        规格: candidate.规格 ?? "",
        数量: 0,
        原始文字列表: [],
        来源坐标列表: [],
        识别规则集合: new Set(),
      });
    }
    const row = merged.get(key);
    row.数量 += Number(candidate.数量 ?? 1);
    row.原始文字列表.push(candidate.原始文字);
    row.来源坐标列表.push(candidate.坐标);
    row.识别规则集合.add(candidate.识别规则);
    detailRows.push([
      cabinet.柜名称,
      candidate.类别 ?? "A-材料候选",
      candidate.标准名称,
      candidate.规格 ?? "",
      Number(candidate.数量 ?? 1),
      candidate.原始文字,
      candidate.坐标?.x ?? null,
      candidate.坐标?.y ?? null,
      candidate.坐标?.z ?? 0,
      candidate.识别规则,
      candidate.图层 ?? "",
      candidate.来源对象类型 ?? "",
    ]);
  }
  const mergedRows = [...merged.values()].map((row) => ({
    柜名称: row.柜名称,
    类别: row.类别,
    规格: row.规格,
    数量: row.数量,
    原始文字列表: row.原始文字列表,
    来源坐标列表: row.来源坐标列表,
    识别规则: [...row.识别规则集合],
  }));
  cabinetResults.push({ 柜名称: cabinet.柜名称, BOM: mergedRows });
  for (const row of mergedRows) {
    bomRows.push([
      serial++,
      row.柜名称,
      row.类别,
      row.规格,
      row.数量,
      row.原始文字列表.join("\n"),
      row.来源坐标列表.map((p) => `(${Number(p.x).toFixed(3)}, ${Number(p.y).toFixed(3)}, ${Number(p.z ?? 0).toFixed(3)})`).join("\n"),
      row.识别规则.join("；"),
    ]);
  }
}

const mergedResult = {
  项目: [{ 项目名: project.项目名, 柜体: cabinetResults }],
  说明: "每个柜体内按标准名称+规格合并；不含价格、库存和经验补料。每个项目保留原始文字列表、来源坐标列表和识别规则。",
};
await fs.writeFile(outputJson, JSON.stringify(mergedResult, null, 2), "utf8");

const workbook = Workbook.create();
const bomSheet = workbook.worksheets.add("BOM汇总");
const detailSheet = workbook.worksheets.add("来源明细");
for (const sheet of [bomSheet, detailSheet]) {
  sheet.showGridLines = false;
  sheet.tabColor = "#1F4E78";
}

const fontFamily = "Arial";
const titleFill = "#1F4E78";
const headerFill = "#2F75B5";
const lightBlue = "#D9EAF7";
const bodyFont = { name: fontFamily, size: 10, color: "#1F2937" };

// Main output sheet.
bomSheet.getRange("A1:H1").merge();
bomSheet.getRange("A1").values = [["配电系统 BOM（按柜体合并）"]];
bomSheet.getRange("A1:H1").format = { font: { name: fontFamily, size: 16, bold: true, color: "#FFFFFF" }, fill: titleFill, horizontalAlignment: "left", verticalAlignment: "center" };
bomSheet.getRange("A1:H1").format.rowHeight = 28;
bomSheet.getRange("A2:H2").merge();
bomSheet.getRange("A2").values = [[`项目：${project.项目名}；来源：第三阶段设备候选识别；不含价格、库存和经验补料。`]];
bomSheet.getRange("A2:H2").format = { font: { name: fontFamily, size: 10, italic: true, color: "#4B5563" }, horizontalAlignment: "left" };
bomSheet.getRange("A4:B6").values = [
  ["柜体数量", cabinetResults.length],
  ["合并后 BOM 行数", bomRows.length],
  ["候选材料总数量", bomRows.reduce((s, r) => s + Number(r[4] || 0), 0)],
];
bomSheet.getRange("A4:A6").format = { fill: lightBlue, font: { name: fontFamily, size: 10, bold: true, color: "#1F2937" } };
bomSheet.getRange("B4:B6").format = { font: bodyFont, horizontalAlignment: "right", numberFormat: "#,##0" };

const bomHeaders = ["序号", "柜名称", "类别", "规格", "数量", "原始文字列表", "来源坐标列表", "识别规则"];
bomSheet.getRange("A8:H8").values = [bomHeaders];
bomSheet.getRange("A8:H8").format = { fill: headerFill, font: { name: fontFamily, size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
if (bomRows.length) {
  bomSheet.getRange(`A9:H${8 + bomRows.length}`).values = bomRows;
  bomSheet.getRange(`A9:H${8 + bomRows.length}`).format = { font: bodyFont, verticalAlignment: "center", wrapText: true, borders: { insideHorizontal: { style: "thin", color: "#D9E2F3" }, bottom: { style: "thin", color: "#D9E2F3" } } };
  bomSheet.getRange(`A9:A${8 + bomRows.length}`).format.horizontalAlignment = "right";
  bomSheet.getRange(`E9:E${8 + bomRows.length}`).format = { numberFormat: "#,##0", horizontalAlignment: "right", verticalAlignment: "center", wrapText: true };
  bomSheet.getRange(`F9:H${8 + bomRows.length}`).format.wrapText = true;
  const bomTable = bomSheet.tables.add(`A8:H${8 + bomRows.length}`, true, "BOMTable");
  bomTable.style = "TableStyleMedium2";
  bomTable.showFilterButton = true;
}
bomSheet.freezePanes.freezeRows(8);
const bomWidths = [7, 28, 14, 24, 9, 34, 48, 34];
bomWidths.forEach((width, i) => bomSheet.getRangeByIndexes(0, i, Math.max(9, 8 + bomRows.length), 1).format.columnWidth = width);
bomSheet.getRange("A1:H2").format.wrapText = true;

// Source-detail sheet keeps one row per original candidate for auditability.
const detailHeaders = ["柜名称", "候选类别", "标准名称", "规格", "数量", "原始文字", "X", "Y", "Z", "识别规则", "图层", "来源对象类型"];
detailSheet.getRange("A1:L1").values = [detailHeaders];
detailSheet.getRange("A1:L1").format = { fill: headerFill, font: { name: fontFamily, size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
if (detailRows.length) {
  detailSheet.getRange(`A2:L${1 + detailRows.length}`).values = detailRows;
  detailSheet.getRange(`A2:L${1 + detailRows.length}`).format = { font: bodyFont, verticalAlignment: "center", wrapText: true, borders: { insideHorizontal: { style: "thin", color: "#D9E2F3" }, bottom: { style: "thin", color: "#D9E2F3" } } };
  detailSheet.getRange(`E2:E${1 + detailRows.length}`).format = { numberFormat: "#,##0", horizontalAlignment: "right", verticalAlignment: "center", wrapText: true };
  detailSheet.getRange(`G2:I${1 + detailRows.length}`).format = { numberFormat: "0.000", horizontalAlignment: "right", verticalAlignment: "center", wrapText: true };
  const detailTable = detailSheet.tables.add(`A1:L${1 + detailRows.length}`, true, "SourceDetailTable");
  detailTable.style = "TableStyleMedium2";
  detailTable.showFilterButton = true;
}
detailSheet.freezePanes.freezeRows(1);
const detailWidths = [28, 16, 16, 26, 9, 32, 13, 13, 13, 34, 36, 16];
detailWidths.forEach((width, i) => detailSheet.getRangeByIndexes(0, i, Math.max(2, 1 + detailRows.length), 1).format.columnWidth = width);

workbook.recalculate();

const summaryCheck = await workbook.inspect({ kind: "table", sheetId: "BOM汇总", range: `A1:H${Math.min(20, 8 + bomRows.length)}`, include: "values,formulas", tableMaxRows: 20, tableMaxCols: 8, tableMaxCellChars: 160 });
console.log("SUMMARY_CHECK");
console.log(summaryCheck.ndjson);
const formulaErrors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" });
console.log("FORMULA_ERRORS");
console.log(formulaErrors.ndjson);

const preview = await workbook.render({ sheetName: "BOM汇总", range: `A1:H${Math.min(25, 8 + bomRows.length)}`, scale: 1, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
const detailPreview = await workbook.render({ sheetName: "来源明细", range: `A1:L${Math.min(25, 1 + detailRows.length)}`, scale: 1, format: "png" });
await fs.writeFile(detailPreviewPath, new Uint8Array(await detailPreview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputXlsx);
console.log(`EXPORTED ${outputXlsx}`);
console.log(`DETAIL_ROWS ${detailRows.length} BOM_ROWS ${bomRows.length}`);
