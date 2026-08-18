import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseWorkbook, detectColumns, buildRecipients } from './lib/excel.js';
import { personalize } from './lib/personalize.js';
import { createClient, sendOne } from './lib/gmail.js';
import {
  SUBJECT,
  CONFIRM_THRESHOLD,
  SEND_DELAY_MS,
  GMAIL_MCP_URL,
  MODEL,
} from './config.js';

const STEPS = [
  ['upload', 'Upload'],
  ['review', 'Review'],
  ['confirm', 'Confirm'],
  ['send', 'Send'],
  ['results', 'Results'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** mcpUrl is a workspace setting, not a secret — remembering it is safe. */
const readStored = (key, fallback = '') => {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

export default function EmailBlast() {
  const [stage, setStage] = useState('upload');
  const [error, setError] = useState(null);

  // --- workbook ------------------------------------------------------------
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [firstNameIndex, setFirstNameIndex] = useState(-1);
  const [emailIndex, setEmailIndex] = useState(-1);
  const [detection, setDetection] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // --- connection ----------------------------------------------------------
  const [apiKey, setApiKey] = useState('');
  const [mcpUrl, setMcpUrl] = useState(() => readStored('eb.mcpUrl', GMAIL_MCP_URL));
  const [mcpToken, setMcpToken] = useState('');
  const [baseUrl, setBaseUrl] = useState(() => readStored('eb.baseUrl', ''));
  const [model, setModel] = useState(() => readStored('eb.model', MODEL));

  // --- sending -------------------------------------------------------------
  const [log, setLog] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const stopRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem('eb.mcpUrl', mcpUrl);
      window.localStorage.setItem('eb.baseUrl', baseUrl);
      window.localStorage.setItem('eb.model', model);
    } catch {
      /* private browsing — settings just won't persist */
    }
  }, [mcpUrl, baseUrl, model]);

  const sheet = sheets[sheetIndex];

  const { recipients, skipped } = useMemo(() => {
    if (!sheet) return { recipients: [], skipped: [] };
    return buildRecipients(sheet.rows, { ...detection, firstNameIndex, emailIndex }, sheet.firstDataRow);
  }, [sheet, detection, firstNameIndex, emailIndex]);

  const applyDetection = useCallback((target) => {
    const found = detectColumns(target.headers, target.rows);
    setFirstNameIndex(found.firstNameIndex);
    setEmailIndex(found.emailIndex);
    setDetection(found);
  }, []);

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      setError(null);
      try {
        const parsed = parseWorkbook(await file.arrayBuffer());
        if (parsed.sheets.length === 0) throw new Error('That workbook has no readable rows.');
        setFileName(file.name);
        setSheets(parsed.sheets);
        setSheetIndex(0);
        applyDetection(parsed.sheets[0]);
        setPreviewIndex(0);
        setStage('review');
      } catch (e) {
        setError(`Could not read that file: ${e.message}`);
      }
    },
    [applyDetection],
  );

  const chooseSheet = (index) => {
    setSheetIndex(index);
    applyDetection(sheets[index]);
    setPreviewIndex(0);
  };

  const startOver = () => {
    setStage('upload');
    setSheets([]);
    setFileName('');
    setLog([]);
    setError(null);
    setDetection(null);
  };

  // --- send loop -----------------------------------------------------------
  const runSend = useCallback(
    async (list) => {
      setError(null);
      setStage('send');
      setCursor(0);
      stopRef.current = false;
      setLog(list.map((r) => ({ ...r, status: 'pending', error: null })));

      const client = createClient({ apiKey, baseURL: baseUrl || undefined });

      const update = (i, patch) =>
        setLog((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));

      for (let i = 0; i < list.length; i++) {
        if (stopRef.current) {
          setLog((prev) =>
            prev.map((row, j) =>
              j >= i && row.status === 'pending' ? { ...row, status: 'stopped' } : row,
            ),
          );
          break;
        }
        setCursor(i);
        update(i, { status: 'sending' });
        try {
          await sendOne(client, {
            mcpUrl,
            mcpToken,
            to: list[i].email,
            subject: SUBJECT,
            html: personalize(list[i].firstName),
            model,
          });
          update(i, { status: 'sent' });
        } catch (e) {
          update(i, { status: 'failed', error: e?.message || String(e) });
        }
        if (i < list.length - 1 && SEND_DELAY_MS > 0) await sleep(SEND_DELAY_MS);
      }

      setCursor(list.length);
      setStage('results');
    },
    [apiKey, baseUrl, mcpUrl, mcpToken, model],
  );

  const connectionReady = apiKey.trim() !== '' && mcpUrl.trim() !== '';

  const attemptSend = () => {
    if (!connectionReady) {
      setError('Add your Anthropic API key and the Gmail MCP server URL before sending.');
      return;
    }
    if (recipients.length === 0) {
      setError('There are no valid recipients to send to.');
      return;
    }
    if (recipients.length > CONFIRM_THRESHOLD) setStage('confirm');
    else runSend(recipients);
  };

  const counts = useMemo(() => {
    const sent = log.filter((r) => r.status === 'sent').length;
    const failed = log.filter((r) => r.status === 'failed').length;
    const stopped = log.filter((r) => r.status === 'stopped').length;
    return { sent, failed, stopped };
  }, [log]);

  const downloadLog = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['row', 'first_name', 'email', 'status', 'error'].join(','),
      ...log.map((r) => [r.rowNumber, r.firstName, r.email, r.status, r.error].map(esc).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-blast-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stepState = (id) => {
    const order = STEPS.map(([s]) => s);
    const here = order.indexOf(stage);
    const mine = order.indexOf(id);
    if (mine === here) return 'active';
    return mine < here ? 'done' : 'todo';
  };

  const previewRecipient = recipients[previewIndex];

  return (
    <div className="shell">
      <div className="card">
        <div className="card__accent" />

        <header className="masthead">
          <span className="masthead__tool">EMAIL BLAST</span>
          <div className="masthead__name">ASIF JABBAROV</div>
          <div className="masthead__role">MORTGAGE BROKER</div>
        </header>

        <div className="banner">
          <div className="banner__eyebrow">CLIENT ANNOUNCEMENT</div>
          <h1 className="banner__title">
            Personalize and send the new-office announcement to your client list.
          </h1>
          <div className="banner__sub">
            Subject line: <strong>{SUBJECT}</strong>
          </div>
        </div>

        <ul className="steps">
          {STEPS.map(([id, label]) => (
            <li key={id} data-state={stepState(id)}>
              {label}
            </li>
          ))}
        </ul>

        {error && (
          <div className="section" style={{ paddingBottom: 0 }}>
            <div className="error">{error}</div>
          </div>
        )}

        {stage === 'upload' && (
          <UploadStage
            dragOver={dragOver}
            setDragOver={setDragOver}
            onFile={handleFile}
          />
        )}

        {stage === 'review' && sheet && (
          <ReviewStage
            fileName={fileName}
            sheets={sheets}
            sheetIndex={sheetIndex}
            chooseSheet={chooseSheet}
            headers={sheet.headers}
            detection={detection}
            firstNameIndex={firstNameIndex}
            emailIndex={emailIndex}
            setFirstNameIndex={setFirstNameIndex}
            setEmailIndex={setEmailIndex}
            recipients={recipients}
            skipped={skipped}
            previewIndex={previewIndex}
            setPreviewIndex={setPreviewIndex}
            previewRecipient={previewRecipient}
            apiKey={apiKey}
            setApiKey={setApiKey}
            mcpUrl={mcpUrl}
            setMcpUrl={setMcpUrl}
            mcpToken={mcpToken}
            setMcpToken={setMcpToken}
            baseUrl={baseUrl}
            setBaseUrl={setBaseUrl}
            model={model}
            setModel={setModel}
            onSend={attemptSend}
            onStartOver={startOver}
          />
        )}

        {stage === 'confirm' && (
          <ConfirmStage
            recipients={recipients}
            onBack={() => setStage('review')}
            onConfirm={() => runSend(recipients)}
          />
        )}

        {stage === 'send' && (
          <SendingStage
            log={log}
            cursor={cursor}
            onStop={() => {
              stopRef.current = true;
            }}
          />
        )}

        {stage === 'results' && (
          <ResultsStage
            log={log}
            counts={counts}
            onRetryFailed={() => runSend(log.filter((r) => r.status === 'failed'))}
            onDownload={downloadLog}
            onStartOver={startOver}
          />
        )}

        <footer className="foot">
          Asif Jabbarov · Mortgage Broker · Real Mortgage Associates, License #M14000335
          <br />
          Emails are sent one at a time through your own Gmail account via the Gmail MCP
          connector. Nothing is sent until you press Send.
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function UploadStage({ dragOver, setDragOver, onFile }) {
  const inputRef = useRef(null);
  return (
    <section className="section">
      <div className="section__eyebrow">STEP 1</div>
      <h2 className="section__title">Upload your client list</h2>
      <p className="section__note">
        An Excel workbook (.xlsx or .xls) with a first-name column and an email column.
        The file is read in your browser — it is never uploaded anywhere.
      </p>
      <div
        className="drop"
        data-over={dragOver}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFile(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="drop__title">Drop your spreadsheet here, or click to choose one</div>
        <div className="drop__hint">.xlsx or .xls</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </section>
  );
}

function ColumnPicker({ label, headers, value, onChange, source, kind }) {
  const tag =
    source === 'header'
      ? ['Detected from header', 'ok']
      : source === 'content'
        ? ['Guessed from the data', 'guess']
        : ['Not detected — pick one', 'bad'];
  return (
    <label className="field">
      <span className="field__label">
        {label}
        <span className="tag" data-kind={tag[1]}>
          {tag[0]}
        </span>
      </span>
      <select
        className="field__select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        <option value={-1}>— none —</option>
        {headers.map((h, i) => (
          <option key={`${h}-${i}`} value={i}>
            {h || `(column ${i + 1})`}
          </option>
        ))}
      </select>
      <span className="field__hint">
        {kind === 'email'
          ? 'Rows with a missing or malformed address are skipped.'
          : 'Blank names fall back to a neutral greeting.'}
      </span>
    </label>
  );
}

function ReviewStage(props) {
  const {
    fileName, sheets, sheetIndex, chooseSheet, headers, detection,
    firstNameIndex, emailIndex, setFirstNameIndex, setEmailIndex,
    recipients, skipped, previewIndex, setPreviewIndex, previewRecipient,
    apiKey, setApiKey, mcpUrl, setMcpUrl, mcpToken, setMcpToken,
    baseUrl, setBaseUrl, model, setModel, onSend, onStartOver,
  } = props;

  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      <section className="section">
        <div className="section__eyebrow">STEP 2</div>
        <h2 className="section__title">Check the columns</h2>
        <p className="section__note">
          Reading <strong>{fileName}</strong>
          {sheets.length > 1 ? ` — ${sheets.length} sheets found.` : '.'}
        </p>

        {sheets.length > 1 && (
          <label className="field">
            <span className="field__label">SHEET</span>
            <select
              className="field__select"
              value={sheetIndex}
              onChange={(e) => chooseSheet(Number(e.target.value))}
            >
              {sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name} ({s.rows.length} rows)
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid2">
          <ColumnPicker
            label="FIRST NAME COLUMN"
            headers={headers}
            value={firstNameIndex}
            onChange={setFirstNameIndex}
            source={detection?.firstNameSource}
            kind="name"
          />
          <ColumnPicker
            label="EMAIL COLUMN"
            headers={headers}
            value={emailIndex}
            onChange={setEmailIndex}
            source={detection?.emailSource}
            kind="email"
          />
        </div>
      </section>

      <section className="section">
        <div className="section__eyebrow">STEP 3</div>
        <h2 className="section__title">
          {recipients.length} recipient{recipients.length === 1 ? '' : 's'} ready
        </h2>
        <p className="section__note">
          {skipped.length > 0
            ? `${skipped.length} row${skipped.length === 1 ? ' was' : 's were'} skipped — see below.`
            : 'Every row has a usable email address.'}
        </p>

        {recipients.length > 0 && (
          <div className="scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>ROW</th>
                  <th>FIRST NAME</th>
                  <th>EMAIL</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={`${r.rowNumber}-${r.email}`}>
                    <td className="num">{r.rowNumber}</td>
                    <td>{r.firstName || <em style={{ color: '#8A8F96' }}>(blank)</em>}</td>
                    <td className="email">{r.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {skipped.length > 0 && (
          <details style={{ paddingTop: 16 }}>
            <summary>Show the {skipped.length} skipped row(s)</summary>
            <div className="scroll" style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>ROW</th>
                    <th>FIRST NAME</th>
                    <th>VALUE</th>
                    <th>REASON</th>
                  </tr>
                </thead>
                <tbody>
                  {skipped.map((s, i) => (
                    <tr key={`${s.rowNumber}-${i}`}>
                      <td className="num">{s.rowNumber}</td>
                      <td>{s.firstName}</td>
                      <td className="email">{s.raw}</td>
                      <td style={{ color: 'var(--danger)' }}>{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {recipients.length > 0 && (
          <div style={{ paddingTop: 18 }}>
            <button className="btn btn--ghost" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? 'Hide' : 'Preview'} the personalized email
            </button>
            {showPreview && previewRecipient && (
              <div style={{ paddingTop: 14 }}>
                <label className="field">
                  <span className="field__label">PREVIEWING</span>
                  <select
                    className="field__select"
                    value={previewIndex}
                    onChange={(e) => setPreviewIndex(Number(e.target.value))}
                  >
                    {recipients.map((r, i) => (
                      <option key={`${r.rowNumber}-${r.email}`} value={i}>
                        {r.firstName || '(blank)'} — {r.email}
                      </option>
                    ))}
                  </select>
                </label>
                <iframe
                  className="preview"
                  title="Email preview"
                  sandbox=""
                  srcDoc={personalize(previewRecipient.firstName)}
                />
              </div>
            )}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section__eyebrow">STEP 4</div>
        <h2 className="section__title">Connection</h2>
        <p className="section__note">
          Emails go out through the Gmail MCP connector. Your key stays in this browser
          tab and is cleared when you close it.
        </p>
        <div className="grid2">
          <label className="field">
            <span className="field__label">ANTHROPIC API KEY</span>
            <input
              className="field__input"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <span className="field__hint">Not saved to disk.</span>
          </label>
          <label className="field">
            <span className="field__label">GMAIL MCP SERVER URL</span>
            <input
              className="field__input"
              type="url"
              placeholder="https://…"
              value={mcpUrl}
              onChange={(e) => setMcpUrl(e.target.value)}
            />
            <span className="field__hint">Remembered on this device.</span>
          </label>
          <label className="field">
            <span className="field__label">GMAIL MCP AUTH TOKEN (IF REQUIRED)</span>
            <input
              className="field__input"
              type="password"
              autoComplete="off"
              value={mcpToken}
              onChange={(e) => setMcpToken(e.target.value)}
            />
            <span className="field__hint">Leave blank if your connector does not need one.</span>
          </label>
          <label className="field">
            <span className="field__label">MODEL</span>
            <input
              className="field__input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <span className="field__hint">Default {MODEL}.</span>
          </label>
        </div>
        <details>
          <summary>Advanced — use a proxy instead of calling the API directly</summary>
          <label className="field" style={{ paddingTop: 12 }}>
            <span className="field__label">API BASE URL</span>
            <input
              className="field__input"
              placeholder="https://api.anthropic.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <span className="field__hint">
              Point this at your own server if you would rather not hold the key in the browser.
            </span>
          </label>
        </details>

        <div className="actions">
          <button className="btn btn--gold" onClick={onSend} disabled={recipients.length === 0}>
            Send{recipients.length > 0 ? ` to ${recipients.length}` : ''}
          </button>
          <button className="btn btn--ghost" onClick={onStartOver}>
            Use a different file
          </button>
        </div>
      </section>
    </>
  );
}

function ConfirmStage({ recipients, onBack, onConfirm }) {
  return (
    <section className="section">
      <div className="section__eyebrow">CONFIRM</div>
      <h2 className="section__title">You are about to email {recipients.length} clients.</h2>
      <p className="section__note">
        More than {CONFIRM_THRESHOLD} recipients, so this needs a second look. Sent mail
        cannot be recalled.
      </p>

      <div className="stat">
        <div>
          <div className="stat__n">{recipients.length}</div>
          <div className="stat__l">RECIPIENTS</div>
        </div>
        <div>
          <div className="stat__n">1</div>
          <div className="stat__l">EMAIL EACH</div>
        </div>
      </div>

      <div className="callout">
        <strong>Subject:</strong> {SUBJECT}
        <br />
        Each message is addressed individually — no one sees another client's address.
      </div>

      <div className="callout callout--warn" style={{ marginTop: 16 }}>
        First recipient: <strong>{recipients[0]?.email}</strong> · Last:{' '}
        <strong>{recipients[recipients.length - 1]?.email}</strong>
      </div>

      <div className="actions" style={{ paddingTop: 20 }}>
        <button className="btn btn--gold" onClick={onConfirm}>
          Confirm — Send All
        </button>
        <button className="btn btn--ghost" onClick={onBack}>
          Back to the list
        </button>
      </div>
    </section>
  );
}

function SendingStage({ log, cursor, onStop }) {
  const done = log.filter((r) => r.status === 'sent' || r.status === 'failed').length;
  const pct = log.length ? Math.round((done / log.length) * 100) : 0;
  const current = log[cursor];

  return (
    <section className="section">
      <div className="section__eyebrow">SENDING</div>
      <h2 className="section__title">
        {done} of {log.length} sent
      </h2>
      <div className="bar">
        <div className="bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="section__note">
        {current ? `Now sending to ${current.email}…` : 'Finishing up…'}
      </p>

      <div className="scroll">
        <table className="table">
          <tbody>
            {log.map((r) => (
              <tr key={`${r.rowNumber}-${r.email}`}>
                <td className="num">{r.rowNumber}</td>
                <td>{r.firstName}</td>
                <td className="email">{r.email}</td>
                <td className="status" data-s={r.status}>
                  {r.status === 'sent' && 'SENT'}
                  {r.status === 'failed' && 'FAILED'}
                  {r.status === 'sending' && 'SENDING…'}
                  {r.status === 'pending' && 'WAITING'}
                  {r.status === 'stopped' && 'NOT SENT'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="actions" style={{ paddingTop: 18 }}>
        <button className="btn btn--danger" onClick={onStop}>
          Stop after the current email
        </button>
      </div>
    </section>
  );
}

function ResultsStage({ log, counts, onRetryFailed, onDownload, onStartOver }) {
  return (
    <section className="section">
      <div className="section__eyebrow">DONE</div>
      <h2 className="section__title">
        {counts.sent} sent
        {counts.failed > 0 ? `, ${counts.failed} failed` : ''}
        {counts.stopped > 0 ? `, ${counts.stopped} not sent` : ''}
      </h2>

      <div className="stat">
        <div>
          <div className="stat__n" style={{ color: 'var(--success)' }}>{counts.sent}</div>
          <div className="stat__l">SENT</div>
        </div>
        <div>
          <div className="stat__n" style={{ color: counts.failed ? 'var(--danger)' : undefined }}>
            {counts.failed}
          </div>
          <div className="stat__l">FAILED</div>
        </div>
        {counts.stopped > 0 && (
          <div>
            <div className="stat__n">{counts.stopped}</div>
            <div className="stat__l">NOT SENT</div>
          </div>
        )}
      </div>

      <details open={counts.failed > 0}>
        <summary>Per-recipient log</summary>
        <div className="scroll" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>ROW</th>
                <th>FIRST NAME</th>
                <th>EMAIL</th>
                <th>STATUS</th>
                <th>DETAIL</th>
              </tr>
            </thead>
            <tbody>
              {log.map((r) => (
                <tr key={`${r.rowNumber}-${r.email}`}>
                  <td className="num">{r.rowNumber}</td>
                  <td>{r.firstName}</td>
                  <td className="email">{r.email}</td>
                  <td className="status" data-s={r.status}>
                    {r.status.toUpperCase()}
                  </td>
                  <td style={{ color: 'var(--danger)' }}>{r.error || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="actions" style={{ paddingTop: 20 }}>
        {counts.failed > 0 && (
          <button className="btn btn--gold" onClick={onRetryFailed}>
            Retry the {counts.failed} that failed
          </button>
        )}
        <button className="btn btn--ghost" onClick={onDownload}>
          Download log (CSV)
        </button>
        <button className="btn btn--ghost" onClick={onStartOver}>
          Start over
        </button>
      </div>
    </section>
  );
}
