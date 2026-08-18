import * as XLSX from 'xlsx';
import { FIRST_NAME_PATTERNS, EMAIL_PATTERNS } from '../config.js';

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

/** Parse an .xlsx/.xls ArrayBuffer into one entry per sheet. */
export function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheets = wb.SheetNames.map((name) => {
    const matrix = XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    });
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
  let emailIndex = matchHeader(headers, EMAIL_PATTERNS);
  let emailSource = emailIndex >= 0 ? 'header' : 'none';

  if (emailIndex < 0) {
    const sniffed = sniffEmailColumn(headers, rows);
    if (sniffed >= 0) {
      emailIndex = sniffed;
      emailSource = 'content';
    }
  }

  return {
    firstNameIndex,
    emailIndex,
    firstNameSource: firstNameIndex >= 0 ? 'header' : 'none',
    emailSource,
  };
}

/**
 * Turn raw rows into the send list. Rows without a usable email are skipped
 * with a reason; repeat addresses are collapsed so nobody is emailed twice.
 */
export function buildRecipients(rows, firstNameIndex, emailIndex, firstDataRow = 2) {
  const recipients = [];
  const skipped = [];
  const seen = new Map();

  rows.forEach((row, i) => {
    const rowNumber = firstDataRow + i;
    const rawEmail = emailIndex >= 0 ? cell(row[emailIndex]) : '';
    const firstName = firstNameIndex >= 0 ? cell(row[firstNameIndex]) : '';
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
    recipients.push({ rowNumber, firstName, email });
  });

  return { recipients, skipped };
}
