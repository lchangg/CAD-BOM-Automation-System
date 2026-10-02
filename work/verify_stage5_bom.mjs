import { FileBlob, SpreadsheetFile } from "./webapp/spreadsheet-adapter.mjs";
const path = `${process.cwd()}/outputs/dwg_bom_stage5.xlsx`;
const book = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
const overview = await book.inspect({ kind: "workbook,sheet,table", maxChars: 5000, tableMaxRows: 5, tableMaxCols: 8, tableMaxCellChars: 100 });
console.log(overview.ndjson);
const main = await book.inspect({ kind: "table", sheetId: "BOM复核", range: "A1:P16", include: "values,formulas", tableMaxRows: 16, tableMaxCols: 16, tableMaxCellChars: 120 });
console.log(main.ndjson);
const rules = await book.inspect({ kind: "table", sheetId: "经验规则", range: "A1:G8", include: "values,formulas", tableMaxRows: 8, tableMaxCols: 7, tableMaxCellChars: 120 });
console.log(rules.ndjson);
