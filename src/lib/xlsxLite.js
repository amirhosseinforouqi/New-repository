import { unzipSync, strFromU8 } from 'fflate';

/**
 * A minimal .xlsx reader — enough to pull a contact list out of a workbook,
 * and no more. It replaces SheetJS, which is ~350KB of the shipped page and
 * carries dozens of formats this tool never opens.
 *
 * An .xlsx is a ZIP of XML. We read the workbook part for sheet names and
 * order, the relationship part to find each sheet's XML, the shared-string
 * table, and then each sheet's cells. Legacy binary .xls is NOT supported —
 * re-save those as .xlsx.
 */

/** "BC" -> 54. Column letters in a cell reference are base-26, 1-indexed. */
function columnIndex(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break; // stop at the row digits
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(xml) {
  if (xml.indexOf('&') === -1) return xml;
  return xml.replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/** Concatenate every <t> in a fragment — shared strings may be split into runs. */
function textOf(fragment) {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m;
  while ((m = re.exec(fragment))) out += decode(m[1] ?? '');
  return out;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si(?:\s[^>]*)?\/>/g;
  let m;
  while ((m = re.exec(xml))) out.push(m[1] === undefined ? '' : textOf(m[1]));
  return out;
}

/** One sheet's cells as an array of row arrays, positioned by cell reference. */
function parseSheet(xml, shared) {
  const rows = [];
  const rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>|<row(?:\s[^>]*)?\/>/g;
  const cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

  let rowMatch;
  while ((rowMatch = rowRe.exec(xml))) {
    const body = rowMatch[1];
    const row = [];
    if (body) {
      let cellMatch;
      cellRe.lastIndex = 0;
      while ((cellMatch = cellRe.exec(body))) {
        const attrs = cellMatch[1] || '';
        const inner = cellMatch[2] || '';

        const refMatch = /r="([A-Z]+)/.exec(attrs);
        const at = refMatch ? columnIndex(refMatch[1]) : row.length;
        const type = /t="([^"]+)"/.exec(attrs)?.[1];

        let value = '';
        if (type === 'inlineStr') {
          value = textOf(inner);
        } else {
          const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1];
          if (v !== undefined) {
            if (type === 's') value = shared[Number(v)] ?? '';
            else if (type === 'e') value = '';
            else value = decode(v);
          } else if (type === 'str') {
            value = textOf(inner);
          }
        }

        if (at >= 0) row[at] = value;
      }
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
    rows.push(row);
  }
  return rows;
}

/** Read an .xlsx ArrayBuffer into `{ sheets: [{ name, rows }] }`, in workbook order. */
export function readXlsx(arrayBuffer) {
  let files;
  try {
    files = unzipSync(new Uint8Array(arrayBuffer));
  } catch {
    throw new Error('it is not a readable .xlsx file');
  }

  const get = (path) => (files[path] ? strFromU8(files[path]) : null);
  const workbook = get('xl/workbook.xml');
  if (!workbook) throw new Error('it is missing its workbook — legacy .xls is not supported');

  // Sheet name + relationship id, in the order the workbook lists them.
  const listed = [];
  const sheetRe = /<sheet\s([^>]*)\/?>/g;
  let m;
  while ((m = sheetRe.exec(workbook))) {
    const attrs = m[1];
    listed.push({
      name: decode(/name="([^"]*)"/.exec(attrs)?.[1] ?? `Sheet${listed.length + 1}`),
      rid: /r:id="([^"]*)"/.exec(attrs)?.[1] ?? null,
    });
  }

  const rels = get('xl/_rels/workbook.xml.rels') ?? '';
  const target = {};
  const relRe = /<Relationship\s([^>]*)\/?>/g;
  while ((m = relRe.exec(rels))) {
    const id = /Id="([^"]*)"/.exec(m[1])?.[1];
    let path = decode(/Target="([^"]*)"/.exec(m[1])?.[1] ?? '');
    if (!id || !path) continue;
    path = path.replace(/^\//, '').replace(/^xl\//, '');
    target[id] = `xl/${path}`;
  }

  const shared = parseSharedStrings(get('xl/sharedStrings.xml'));
  const fallback = Object.keys(files)
    .filter((f) => /^xl\/worksheets\/[^/]+\.xml$/.test(f))
    .sort();

  const sheets = listed.map((s, i) => {
    const path = (s.rid && target[s.rid]) || fallback[i];
    const xml = path ? get(path) : null;
    return { name: s.name, rows: xml ? parseSheet(xml, shared) : [] };
  });

  return { sheets: sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }] };
}

/** Split one CSV line, honouring quotes and doubled quotes inside them. */
function csvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(field); field = ''; }
    else field += ch;
  }
  out.push(field);
  return out;
}

/** Read a CSV/TSV file into the same shape as readXlsx. */
export function readCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const delimiter = clean.slice(0, 2000).split('\t').length > clean.slice(0, 2000).split(',').length ? '\t' : ',';
  const rows = [];
  // Split on newlines that are not inside quotes.
  let line = '';
  let quoted = false;
  const push = () => { if (line !== '' || rows.length) rows.push(delimiter === '\t' ? line.split('\t') : csvLine(line)); line = ''; };
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '"') { quoted = !quoted; line += ch; continue; }
    if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      push();
      continue;
    }
    line += ch;
  }
  if (line !== '') push();
  return { sheets: [{ name: 'CSV', rows }] };
}
