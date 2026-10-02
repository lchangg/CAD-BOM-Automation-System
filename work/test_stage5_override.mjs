import { FileBlob, SpreadsheetFile } from "./webapp/spreadsheet-adapter.mjs";
const path = `${process.cwd()}/outputs/dwg_bom_stage5.xlsx`;
const book = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
const sheet = book.worksheets.getItem("BOM复核");
sheet.getRange("G11:I11").values = [["人工类别", "人工规格", 2]];
sheet.getRange("F11").values = [["人工修改"]];
book.recalculate();
const check = await book.inspect({ kind: "table", sheetId: "BOM复核", range: "F11:L11", include: "values,formulas", tableMaxRows: 1, tableMaxCols: 7, tableMaxCellChars: 120 });
console.log(check.ndjson);
