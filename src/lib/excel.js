import { readXlsx, readCsv } from './xlsxLite.js';
import {
  FIRST_NAME_PATTERNS,
  LAST_NAME_PATTERNS,
  FULL_NAME_PATTERNS,
  EMAIL_PATTERNS,
} from '../config.js';

/** Deliberately permissive but structural: one @, a dot-bearing domain, no spaces. */
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[A-Za-z]{2,}$/;

export function isValidEmail(value) {
  return EMAIL_RE.test(String(value ?? '').trim());
}

/** Pull the address out of `Jane Doe <jane@x.com>`, `mailto:…`, or a bare address. */
export function normalizeEmail(value) {
  let s = String(value ?? '').trim();
  const angled = s.match(/<([^>]+)>/);
  if (angled) s = angled[1].trim();
  s = s.replace(/^mailto:/i, '').trim();
  // Some lists pack several addresses into one cell; take the first.
  const first = s.split(/[,;]/)[0].trim();
  return first;
}

const cell = (v) => String(v ?? '').trim();

/**
 * Find the header row. Sheets exported from a CRM often lead with a title or a
 * blank line, so scan the first few rows for one that looks like column labels.
 */
function findHeaderRow(matrix) {
  const limit = Math.min(matrix.length, 10);
  for (let i = 0; i < limit; i++) {
    const row = matrix[i] || [];
    const filled = row.filter((c) => cell(c) !== '');
    if (filled.length < 2) continue;
    const looksLabelled = filled.some((c) =>
      [...FIRST_NAME_PATTERNS, ...EMAIL_PATTERNS].some((p) => p.test(cell(c))),
    );
    if (looksLabelled) return i;
  }
  return matrix.findIndex((row) => (row || []).some((c) => cell(c) !== ''));
}

/** Parse an .xlsx or .csv ArrayBuffer into one entry per sheet. */
export function parseWorkbook(arrayBuffer, { csv = false } = {}) {
  const wb = csv ? readCsv(new TextDecoder().decode(arrayBuffer)) : readXlsx(arrayBuffer);
  const sheets = wb.sheets.map(({ name, rows: raw }) => {
    const matrix = raw.filter((row) => (row || []).some((c) => cell(c) !== ''));
    const headerIndex = findHeaderRow(matrix);
    if (headerIndex < 0) return { name, headers: [], rows: [], firstDataRow: 0 };

    const headers = (matrix[headerIndex] || []).map((c) => cell(c));
    const rows = matrix.slice(headerIndex + 1).filter((row) => (row || []).some((c) => cell(c) !== ''));
    return { name, headers, rows, firstDataRow: headerIndex + 2 }; // 1-based, for display
  });
  return { sheets: sheets.filter((s) => s.headers.length > 0 || s.rows.length > 0) };
}

/** First pattern that matches any header wins, so specific labels beat generic ones. */
function matchHeader(headers, patterns) {
  for (const pattern of patterns) {
    const index = headers.findIndex((h) => pattern.test(h));
    if (index >= 0) return index;
  }
  return -1;
}

/** Fallback when no header looks like an email column: sniff the data itself. */
function sniffEmailColumn(headers, rows) {
  const width = Math.max(headers.length, ...rows.map((r) => r.length), 0);
  let best = { index: -1, ratio: 0 };
  for (let c = 0; c < width; c++) {
    const values = rows.map((r) => cell(r[c])).filter((v) => v !== '');
    if (values.length === 0) continue;
    const ratio = values.filter((v) => isValidEmail(normalizeEmail(v))).length / values.length;
    if (ratio > best.ratio) best = { index: c, ratio };
  }
  return best.ratio >= 0.6 ? best.index : -1;
}

/**
 * Detect the first-name and email columns.
 * `source` records how each was found so the UI can be honest about confidence.
 */
export function detectColumns(headers, rows) {
  const firstNameIndex = matchHeader(headers, FIRST_NAME_PATTERNS);
  const lastNameIndex = matchHeader(headers, LAST_NAME_PATTERNS);
  const fullNameIndex = matchHeader(headers, FULL_NAME_PATTERNS);
  let emailIndex = matchHeader(headers, EMAIL_PATTERNS);
  let emailSource = emailIndex >= 0 ? 'header' : 'none';

  if (emailIndex < 0) {
    const sniffed = sniffEmailColumn(headers, rows);
    if (sniffed >= 0) {
      emailIndex = sniffed;
      emailSource = 'content';
    }
  }

  const nameIndex = firstNameIndex >= 0 ? firstNameIndex : fullNameIndex;

  return {
    firstNameIndex,
    lastNameIndex,
    fullNameIndex,
    emailIndex,
    /** Whether a full name can be built at all — drives the greeting choice. */
    hasFullName: (firstNameIndex >= 0 && lastNameIndex >= 0) || fullNameIndex >= 0,
    nameSource: nameIndex >= 0 ? 'header' : 'none',
    firstNameSource: nameIndex >= 0 ? 'header' : 'none',
    emailSource,
  };
}

/**
 * Work out both greeting forms for one row.
 * Handles three shapes of list: separate First/Last columns, a single full-name
 * column, and the "Last, First" ordering CRM exports often produce.
 */
function namesFor(row, cols) {
  const first = cols.firstNameIndex >= 0 ? cell(row[cols.firstNameIndex]) : '';
  const last = cols.lastNameIndex >= 0 ? cell(row[cols.lastNameIndex]) : '';
  const full = cols.fullNameIndex >= 0 ? cell(row[cols.fullNameIndex]) : '';

  if (first) {
    return { firstName: first, fullName: [first, last].filter(Boolean).join(' ') || first };
  }
  if (full) {
    if (full.includes(',')) {
      const [surname, given] = full.split(',').map((s) => s.trim());
      const givenFirst = (given || '').split(/\s+/)[0] || '';
      return {
        firstName: givenFirst,
        fullName: [given, surname].filter(Boolean).join(' ') || full,
      };
    }
    return { firstName: full.split(/\s+/)[0] || '', fullName: full };
  }
  return { firstName: '', fullName: last };
}

/**
 * Turn raw rows into the send list. Rows without a usable email are skipped
 * with a reason; repeat addresses are collapsed so nobody is emailed twice.
 */
export function buildRecipients(rows, cols, firstDataRow = 2) {
  const emailIndex = cols?.emailIndex ?? -1;
  const recipients = [];
  const skipped = [];
  const seen = new Map();

  rows.forEach((row, i) => {
    const rowNumber = firstDataRow + i;
    const rawEmail = emailIndex >= 0 ? cell(row[emailIndex]) : '';
    const { firstName, fullName } = namesFor(row, cols ?? {});
    const email = normalizeEmail(rawEmail);

    if (!email) {
      skipped.push({ rowNumber, firstName, raw: rawEmail, reason: 'No email address' });
      return;
    }
    if (!isValidEmail(email)) {
      skipped.push({ rowNumber, firstName, raw: rawEmail, reason: 'Malformed email address' });
      return;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) {
      skipped.push({
        rowNumber,
        firstName,
        raw: rawEmail,
        reason: `Duplicate of row ${seen.get(key)}`,
      });
      return;
    }
    seen.set(key, rowNumber);
    recipients.push({ rowNumber, firstName, fullName, email });
  });

  return { recipients, skipped };
}
