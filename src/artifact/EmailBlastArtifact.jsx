import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseWorkbook, detectColumns, buildRecipients } from '../lib/excel.js';
import { personalize } from '../lib/personalize.js';
import { EMAIL_TEMPLATE_TEXT } from '../emailTemplateText.js';
import {
  sendOne,
  describeMcpError,
  isAmbiguous,
  GMAIL_SERVER,
} from '../lib/gmailConnector.js';
import { SUBJECT, CONFIRM_THRESHOLD, SEND_DELAY_MS } from '../config.js';

const STAGES = [
  ['upload', 'UPLOAD'],
  ['review', 'REVIEW'],
  ['confirm', 'CONFIRM'],
  ['send', 'SEND'],
  ['results', 'RESULTS'],
];

/** Codes that will fail identically for every remaining recipient — stop the
 *  run rather than burning through the list producing the same error. */
const FATAL = new Set([
  'needs_reauth',
  'server_not_connected',
  'selection_required',
  'server_not_found',
  'not_in_manifest',
  'blocked_by_policy',
  'approval_required',
  'not_granted',
  'capability_disabled',
  'capability_removed',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function EmailBlastArtifact() {
  const [stage, setStage] = useState('upload');
  const [problem, setProblem] = useState(null);

  const [conn, setConn] = useState({ status: 'checking' });
  const mcpRef = useRef(null);
  const dlRef = useRef(null);

  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [firstNameIndex, setFirstNameIndex] = useState(-1);
  const [emailIndex, setEmailIndex] = useState(-1);
  const [detection, setDetection] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  const [log, setLog] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [halted, setHalted] = useState(null);
  const stopRef = useRef(false);

  // --- capability wiring ---------------------------------------------------
  useEffect(() => {
    let live = true;
    (async () => {
      const mcp = await window.claude?.use?.('mcp');
      if (!live) return;
      if (!mcp) {
        setConn({ status: 'unavailable' });
        return;
      }
      mcpRef.current = mcp;
      try {
        const { servers } = await mcp.listTools();
        if (!live) return;
        const gmail = servers.find((s) => s.server === GMAIL_SERVER);
        if (!gmail || gmail.tools.length === 0) setConn({ status: 'missing' });
        else if (gmail.authStatus === 'needs_reauth') setConn({ status: 'reauth' });
        else setConn({ status: 'ready' });
      } catch (e) {
        if (live) setConn({ status: 'error', ...describeMcpError(e) });
      }
    })();
    (async () => {
      const dl = await window.claude?.use?.('downloads');
      if (live) dlRef.current = dl;
    })();
    return () => {
      live = false;
    };
  }, []);

  const sheet = sheets[sheetIndex];

  const { recipients, skipped } = useMemo(() => {
    if (!sheet) return { recipients: [], skipped: [] };
    return buildRecipients(sheet.rows, firstNameIndex, emailIndex, sheet.firstDataRow);
  }, [sheet, firstNameIndex, emailIndex]);

  const applyDetection = useCallback((target) => {
    const found = detectColumns(target.headers, target.rows);
    setFirstNameIndex(found.firstNameIndex);
    setEmailIndex(found.emailIndex);
    setDetection(found);
  }, []);

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      setProblem(null);
      try {
        const parsed = parseWorkbook(await file.arrayBuffer());
        if (parsed.sheets.length === 0) throw new Error('it has no readable rows');
        setFileName(file.name);
        setSheets(parsed.sheets);
        setSheetIndex(0);
        applyDetection(parsed.sheets[0]);
        setPreviewIndex(0);
        setShowPreview(false);
        setStage('review');
      } catch (e) {
        setProblem({
          title: 'That file could not be read',
          fix: `${file.name} could not be opened — ${e.message}. Save it as .xlsx and try again.`,
        });
      }
    },
    [applyDetection],
  );

  const startOver = () => {
    setStage('upload');
    setSheets([]);
    setFileName('');
    setLog([]);
    setProblem(null);
    setHalted(null);
    setDetection(null);
  };

  // --- the send loop -------------------------------------------------------
  const runSend = useCallback(
    async (list) => {
      const mcp = mcpRef.current;
      if (!mcp) {
        setProblem({
          title: 'Sending is unavailable here',
          fix: 'Open this page from claude.ai so it can reach your Gmail connector.',
        });
        return;
      }

      setProblem(null);
      setHalted(null);
      setStage('send');
      setCursor(0);
      stopRef.current = false;
      setLog(list.map((r) => ({ ...r, status: 'pending', detail: null, code: null })));

      const patch = (i, next) =>
        setLog((prev) => prev.map((row, j) => (j === i ? { ...row, ...next } : row)));
      const markRestStopped = (from) =>
        setLog((prev) =>
          prev.map((row, j) =>
            j >= from && row.status === 'pending' ? { ...row, status: 'stopped' } : row,
          ),
        );

      for (let i = 0; i < list.length; i++) {
        if (stopRef.current) {
          markRestStopped(i);
          break;
        }
        setCursor(i);
        patch(i, { status: 'sending' });

        try {
          await sendOne(mcp, {
            to: list[i].email,
            html: personalize(list[i].firstName),
            text: personalize(list[i].firstName, EMAIL_TEMPLATE_TEXT),
          });
          patch(i, { status: 'sent' });
        } catch (e) {
          const d = describeMcpError(e);
          patch(i, {
            status: isAmbiguous(d.code) ? 'uncertain' : 'failed',
            detail: d.fix,
            code: d.code,
          });
          if (FATAL.has(d.code)) {
            setHalted(d);
            markRestStopped(i + 1);
            break;
          }
        }

        if (i < list.length - 1 && SEND_DELAY_MS > 0) await sleep(SEND_DELAY_MS);
      }

      setCursor(list.length);
      setStage('results');
    },
    [],
  );

  // Only a connection reported healthy enables Send. An `unknown` authStatus
  // resolves to 'ready' on purpose — the contract says not to render reconnect
  // UI for it and to branch on the error the call itself returns.
  const canSend = conn.status === 'ready';

  const attemptSend = () => {
    if (recipients.length === 0) {
      setProblem({ title: 'Nothing to send', fix: 'No row in this sheet has a usable email address.' });
      return;
    }
    if (recipients.length > CONFIRM_THRESHOLD) setStage('confirm');
    else runSend(recipients);
  };

  const counts = useMemo(() => {
    const by = (s) => log.filter((r) => r.status === s).length;
    return { sent: by('sent'), failed: by('failed'), uncertain: by('uncertain'), stopped: by('stopped') };
  }, [log]);

  const saveLog = async () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['row', 'first_name', 'email', 'status', 'detail'].join(','),
      ...log.map((r) => [r.rowNumber, r.firstName, r.email, r.status, r.detail].map(esc).join(',')),
    ].join('\r\n');
    const filename = `email-blast-${new Date().toISOString().slice(0, 10)}.csv`;
    const dl = dlRef.current;
    if (!dl) {
      setProblem({ title: 'Saving is unavailable here', fix: 'This page cannot hand you a file to save.' });
      return;
    }
    try {
      await dl.save({ filename, data: csv });
    } catch {
      /* the viewer declined the save — nothing to recover from */
    }
  };

  const railState = (id) => {
    const order = STAGES.map(([s]) => s);
    const here = order.indexOf(stage);
    const mine = order.indexOf(id);
    return mine === here ? 'active' : mine < here ? 'done' : 'todo';
  };

  return (
    <div className="shell">
      <div className="card">
        <div className="card__rule" />

        <header className="masthead">
          <div>
            <h1>ASIF JABBAROV</h1>
            <p>MORTGAGE BROKER</p>
          </div>
          <div className="masthead__tool">EMAIL BLAST</div>
        </header>

        <div className="lede">
          <div className="lede__eyebrow">CLIENT ANNOUNCEMENT</div>
          <h2>Send the new-office announcement, personalized for every client.</h2>
          <div className="lede__meta">
            <div>
              Subject <b>{SUBJECT}</b>
            </div>
            <div>
              From <b>your Gmail account</b>
            </div>
          </div>
        </div>

        <ConnectorStrip conn={conn} />

        <ul className="rail">
          {STAGES.map(([id, label], i) => (
            <li key={id} data-state={railState(id)}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {label}
            </li>
          ))}
        </ul>

        {problem && (
          <div className="section">
            <div className="notice" data-tone="bad">
              <b>{problem.title}</b>
              <small>{problem.fix}</small>
            </div>
          </div>
        )}

        {stage === 'upload' && (
          <UploadStage dragOver={dragOver} setDragOver={setDragOver} onFile={handleFile} />
        )}

        {stage === 'review' && sheet && (
          <>
            <ColumnsStage
              fileName={fileName}
              sheets={sheets}
              sheetIndex={sheetIndex}
              onSheet={(i) => {
                setSheetIndex(i);
                applyDetection(sheets[i]);
                setPreviewIndex(0);
              }}
              headers={sheet.headers}
              detection={detection}
              firstNameIndex={firstNameIndex}
              emailIndex={emailIndex}
              setFirstNameIndex={setFirstNameIndex}
              setEmailIndex={setEmailIndex}
            />
            <RecipientsStage
              recipients={recipients}
              skipped={skipped}
              previewIndex={previewIndex}
              setPreviewIndex={setPreviewIndex}
              showPreview={showPreview}
              setShowPreview={setShowPreview}
              canSend={canSend}
              conn={conn}
              onSend={attemptSend}
              onStartOver={startOver}
            />
          </>
        )}

        {stage === 'confirm' && (
          <ConfirmStage
            recipients={recipients}
            onBack={() => setStage('review')}
            onConfirm={() => runSend(recipients)}
          />
        )}

        {stage === 'send' && (
          <SendingStage log={log} cursor={cursor} onStop={() => { stopRef.current = true; }} />
        )}

        {stage === 'results' && (
          <ResultsStage
            log={log}
            counts={counts}
            halted={halted}
            canSave={!!dlRef.current}
            onRetryFailed={() => runSend(log.filter((r) => r.status === 'failed'))}
            onRetryUncertain={() => runSend(log.filter((r) => r.status === 'uncertain'))}
            onSendRest={() => runSend(log.filter((r) => r.status === 'stopped'))}
            onSave={saveLog}
            onStartOver={startOver}
          />
        )}

        <footer className="foot">
          Asif Jabbarov · Mortgage Broker · Real Mortgage Associates, License #M14000335
          <br />
          Your spreadsheet is read in this page and never uploaded. Messages are sent one
          at a time from your own Gmail account — nothing goes out until you press Send.
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ConnectorStrip({ conn }) {
  const copy = {
    checking: ['wait', 'Checking your Gmail connection…', null],
    ready: ['ok', 'Gmail is connected.', 'Messages will be sent from your own account.'],
    reauth: [
      'bad',
      'Gmail needs reconnecting.',
      'Reconnect Gmail in claude.ai Settings → Connectors, then reload this page.',
    ],
    missing: [
      'bad',
      'Gmail is not connected.',
      'Add the Gmail connector in claude.ai Settings → Connectors, then reload this page.',
    ],
    unavailable: [
      'bad',
      'Sending is unavailable here.',
      'Open this page from claude.ai — a direct link cannot reach your connectors. You can still check a list and preview the email.',
    ],
    error: ['bad', conn.title, conn.fix],
  }[conn.status] ?? ['bad', 'Gmail is unavailable.', null];

  const [tone, title, detail] = copy;
  return (
    <div className="conn" data-tone={tone}>
      <span className="conn__dot" />
      <b>{title}</b>
      {detail && <span>{detail}</span>}
    </div>
  );
}

function UploadStage({ dragOver, setDragOver, onFile }) {
  const ref = useRef(null);
  return (
    <section className="section">
      <div className="section__head">
        <div className="eyebrow">01 — UPLOAD</div>
        <h3>Your client list</h3>
        <p className="section__note">
          An Excel workbook with a first-name column and an email column. It is read here
          in the page and never uploaded anywhere.
        </p>
      </div>
      <div
        className="drop"
        data-over={dragOver}
        role="button"
        tabIndex={0}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ref.current?.click())}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files?.[0]); }}
      >
        <strong>Drop your spreadsheet here, or click to choose one</strong>
        <span>XLSX / XLS</span>
      </div>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </section>
  );
}

function ColumnPicker({ label, headers, value, onChange, source, hint }) {
  const [text, kind] =
    source === 'header'
      ? ['FOUND IN HEADER', 'ok']
      : source === 'content'
        ? ['GUESSED FROM DATA', 'guess']
        : ['NOT FOUND', 'bad'];
  return (
    <label className="field">
      <span className="field__label">
        {label}
        <span className="chip" data-kind={kind}>{text}</span>
      </span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={-1}>— none —</option>
        {headers.map((h, i) => (
          <option key={`${h}-${i}`} value={i}>{h || `(column ${i + 1})`}</option>
        ))}
      </select>
      <span className="field__hint">{hint}</span>
    </label>
  );
}

function ColumnsStage(props) {
  const {
    fileName, sheets, sheetIndex, onSheet, headers, detection,
    firstNameIndex, emailIndex, setFirstNameIndex, setEmailIndex,
  } = props;
  return (
    <section className="section">
      <div className="section__head">
        <div className="eyebrow">02 — REVIEW</div>
        <h3>Check the columns</h3>
        <p className="section__note">
          Reading <b>{fileName}</b>
          {sheets.length > 1 ? ` — ${sheets.length} sheets in this workbook.` : '.'} Change
          either column if the wrong one was picked.
        </p>
      </div>

      {sheets.length > 1 && (
        <label className="field">
          <span className="field__label">SHEET</span>
          <select value={sheetIndex} onChange={(e) => onSheet(Number(e.target.value))}>
            {sheets.map((s, i) => (
              <option key={s.name} value={i}>{s.name} — {s.rows.length} rows</option>
            ))}
          </select>
        </label>
      )}

      <div className="grid2">
        <ColumnPicker
          label="FIRST NAME"
          headers={headers}
          value={firstNameIndex}
          onChange={setFirstNameIndex}
          source={detection?.firstNameSource}
          hint="A blank name becomes a neutral greeting."
        />
        <ColumnPicker
          label="EMAIL"
          headers={headers}
          value={emailIndex}
          onChange={setEmailIndex}
          source={detection?.emailSource}
          hint="Rows without a usable address are left out."
        />
      </div>
    </section>
  );
}

function RecipientsStage(props) {
  const {
    recipients, skipped, previewIndex, setPreviewIndex, showPreview, setShowPreview,
    canSend, conn, onSend, onStartOver,
  } = props;
  const who = recipients[previewIndex];

  return (
    <section className="section">
      <div className="section__head">
        <div className="eyebrow">03 — RECIPIENTS</div>
        <h3>
          {recipients.length} {recipients.length === 1 ? 'client' : 'clients'} will receive this
        </h3>
        <p className="section__note">
          {skipped.length > 0
            ? `${skipped.length} ${skipped.length === 1 ? 'row is' : 'rows are'} left out — open the list below to see why.`
            : 'Every row in this sheet has a usable address.'}
        </p>
      </div>

      {recipients.length > 0 && (
        <div className="scroll">
          <table>
            <thead>
              <tr><th>ROW</th><th>FIRST NAME</th><th>EMAIL</th></tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={`${r.rowNumber}-${r.email}`}>
                  <td className="n">{r.rowNumber}</td>
                  <td>{r.firstName || <span className="blank">no name</span>}</td>
                  <td className="addr">{r.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {skipped.length > 0 && (
        <details>
          <summary>{skipped.length} ROW{skipped.length === 1 ? '' : 'S'} LEFT OUT</summary>
          <div className="scroll">
            <table>
              <thead>
                <tr><th>ROW</th><th>FIRST NAME</th><th>VALUE</th><th>WHY</th></tr>
              </thead>
              <tbody>
                {skipped.map((s, i) => (
                  <tr key={`${s.rowNumber}-${i}`}>
                    <td className="n">{s.rowNumber}</td>
                    <td>{s.firstName || <span className="blank">no name</span>}</td>
                    <td className="addr">{s.raw || <span className="blank">empty</span>}</td>
                    <td className="why">{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {recipients.length > 0 && (
        <>
          <div className="actions">
            <button className="link" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? 'Hide the email' : 'Preview the email as a client sees it'}
            </button>
          </div>
          {showPreview && who && (
            <>
              <label className="field">
                <span className="field__label">PREVIEWING</span>
                <select value={previewIndex} onChange={(e) => setPreviewIndex(Number(e.target.value))}>
                  {recipients.map((r, i) => (
                    <option key={`${r.rowNumber}-${r.email}`} value={i}>
                      {r.firstName || 'no name'} — {r.email}
                    </option>
                  ))}
                </select>
              </label>
              <iframe
                className="preview"
                title={`Email as sent to ${who.email}`}
                sandbox=""
                srcDoc={personalize(who.firstName)}
              />
            </>
          )}
        </>
      )}

      {!canSend && conn.status !== 'checking' && (
        <div className="notice" data-tone="warn">
          <b>You can review the list, but not send yet</b>
          <small>Sending needs a working Gmail connection — see the note at the top of the page.</small>
        </div>
      )}

      <div className="actions">
        <button className="primary" onClick={onSend} disabled={recipients.length === 0 || !canSend}>
          Send to {recipients.length}
        </button>
        <button className="ghost" onClick={onStartOver}>Use a different file</button>
      </div>
    </section>
  );
}

function ConfirmStage({ recipients, onBack, onConfirm }) {
  return (
    <section className="section">
      <div className="section__head">
        <div className="eyebrow">04 — CONFIRM</div>
        <h3>Send to {recipients.length} clients?</h3>
        <p className="section__note">
          This is more than {CONFIRM_THRESHOLD} recipients, so it needs a second look. Email
          cannot be recalled once it leaves.
        </p>
      </div>

      <div className="stats">
        <div>
          <div className="stat__n">{recipients.length}</div>
          <div className="stat__l">RECIPIENTS</div>
        </div>
        <div>
          <div className="stat__n">1</div>
          <div className="stat__l">EMAIL EACH</div>
        </div>
        <div>
          <div className="stat__n">0</div>
          <div className="stat__l">CC / BCC</div>
        </div>
      </div>

      <div className="quote">
        Each client gets their own message, addressed only to them — nobody sees another
        client's address.
      </div>

      <div className="notice">
        <b>Subject — {SUBJECT}</b>
        <small>
          First: {recipients[0]?.email} · Last: {recipients[recipients.length - 1]?.email}
        </small>
      </div>

      <div className="actions">
        <button className="primary" onClick={onConfirm}>Confirm — Send All</button>
        <button className="ghost" onClick={onBack}>Back to the list</button>
      </div>
    </section>
  );
}

const PILL = {
  sent: 'SENT',
  failed: 'FAILED',
  uncertain: 'CHECK SENT',
  sending: 'SENDING',
  pending: 'WAITING',
  stopped: 'NOT SENT',
};

function SendingStage({ log, cursor, onStop }) {
  const done = log.filter((r) => ['sent', 'failed', 'uncertain'].includes(r.status)).length;
  const pct = log.length ? Math.round((done / log.length) * 100) : 0;
  const now = log[cursor];

  return (
    <section className="section">
      <div className="section__head">
        <div className="eyebrow">05 — SENDING</div>
        <h3>{done} of {log.length} done</h3>
      </div>

      <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="section__note">
        {now && now.status !== 'stopped' ? `Sending to ${now.email}…` : 'Wrapping up…'}
      </p>

      <div className="scroll">
        <table>
          <tbody>
            {log.map((r) => (
              <tr key={`${r.rowNumber}-${r.email}`}>
                <td className="n">{r.rowNumber}</td>
                <td>{r.firstName}</td>
                <td className="addr">{r.email}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className="pill" data-s={r.status}>{PILL[r.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="actions">
        <button className="danger" onClick={onStop}>Stop after this one</button>
      </div>
    </section>
  );
}

function ResultsStage(props) {
  const { log, counts, halted, canSave, onRetryFailed, onRetryUncertain, onSendRest, onSave, onStartOver } = props;

  const headline = [
    `${counts.sent} sent`,
    counts.failed ? `${counts.failed} failed` : null,
    counts.uncertain ? `${counts.uncertain} to check` : null,
    counts.stopped ? `${counts.stopped} not sent` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className="section">
      <div className="section__head">
        <div className="eyebrow">RESULTS</div>
        <h3>{headline}</h3>
      </div>

      <div className="stats">
        <div>
          <div className="stat__n" data-t="ok">{counts.sent}</div>
          <div className="stat__l">SENT</div>
        </div>
        {counts.failed > 0 && (
          <div>
            <div className="stat__n" data-t="bad">{counts.failed}</div>
            <div className="stat__l">FAILED</div>
          </div>
        )}
        {counts.uncertain > 0 && (
          <div>
            <div className="stat__n" data-t="warn">{counts.uncertain}</div>
            <div className="stat__l">TO CHECK</div>
          </div>
        )}
        {counts.stopped > 0 && (
          <div>
            <div className="stat__n">{counts.stopped}</div>
            <div className="stat__l">NOT SENT</div>
          </div>
        )}
      </div>

      {halted && (
        <div className="notice" data-tone="bad">
          <b>Stopped — {halted.title}</b>
          <small>{halted.fix} The remaining clients were not contacted.</small>
        </div>
      )}

      {counts.uncertain > 0 && (
        <div className="notice" data-tone="warn">
          <b>{counts.uncertain} {counts.uncertain === 1 ? 'message' : 'messages'} may have gone out anyway</b>
          <small>
            Gmail stopped answering before it confirmed, so these could have been delivered
            or not. Check your Sent folder before resending — resending a delivered message
            emails that client twice.
          </small>
        </div>
      )}

      <details open={counts.failed + counts.uncertain > 0}>
        <summary>FULL LOG — {log.length} ROWS</summary>
        <div className="scroll">
          <table>
            <thead>
              <tr><th>ROW</th><th>FIRST NAME</th><th>EMAIL</th><th>STATUS</th><th>DETAIL</th></tr>
            </thead>
            <tbody>
              {log.map((r) => (
                <tr key={`${r.rowNumber}-${r.email}`}>
                  <td className="n">{r.rowNumber}</td>
                  <td>{r.firstName}</td>
                  <td className="addr">{r.email}</td>
                  <td><span className="pill" data-s={r.status}>{PILL[r.status]}</span></td>
                  <td className="why">{r.detail || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="actions">
        {counts.failed > 0 && (
          <button className="primary" onClick={onRetryFailed}>
            Retry the {counts.failed} that failed
          </button>
        )}
        {counts.stopped > 0 && (
          <button className="primary" onClick={onSendRest}>
            Send the remaining {counts.stopped}
          </button>
        )}
        {counts.uncertain > 0 && (
          <button className="ghost" onClick={onRetryUncertain}>
            Resend the {counts.uncertain} to check — only after checking Sent
          </button>
        )}
        {canSave && <button className="ghost" onClick={onSave}>Save the log</button>}
        <button className="ghost" onClick={onStartOver}>Start over</button>
      </div>
    </section>
  );
}
