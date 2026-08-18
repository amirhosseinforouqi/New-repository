// Checks the lite .xlsx reader against SheetJS on real workbooks, so the much
// smaller parser is known to produce the same rows before it ships.
//   node scripts/parser-parity.mjs file.xlsx [more.xlsx ...]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { readXlsx, readCsv } from '../src/lib/xlsxLite.js';

/** Compare on trimmed values, ignoring trailing empty cells on a row. */
const norm = (rows) =>
  rows
    .map((r) => {
      const cells = r.map((c) => String(c ?? '').trim());
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      return cells;
    })
    .filter((r) => r.length > 0);

let checked = 0;

for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  const wb = XLSX.read(ab, { type: 'array' });
  const mine = readXlsx(ab);

  assert.deepEqual(mine.sheets.map((s) => s.name), wb.SheetNames, `${file}: sheet names`);

  wb.SheetNames.forEach((name, i) => {
    const ref = XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1, blankrows: false, defval: '', raw: false,
    });
    assert.deepEqual(norm(mine.sheets[i].rows), norm(ref), `${file} / ${name}: cell values`);
  });

  console.log(`  ok  ${file} — ${mine.sheets.length} sheet(s), ${norm(mine.sheets[0].rows).length} rows identical to SheetJS`);
  checked++;
}

const csv = readCsv('First Name,Email\r\n"Ahmadi, Sara",sara@example.com\r\n"He said ""hi""",b@example.com\r\n');
assert.deepEqual(csv.sheets[0].rows, [
  ['First Name', 'Email'],
  ['Ahmadi, Sara', 'sara@example.com'],
  ['He said "hi"', 'b@example.com'],
]);
console.log('  ok  csv quoting — embedded commas and doubled quotes');

console.log(`\n${checked} workbook(s) match SheetJS exactly`);
