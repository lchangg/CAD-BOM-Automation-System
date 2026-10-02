import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "./spreadsheet-adapter.mjs";

const outputPath = process.argv[2] || path.join(process.cwd(), "data", "master-data-import-template.xlsx");
await fs.mkdir(path.dirname(outputPath), { recursive: true });

const headers = [
  "数据类型", "编码", "名称", "类别", "单位", "说明", "品牌编码", "品牌名称", "型号", "规格",
  "材料编码", "材料名称", "供应商编码", "供应商名称", "单价", "币种", "有效期起", "有效期止",
  "联系人", "电话", "邮箱", "地址", "备注",
];
const workbook = Workbook.create();
const sheet = workbook.worksheets.add("导入数据");
sheet.showGridLines = false;
sheet.getRange("A1:W1").values = [headers];
sheet.getRange("A1:W1").format = { fill: "#1F6F8B", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" }, wrapText: true, verticalAlignment: "center" };
sheet.getRange("A1:W1").format.rowHeight = 28;
sheet.freezePanes.freezeRows(1);
const widths = [14, 18, 22, 16, 10, 28, 18, 20, 22, 24, 18, 20, 18, 22, 12, 10, 14, 14, 14, 16, 26, 28, 28];
widths.forEach((width, index) => sheet.getRangeByIndexes(0, index, 20, 1).format.columnWidth = width);

const guide = workbook.worksheets.add("填写说明");
guide.showGridLines = false;
guide.getRange("A1:D1").merge();
guide.getRange("A1").values = [["基础资料批量导入模板"]];
guide.getRange("A1:D1").format = { font: { name: "Arial", size: 15, bold: true, color: "#173A54" }, rowHeight: 28 };
guide.getRange("A3:D8").values = [
  ["数据类型", "必填字段", "关联规则", "说明"],
  ["brands（品牌）", "名称", "名称唯一", "编码、说明可选"],
  ["materials（材料）", "编码、名称", "编码唯一", "类别、单位、说明可选"],
  ["products（产品）", "型号、品牌编码/名称、材料编码/名称", "品牌+型号唯一", "规格、单位、说明可选；品牌和材料必须能匹配"],
  ["suppliers（供应商）", "名称", "名称唯一", "编码、联系人、电话、邮箱、地址可选"],
  ["prices（价格）", "型号、品牌编码/名称、供应商编码/名称、单价", "产品+供应商+有效期起唯一", "产品和供应商必须能匹配；单价必须是大于等于0的数字；币种默认为CNY"],
];
guide.getRange("A3:D3").format = { fill: "#1F6F8B", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" }, wrapText: true };
guide.getRange("A4:D8").format = { font: { name: "Arial", size: 10, color: "#1F2937" }, wrapText: true, verticalAlignment: "center" };
guide.getRange("A3:D8").format.borders = { preset: "all", style: "thin", color: "#D9E2E8" };
guide.getRange("A10:D13").values = [
  ["导入流程", "1. 在导入数据页逐行填写", "2. 网页选择文件并预览", "3. 检查错误后点击确认导入"],
  ["支持格式", ".xlsx 或 .csv", "CSV 请使用第一行作为表头", "不要修改表头名称"],
  ["错误处理", "错误行不会写入", "有效行可单独导入", "导入完成后会显示成功/失败汇总"],
  ["提示", "同一文件重复行会标记为重复", "已存在唯一键会标记为更新", "产品、价格的外键必须先匹配到对应资料"],
];
guide.getRange("A10:D13").format = { font: { name: "Arial", size: 10, color: "#475569" }, wrapText: true, verticalAlignment: "center" };
[30, 32, 42, 56].forEach((width, index) => guide.getRangeByIndexes(0, index, 15, 1).format.columnWidth = width);
guide.getRange("A3:D13").format.rowHeight = 25;

workbook.recalculate();
const inspection = await workbook.inspect({ kind: "workbook,sheet", maxChars: 2500 });
console.log(inspection);
const render = await workbook.render({ sheetName: "导入数据", autoCrop: "all", scale: 1, format: "png" });
const previewPath = path.join(path.dirname(outputPath), ".master-data-import-template-preview.png");
await fs.writeFile(previewPath, new Uint8Array(await render.arrayBuffer()));
const file = await SpreadsheetFile.exportXlsx(workbook);
await file.save(outputPath);
await fs.unlink(previewPath).catch(() => {});
console.log(outputPath);
