import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "./webapp/spreadsheet-adapter.mjs";

const root = process.cwd();
const outputDir = `${root}/outputs`;
const sourcePath = `${outputDir}/dwg_bom.json`;
const xlsxPath = `${outputDir}/dwg_bom_stage5.xlsx`;
const jsonPath = `${outputDir}/dwg_bom_stage5.json`;
const previewPath = `${root}/work/dwg_bom_stage5_preview.png`;
const expPreviewPath = `${root}/work/dwg_bom_stage5_experience_preview.png`;
const rulesPreviewPath = `${root}/work/dwg_bom_stage5_rules_preview.png`;

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const project = source.项目?.[0] ?? { 项目名: "未命名项目", 柜体: [] };

// These are intentionally disabled until a human approves the material and quantity.
const experienceRules = [
  {
    规则名称: "UPS输入输出柜经验补料（待确认）",
    适用柜类型: "柜名称包含 UPS 且包含 输入输出柜",
    触发条件: "标题命中 UPS + 输入输出柜",
    自动增加材料: [],
    需要人工确认: true,
    当前启用: false,
    说明: "暂不自动增加端子排、接地排或附件，避免把经验假设写入采购清单。",
  },
  {
    规则名称: "UPS列头柜经验补料（待确认）",
    适用柜类型: "柜名称包含 UPS 且包含 列头柜",
    触发条件: "标题命中 UPS + 列头柜",
    自动增加材料: [],
    需要人工确认: true,
    当前启用: false,
    说明: "暂不自动增加汇流排、端子或安装附件，等待现场经验规则确认。",
  },
  {
    规则名称: "配电系统图经验补料（待确认）",
    适用柜类型: "柜名称包含 配电系统图",
    触发条件: "标题命中 配电系统图",
    自动增加材料: [],
    需要人工确认: true,
    当前启用: false,
    说明: "当前只保留图纸材料，不自动推断辅材。",
  },
];

const drawingRows = [];
for (const cabinet of project.柜体 ?? []) {
  for (const item of cabinet.BOM ?? []) {
    drawingRows.push({
      柜名称: cabinet.柜名称,
      类别: item.类别,
      规格: item.规格,
      数量: Number(item.数量 ?? 0),
      状态: "AI识别",
      人工修正类别: "",
      人工修正规格: "",
      人工修正数量: "",
      原始文字列表: item.原始文字列表 ?? [],
      来源坐标列表: item.来源坐标列表 ?? [],
      识别规则: item.识别规则 ?? [],
      人工备注: "",
    });
  }
}

const stage5Json = {
  项目: [{
    项目名: project.项目名,
    图纸材料BOM: drawingRows,
    经验补充BOM: [],
  }],
  经验规则: experienceRules,
  状态说明: {
    AI识别: "来自第三阶段候选识别并进入当前图纸 BOM。",
    人工确认: "人工确认 AI 结果，无字段修改。",
    人工修改: "人工填写修正类别、规格或数量。",
    经验补充: "人工批准经验规则后，写入经验补充 BOM 区域。",
  },
};
await fs.writeFile(jsonPath, JSON.stringify(stage5Json, null, 2), "utf8");

const workbook = Workbook.create();
const bomSheet = workbook.worksheets.add("BOM复核");
const ruleSheet = workbook.worksheets.add("经验规则");
for (const sheet of [bomSheet, ruleSheet]) {
  sheet.showGridLines = false;
  sheet.tabColor = "#1F4E78";
}

const fontFamily = "Arial";
const titleFill = "#1F4E78";
const headerFill = "#2F75B5";
const lightBlue = "#D9EAF7";
const lightYellow = "#FFF2CC";
const lightGreen = "#E2F0D9";
const bodyFont = { name: fontFamily, size: 10, color: "#1F2937" };

// Main drawing BOM and manual correction fields.
bomSheet.getRange("A1:P1").merge();
bomSheet.getRange("A1").values = [["图纸材料 BOM（人工复核版）"]];
bomSheet.getRange("A1:P1").format = { font: { name: fontFamily, size: 16, bold: true, color: "#FFFFFF" }, fill: titleFill, horizontalAlignment: "left", verticalAlignment: "center" };
bomSheet.getRange("A1:P1").format.rowHeight = 28;
bomSheet.getRange("A2:P2").merge();
bomSheet.getRange("A2").values = [[`项目：${project.项目名}；图纸 BOM 与经验补充 BOM 分开；未加入价格、库存或经验补料。`]];
bomSheet.getRange("A2:P2").format = { font: { name: fontFamily, size: 10, italic: true, color: "#4B5563" }, horizontalAlignment: "left" };
bomSheet.getRange("A4:B8").values = [
  ["柜体数量", project.柜体?.length ?? 0],
  ["图纸 BOM 行数", drawingRows.length],
  ["AI识别材料数量", drawingRows.reduce((s, x) => s + x.数量, 0)],
  ["经验补充 BOM 行数", 0],
  ["经验规则数", experienceRules.length],
];
bomSheet.getRange("A4:A8").format = { fill: lightBlue, font: { name: fontFamily, size: 10, bold: true, color: "#1F2937" } };
bomSheet.getRange("B4:B8").format = { font: bodyFont, horizontalAlignment: "right", numberFormat: "#,##0" };

const mainHeaders = ["序号", "柜名称", "类别（AI）", "规格（AI）", "数量（AI）", "状态", "人工修正类别", "人工修正规格", "人工修正数量", "最终类别", "最终规格", "最终数量", "原始文字列表", "来源坐标列表", "识别规则", "人工备注"];
bomSheet.getRange("A10:P10").values = [mainHeaders];
bomSheet.getRange("A10:P10").format = { fill: headerFill, font: { name: fontFamily, size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };

const mainValues = drawingRows.map((row, i) => [
  i + 1,
  row.柜名称,
  row.类别,
  row.规格,
  row.数量,
  row.状态,
  row.人工修正类别,
  row.人工修正规格,
  row.人工修正数量,
  null,
  null,
  null,
  row.原始文字列表.join("\n"),
  row.来源坐标列表.map((p) => `(${Number(p.x).toFixed(3)}, ${Number(p.y).toFixed(3)}, ${Number(p.z ?? 0).toFixed(3)})`).join("\n"),
  row.识别规则.join("；"),
  row.人工备注,
]);
if (mainValues.length) {
  bomSheet.getRange(`A11:P${10 + mainValues.length}`).values = mainValues;
  const end = 10 + mainValues.length;
  bomSheet.getRange(`J11:J${end}`).formulas = mainValues.map((_, i) => [`=IF(G${11 + i}="",C${11 + i},G${11 + i})`]);
  bomSheet.getRange(`K11:K${end}`).formulas = mainValues.map((_, i) => [`=IF(H${11 + i}="",D${11 + i},H${11 + i})`]);
  bomSheet.getRange(`L11:L${end}`).formulas = mainValues.map((_, i) => [`=IF(I${11 + i}="",E${11 + i},I${11 + i})`]);
  bomSheet.getRange(`A11:P${end}`).format = { font: bodyFont, verticalAlignment: "center", wrapText: true, borders: { insideHorizontal: { style: "thin", color: "#D9E2F3" }, bottom: { style: "thin", color: "#D9E2F3" } } };
  bomSheet.getRange(`F11:F${end}`).format = { fill: lightBlue, font: bodyFont, verticalAlignment: "center", wrapText: true };
  bomSheet.getRange(`G11:I${end}`).format = { fill: lightYellow, font: bodyFont, verticalAlignment: "center", wrapText: true };
  bomSheet.getRange(`J11:L${end}`).format = { fill: lightGreen, font: bodyFont, verticalAlignment: "center", wrapText: true };
  bomSheet.getRange(`E11:E${end}`).format.numberFormat = "#,##0";
  bomSheet.getRange(`I11:I${end}`).format.numberFormat = "#,##0";
  bomSheet.getRange(`L11:L${end}`).format.numberFormat = "#,##0";
  bomSheet.getRange(`A11:A${end}`).format.horizontalAlignment = "right";
  bomSheet.getRange(`E11:E${end}`).format.horizontalAlignment = "right";
  bomSheet.getRange(`I11:I${end}`).format.horizontalAlignment = "right";
  bomSheet.getRange(`L11:L${end}`).format.horizontalAlignment = "right";
  bomSheet.getRange(`F11:F${end}`).dataValidation = { rule: { type: "list", values: ["AI识别", "人工确认", "人工修改", "经验补充"] } };
  const mainTable = bomSheet.tables.add(`A10:P${end}`, true, "Stage5DrawingBomTable");
  mainTable.style = "TableStyleMedium2";
  mainTable.showFilterButton = true;
}

const expTitleRow = 13 + mainValues.length;
bomSheet.getRange(`A${expTitleRow}:P${expTitleRow}`).merge();
bomSheet.getRange(`A${expTitleRow}`).values = [["经验补充 BOM"]];
bomSheet.getRange(`A${expTitleRow}:P${expTitleRow}`).format = { fill: "#7F6000", font: { name: fontFamily, size: 13, bold: true, color: "#FFFFFF" }, horizontalAlignment: "left" };
bomSheet.getRange(`A${expTitleRow + 1}:P${expTitleRow + 1}`).merge();
bomSheet.getRange(`A${expTitleRow + 1}`).values = [["当前没有已批准的自动经验补料。经验规则均需人工确认后，才可在此区域新增材料。"]];
bomSheet.getRange(`A${expTitleRow + 1}:P${expTitleRow + 1}`).format = { font: { name: fontFamily, size: 10, italic: true, color: "#7F6000" }, fill: "#FFF2CC", horizontalAlignment: "left" };
const expHeaderRow = expTitleRow + 3;
bomSheet.getRange(`A${expHeaderRow}:G${expHeaderRow}`).values = [["柜名称", "类别", "规格", "数量", "状态", "触发规则", "人工确认备注"]];
bomSheet.getRange(`A${expHeaderRow}:G${expHeaderRow}`).format = { fill: headerFill, font: { name: fontFamily, size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
bomSheet.getRange(`A${expHeaderRow + 1}:G${expHeaderRow + 1}`).values = [["（空）", "", "", null, "经验补充", "暂无已批准规则", ""]];
bomSheet.getRange(`A${expHeaderRow + 1}:G${expHeaderRow + 1}`).format = { font: { name: fontFamily, size: 10, italic: true, color: "#7F6000" }, fill: "#FFF2CC", verticalAlignment: "center", wrapText: true };

bomSheet.freezePanes.freezeRows(10);
const mainWidths = [7, 28, 14, 24, 10, 13, 18, 24, 14, 14, 24, 12, 34, 48, 34, 24];
mainWidths.forEach((width, i) => bomSheet.getRangeByIndexes(0, i, Math.max(12, expHeaderRow + 1), 1).format.columnWidth = width);

// Experience rules sheet.
ruleSheet.getRange("A1:G1").merge();
ruleSheet.getRange("A1").values = [["经验规则与人工确认"]];
ruleSheet.getRange("A1:G1").format = { font: { name: fontFamily, size: 15, bold: true, color: "#FFFFFF" }, fill: titleFill, horizontalAlignment: "left" };
ruleSheet.getRange("A2:G2").merge();
ruleSheet.getRange("A2").values = [["规则只做候选触发，不会自动写入经验补充 BOM；确认后再启用。"]];
ruleSheet.getRange("A2:G2").format = { font: { name: fontFamily, size: 10, italic: true, color: "#4B5563" }, horizontalAlignment: "left" };
const ruleHeaders = ["规则名称", "适用柜类型", "触发条件", "自动增加材料", "需要人工确认", "当前启用", "说明"];
ruleSheet.getRange("A4:G4").values = [ruleHeaders];
ruleSheet.getRange("A4:G4").format = { fill: headerFill, font: { name: fontFamily, size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
const ruleValues = experienceRules.map((r) => [r.规则名称, r.适用柜类型, r.触发条件, JSON.stringify(r.自动增加材料, null, 0), r.需要人工确认 ? "是" : "否", r.当前启用 ? "是" : "否", r.说明]);
ruleSheet.getRange(`A5:G${4 + ruleValues.length}`).values = ruleValues;
ruleSheet.getRange(`A5:G${4 + ruleValues.length}`).format = { font: bodyFont, verticalAlignment: "center", wrapText: true, borders: { insideHorizontal: { style: "thin", color: "#D9E2F3" }, bottom: { style: "thin", color: "#D9E2F3" } } };
ruleSheet.getRange(`E5:F${4 + ruleValues.length}`).format = { fill: lightYellow, font: bodyFont, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
const ruleTable = ruleSheet.tables.add(`A4:G${4 + ruleValues.length}`, true, "ExperienceRulesTable");
ruleTable.style = "TableStyleMedium2";
ruleTable.showFilterButton = true;
ruleSheet.freezePanes.freezeRows(4);
[30, 28, 28, 24, 14, 12, 48].forEach((width, i) => ruleSheet.getRangeByIndexes(0, i, 4 + ruleValues.length, 1).format.columnWidth = width);

workbook.recalculate();
const mainCheck = await workbook.inspect({ kind: "table", sheetId: "BOM复核", range: `A1:P${Math.min(22, 10 + mainValues.length)}`, include: "values,formulas", tableMaxRows: 22, tableMaxCols: 16, tableMaxCellChars: 120 });
console.log("STAGE5_CHECK");
console.log(mainCheck.ndjson);
const formulaErrors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 100 }, summary: "stage5 formula error scan" });
console.log("FORMULA_ERRORS");
console.log(formulaErrors.ndjson);
const preview = await workbook.render({ sheetName: "BOM复核", range: `A1:P${Math.min(24, 10 + mainValues.length)}`, scale: 1, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
const expPreview = await workbook.render({ sheetName: "BOM复核", range: `A${Math.max(1, expTitleRow - 2)}:P${expHeaderRow + 1}`, scale: 1, format: "png" });
await fs.writeFile(expPreviewPath, new Uint8Array(await expPreview.arrayBuffer()));
const rulesPreview = await workbook.render({ sheetName: "经验规则", range: "A1:G8", scale: 1, format: "png" });
await fs.writeFile(rulesPreviewPath, new Uint8Array(await rulesPreview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(xlsxPath);
console.log(`EXPORTED ${xlsxPath}`);
console.log(`DRAWING_ROWS ${drawingRows.length} EXPERIENCE_ROWS 0 RULES ${experienceRules.length}`);
