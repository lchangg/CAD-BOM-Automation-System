// Public spreadsheet adapter backed by ExcelJS.
// It keeps the small workbook surface used by the existing scripts while
// using only the public ExcelJS dependency.
import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const ExcelWorkbook = ExcelJS.Workbook;

function columnNumber(value) {
  let result = 0;
  for (const char of String(value).toUpperCase()) result = result * 26 + char.charCodeAt(0) - 64;
  return result;
}

function columnName(number) {
  let value = Number(number);
  let result = "";
  while (value > 0) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26); }
  return result;
}

function parseAddress(address) {
  const match = String(address).replace(/\$/g, "").match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
  if (!match) throw new Error(`Invalid worksheet range: ${address}`);
  return { startRow: Number(match[2]), startColumn: columnNumber(match[1]), endRow: Number(match[4] || match[2]), endColumn: columnNumber(match[3] || match[1]) };
}

function argb(value) {
  const text = String(value || "");
  if (/^#[0-9a-f]{6}$/i.test(text)) return `FF${text.slice(1).toUpperCase()}`;
  if (/^[0-9a-f]{8}$/i.test(text)) return text.toUpperCase();
  return text.replace(/^#/, "").toUpperCase();
}

function fontValue(value = {}) {
  const result = {};
  if (value.name) result.name = value.name;
  if (value.size) result.size = value.size;
  if (value.bold !== undefined) result.bold = Boolean(value.bold);
  if (value.italic !== undefined) result.italic = Boolean(value.italic);
  if (value.underline !== undefined) result.underline = value.underline;
  if (value.color) result.color = { argb: argb(value.color) };
  return result;
}

function borderValue(value = {}) {
  const result = {};
  for (const [side, spec] of Object.entries(value)) {
    if (!spec || typeof spec !== "object") continue;
    result[side] = { style: spec.style || "thin", color: { argb: argb(spec.color || "#D9E2F3") } };
  }
  return result;
}

function cellValue(cell) {
  const value = cell.value;
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) return value.result;
  if (value && typeof value === "object" && Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
  return value ?? "";
}

class FormatProxy {
  constructor(range) { this.range = range; }
  set rowHeight(value) { this.range.applyFormat({ rowHeight: value }); }
  set columnWidth(value) { this.range.applyFormat({ columnWidth: value }); }
  set wrapText(value) { this.range.applyFormat({ wrapText: value }); }
  set horizontalAlignment(value) { this.range.applyFormat({ horizontalAlignment: value }); }
  set verticalAlignment(value) { this.range.applyFormat({ verticalAlignment: value }); }
  set numberFormat(value) { this.range.applyFormat({ numberFormat: value }); }
  set font(value) { this.range.applyFormat({ font: value }); }
  set fill(value) { this.range.applyFormat({ fill: value }); }
  set borders(value) { this.range.applyFormat({ borders: value }); }
}

class Range {
  constructor(sheet, address) { this.sheet = sheet; this.address = address; this.bounds = parseAddress(address); }
  get cells() {
    const cells = [];
    for (let row = this.bounds.startRow; row <= this.bounds.endRow; row += 1) for (let column = this.bounds.startColumn; column <= this.bounds.endColumn; column += 1) cells.push(this.sheet.native.getCell(row, column));
    return cells;
  }
  get rows() { return Array.from({ length: this.bounds.endRow - this.bounds.startRow + 1 }, (_, i) => this.bounds.startRow + i); }
  get columns() { return Array.from({ length: this.bounds.endColumn - this.bounds.startColumn + 1 }, (_, i) => this.bounds.startColumn + i); }
  get values() {
    return this.rows.map((row) => this.columns.map((column) => cellValue(this.sheet.native.getCell(row, column))));
  }
  set values(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    for (let r = 0; r < this.rows.length; r += 1) for (let c = 0; c < this.columns.length; c += 1) this.sheet.native.getCell(this.rows[r], this.columns[c]).value = rows[r]?.[c] ?? null;
  }
  set formulas(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    for (let r = 0; r < this.rows.length; r += 1) for (let c = 0; c < this.columns.length; c += 1) {
      const formula = rows[r]?.[c];
      if (formula) this.sheet.native.getCell(this.rows[r], this.columns[c]).value = { formula: String(formula).replace(/^=/, "") };
    }
  }
  get format() { return new FormatProxy(this); }
  set format(value) { this.applyFormat(value || {}); }
  applyFormat(value = {}) {
    const rows = this.rows;
    const columns = this.columns;
    for (const row of rows) {
      const rowObject = this.sheet.native.getRow(row);
      if (value.rowHeight !== undefined) rowObject.height = value.rowHeight;
    }
    for (const column of columns) if (value.columnWidth !== undefined) this.sheet.native.getColumn(column).width = value.columnWidth;
    for (const cell of this.cells) {
      if (value.font) cell.font = { ...cell.font, ...fontValue(value.font) };
      if (value.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(value.fill) } };
      if (value.horizontalAlignment || value.verticalAlignment || value.wrapText !== undefined) cell.alignment = { ...cell.alignment, ...(value.horizontalAlignment ? { horizontal: value.horizontalAlignment } : {}), ...(value.verticalAlignment ? { vertical: value.verticalAlignment } : {}), ...(value.wrapText !== undefined ? { wrapText: Boolean(value.wrapText) } : {}) };
      if (value.numberFormat) cell.numFmt = value.numberFormat;
      if (value.borders) cell.border = { ...cell.border, ...borderValue(value.borders) };
    }
  }
  merge() { this.sheet.native.mergeCells(this.address); }
}

class TableWrapper {
  constructor(table) { this.native = table; }
  set style(value) { this.native.style = { theme: value, showRowStripes: true, showFirstColumn: false, showLastColumn: false, showColumnStripes: false }; }
  set showFilterButton(_value) {}
}

class TableCollection {
  constructor(sheet) { this.sheet = sheet; }
  add(address, hasHeaders = true, name = `Table${this.sheet.native.tables.length + 1}`) {
    const bounds = parseAddress(address);
    const headers = hasHeaders ? this.sheet.getRange(address).values[0].map((value, index) => String(value || `Column${index + 1}`)) : [];
    const rows = hasHeaders ? this.sheet.getRange(address).values.slice(1) : this.sheet.getRange(address).values;
    const table = this.sheet.native.addTable({ name, ref: address, headerRow: hasHeaders, style: { theme: "TableStyleMedium2", showRowStripes: true }, columns: headers.map((name) => ({ name })), rows });
    return new TableWrapper(table);
  }
}

class FreezePanes {
  constructor(sheet) { this.sheet = sheet; }
  freezeRows(count) { this.sheet.native.views = [{ state: "frozen", ySplit: Number(count) }]; }
}

class Worksheet {
  constructor(workbook, native, index) { this.workbook = workbook; this.native = native; this.index = index; this.freezePanes = new FreezePanes(this); this.tables = new TableCollection(this); }
  get name() { return this.native.name; }
  get showGridLines() { return this.native.views?.[0]?.showGridLines !== false; }
  set showGridLines(value) { this.native.views = [{ ...(this.native.views?.[0] || {}), showGridLines: Boolean(value) }]; }
  get tabColor() { return this.native.properties.tabColor; }
  set tabColor(value) { this.native.properties.tabColor = { argb: argb(value) }; }
  getRange(address) { return new Range(this, address); }
  getRangeByIndexes(rowIndex, columnIndex, rowCount, columnCount) { return new Range(this, `${columnName(columnIndex + 1)}${rowIndex + 1}:${columnName(columnIndex + columnCount)}${rowIndex + rowCount}`); }
  getUsedRange(_valuesOnly = false) {
    if (!this.native.actualRowCount || !this.native.actualColumnCount) return null;
    return this.getRange(`${columnName(this.native.actualColumnCount)}${this.native.actualRowCount}`.replace(/^/, `A1:`));
  }
}

class WorksheetCollection {
  constructor(workbook) { this.workbook = workbook; }
  add(name) { return new Worksheet(this.workbook, this.workbook.native.addWorksheet(name), this.workbook.native.worksheets.length - 1); }
  get items() { return this.workbook.native.worksheets.map((sheet, index) => new Worksheet(this.workbook, sheet, index)); }
  getItemAt(index) { const sheet = this.workbook.native.worksheets[index]; return sheet ? new Worksheet(this.workbook, sheet, index) : null; }
  getItem(name) { const sheet = this.workbook.native.getWorksheet(name); return sheet ? new Worksheet(this.workbook, sheet, this.workbook.native.worksheets.indexOf(sheet)) : null; }
}

class Workbook {
  constructor(native = new ExcelWorkbook()) { this.native = native; this.worksheets = new WorksheetCollection(this); }
  static create() { return new Workbook(); }
  async load(buffer) { await this.native.xlsx.load(buffer); return this; }
  recalculate() {}
  async inspect({ sheetId, range, maxChars = 5000 } = {}) {
    const sheets = sheetId ? [this.worksheets.getItem(sheetId)] : this.worksheets.items;
    const payload = sheets.filter(Boolean).map((sheet) => ({ sheet: sheet.name, values: (range ? sheet.getRange(range) : sheet.getUsedRange(true))?.values || [] }));
    return { ndjson: JSON.stringify(payload).slice(0, maxChars) };
  }
  async render() {
    const transparentPng = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
    return { arrayBuffer: async () => transparentPng.buffer.slice(transparentPng.byteOffset, transparentPng.byteOffset + transparentPng.byteLength) };
  }
}

class FileBlob {
  constructor(data) { this.data = data; }
  static async load(filePath) { return new FileBlob(await fs.readFile(filePath)); }
}

const SpreadsheetFile = {
  async importXlsx(blob) { const workbook = new Workbook(); await workbook.load(blob.data); return workbook; },
  async exportXlsx(workbook) { return { save: async (filePath) => { await fs.mkdir(path.dirname(filePath), { recursive: true }); await workbook.native.xlsx.writeFile(filePath); } }; },
};

export { FileBlob, SpreadsheetFile, Workbook };
