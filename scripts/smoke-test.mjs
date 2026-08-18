// Smoke test for the parts that run before anything is sent: header detection,
// recipient filtering, and placeholder substitution. No network, no API key.
//   node scripts/smoke-test.mjs
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseWorkbook, detectColumns, buildRecipients } from '../src/lib/excel.js';
import { personalize } from '../src/lib/personalize.js';
import { PLACEHOLDER, FALLBACK_FIRST_NAME } from '../src/config.js';

const sheetFrom = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Clients');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
};

const load = (rows) => {
  const { sheets } = parseWorkbook(sheetFrom(rows));
  const sheet = sheets[0];
  const found = detectColumns(sheet.headers, sheet.rows);
  const built = buildRecipients(sheet.rows, found.firstNameIndex, found.emailIndex, sheet.firstDataRow);
  return { sheet, found, ...built };
};

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
};

test('detects "First Name" and "Email Address" headers', () => {
  const { found, recipients } = load([
    ['First Name', 'Last Name', 'Email Address'],
    ['Sara', 'Ahmadi', 'sara@example.com'],
    ['Tom', 'Reid', 'tom@example.com'],
  ]);
  assert.equal(found.firstNameIndex, 0);
  assert.equal(found.emailIndex, 2);
  assert.equal(found.emailSource, 'header');
  assert.deepEqual(recipients.map((r) => r.email), ['sara@example.com', 'tom@example.com']);
  assert.equal(recipients[0].rowNumber, 2);
});

test('handles fname / e-mail spelling variants', () => {
  const { found } = load([
    ['fname', 'e-mail'],
    ['Jo', 'jo@example.com'],
  ]);
  assert.equal(found.firstNameIndex, 0);
  assert.equal(found.emailIndex, 1);
});

test('prefers "First Name" over a generic "Name" column', () => {
  const { found } = load([
    ['Name', 'First Name', 'Email'],
    ['Sara Ahmadi', 'Sara', 'sara@example.com'],
  ]);
  assert.equal(found.firstNameIndex, 1);
});

test('skips a title row above the real header', () => {
  const { sheet, recipients } = load([
    ['2026 Client Export'],
    [],
    ['First Name', 'Email'],
    ['Ana', 'ana@example.com'],
  ]);
  assert.deepEqual(sheet.headers, ['First Name', 'Email']);
  assert.equal(recipients.length, 1);
});

test('falls back to sniffing the data when no header says "email"', () => {
  const { found, recipients } = load([
    ['Client', 'Contact'],
    ['Ana', 'ana@example.com'],
    ['Ben', 'ben@example.com'],
    ['Cal', 'cal@example.com'],
  ]);
  assert.equal(found.emailSource, 'content');
  assert.equal(found.emailIndex, 1);
  assert.equal(recipients.length, 3);
});

test('filters blank, malformed, and duplicate addresses', () => {
  const { recipients, skipped } = load([
    ['First Name', 'Email'],
    ['Ana', 'ana@example.com'],
    ['Ben', ''],
    ['Cal', 'not-an-email'],
    ['Dee', 'dee@example'],
    ['Ana again', 'ANA@example.com'],
    ['Eve', 'eve@example.co.uk'],
  ]);
  assert.deepEqual(recipients.map((r) => r.email), ['ana@example.com', 'eve@example.co.uk']);
  assert.deepEqual(skipped.map((s) => s.reason), [
    'No email address',
    'Malformed email address',
    'Malformed email address',
    'Duplicate of row 2',
  ]);
});

test('unwraps display-name and mailto: forms', () => {
  const { recipients } = load([
    ['First Name', 'Email'],
    ['Ana', 'Ana Reyes <ana@example.com>'],
    ['Ben', 'mailto:ben@example.com'],
    ['Cal', 'cal@example.com; old@example.com'],
  ]);
  assert.deepEqual(recipients.map((r) => r.email), [
    'ana@example.com',
    'ben@example.com',
    'cal@example.com',
  ]);
});

test('substitutes the first name into the template', () => {
  const html = personalize('Sara');
  assert.ok(html.includes('Hi Sara,'), 'greeting is personalized');
  assert.ok(!html.includes(PLACEHOLDER), 'no placeholder token survives');
  assert.ok(html.includes('New office.'), 'template body intact');
});

test('blank names fall back to a neutral greeting', () => {
  assert.ok(personalize('   ').includes(`Hi ${FALLBACK_FIRST_NAME},`));
});

console.log(`\n${passed} passed`);
