import { FileBlob, SpreadsheetFile } from "./webapp/spreadsheet-adapter.mjs";
const path = `${process.cwd()}/outputs/dwg_bom.xlsx`;
const book = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
const summary = await book.inspect({ kind: "workbook,sheet,table", maxChars: 6000, tableMaxRows: 6, tableMaxCols: 8, tableMaxCellChars: 100 });
console.log(summary.ndjson);
const main = await book.inspect({ kind: "table", sheetId: "BOM汇总", range: "A1:H15", include: "values,formulas", tableMaxRows: 15, tableMaxCols: 8, tableMaxCellChars: 120 });
console.log(main.ndjson);
const detail = await book.inspect({ kind: "table", sheetId: "来源明细", range: "A1:L5", include: "values,formulas", tableMaxRows: 5, tableMaxCols: 12, tableMaxCellChars: 100 });
console.log(detail.ndjson);
