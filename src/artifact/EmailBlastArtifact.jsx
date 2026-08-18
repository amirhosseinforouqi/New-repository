import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseWorkbook, detectColumns, buildRecipients } from '../lib/excel.js';
import { personalize } from '../lib/personalize.js';
import { EMAIL_TEMPLATE_TEXT } from '../emailTemplateText.js';
import {
  sendOne,
  describeMcpError,
  isAmbiguous,
  isQuotaError,
  isDailyQuotaError,
  resolveSenderAddress,
  GMAIL_SEND_TOOL,
} from '../lib/gmailConnector.js';
import {
  SUBJECT,
  SEND_DELAY_MS,
  DAILY_CAP_DEFAULT,
  DAILY_CAP_CHOICES,
  QUOTA_BACKOFF_MS,
  QUOTA_GIVE_UP,
  MAX_PACE_MS,
  TABLE_WINDOW,
  RESUME_KEY,
  SUBJECT_KEY,
  ADDRESS_KEY,
} from '../config.js';

const RAIL = [
  ['upload', 'UPLOAD'],
  ['review', 'REVIEW'],
  ['confirm', 'CONFIRM'],
  ['send', 'SEND'],
  ['results', 'RESULTS'],
];
const RAIL_OF = { upload: 'upload', review: 'review', confirm: 'confirm', ready: 'send', sending: 'send', results: 'results' };

/** Codes that will fail identically for everyone left — stop rather than grind. */
const FATAL = new Set([
  'needs_reauth', 'server_not_connected', 'selection_required', 'server_not_found',
  'not_in_manifest', 'blocked_by_policy', 'approval_required',
  'not_granted', 'capability_disabled', 'capability_removed',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nf = new Intl.NumberFormat();

const greetingOf = (r, mode) => (mode === 'full' ? r.fullName || r.firstName : r.firstName);

/** Name an account by the address it sends from once that is known, since the
 *  connector's display name ("Gmail") does not say which mailbox it is. */
const accountLabel = (server, addresses) => (server ? addresses?.[server] || server : '');

function humanDuration(ms) {
  if (!isFinite(ms) || ms <= 0) return '—';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function EmailBlastArtifact() {
  const [stage, setStage] = useState('upload');
  const [problem, setProblem] = useState(null);

  const [conn, setConn] = useState({ status: 'checking' });
  const [accounts, setAccounts] = useState([]);
  const [fromServer, setFromServer] = useState('');
  const mcpRef = useRef(null);
  const dlRef = useRef(null);

  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [detection, setDetection] = useState(null);
  const [greeting, setGreeting] = useState('first');
  const [dragOver, setDragOver] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  const [dailyCap, setDailyCap] = useState(DAILY_CAP_DEFAULT);
  const [log, setLog] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [runInfo, setRunInfo] = useState(null);
  const [halted, setHalted] = useState(null);
  const [resumable, setResumable] = useState(null);
  const [copied, setCopied] = useState(null);
  const [subject, setSubject] = useState(() => {
    try { return window.localStorage.getItem(SUBJECT_KEY) || SUBJECT; } catch { return SUBJECT; }
  });
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [addresses, setAddresses] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(ADDRESS_KEY) || '{}'); } catch { return {}; }
  });
  const stopRef = useRef(false);
  const logRef = useRef([]);
  logRef.current = log;

  // --- capabilities --------------------------------------------------------
  useEffect(() => {
    let live = true;
    (async () => {
      // Written as a plain call, not optional chaining: the bundler lowers `?.`
      // into an aliased `.call(...)`, which erases the recognizable
      // `claude.use("mcp")` call site from the shipped page.
      const mcp = window.claude && window.claude.use ? await window.claude.use('mcp') : null;
      if (!live) return;
      if (!mcp) return setConn({ status: 'unavailable' });
      mcpRef.current = mcp;
      try {
        const { servers } = await mcp.listTools();
        if (!live) return;
        const senders = servers.filter((s) => s.tools?.some((t) => t.name === GMAIL_SEND_TOOL));
        setAccounts(senders);
        if (senders.length === 0) return setConn({ status: 'missing' });
        const healthy = senders.find((s) => s.authStatus !== 'needs_reauth') ?? senders[0];
        setFromServer(healthy.server);
        setConn({ status: healthy.authStatus === 'needs_reauth' ? 'reauth' : 'ready' });
      } catch (e) {
        if (live) setConn({ status: 'error', ...describeMcpError(e) });
      }
    })();
    (async () => {
      const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
      if (live) dlRef.current = dl;
    })();
    try {
      const saved = JSON.parse(window.localStorage.getItem(RESUME_KEY) || 'null');
      if (saved?.log?.some((r) => ['pending', 'stopped', 'waiting', 'sending'].includes(r.status))) setResumable(saved);
    } catch { /* nothing usable stored */ }
    return () => { live = false; };
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(SUBJECT_KEY, subject); } catch { /* private mode */ }
  }, [subject]);

  useEffect(() => {
    try { window.localStorage.setItem(ADDRESS_KEY, JSON.stringify(addresses)); } catch { /* private mode */ }
  }, [addresses]);

  const sheet = sheets[sheetIndex];

  const { recipients, skipped } = useMemo(() => {
    if (!sheet || !detection) return { recipients: [], skipped: [] };
    return buildRecipients(sheet.rows, detection, sheet.firstDataRow);
  }, [sheet, detection]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setProblem(null);
    try {
      const isCsv = /\.(csv|tsv|txt)$/i.test(file.name);
      const parsed = parseWorkbook(await file.arrayBuffer(), { csv: isCsv });
      if (parsed.sheets.length === 0) throw new Error('it has no readable rows');
      const best = parsed.sheets.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));
      const idx = parsed.sheets.indexOf(best);
      setFileName(file.name);
      setSheets(parsed.sheets);
      setSheetIndex(idx);
      const found = detectColumns(best.headers, best.rows);
      setDetection(found);
      setGreeting('first');
      setPreviewIndex(0);
      setShowPreview(false);
      setStage('review');
    } catch (e) {
      setProblem({
        title: 'That file could not be read',
        fix: `${file.name} could not be opened — ${e.message}. Save it as .xlsx or .csv and try again.`,
      });
    }
  }, []);

  const chooseSheet = (i) => {
    setSheetIndex(i);
    setDetection(detectColumns(sheets[i].headers, sheets[i].rows));
    setPreviewIndex(0);
  };

  const startOver = () => {
    setStage('upload'); setSheets([]); setFileName(''); setLog([]);
    setProblem(null); setHalted(null); setDetection(null); setRunInfo(null);
  };

  const persist = useCallback((rows) => {
    try {
      window.localStorage.setItem(RESUME_KEY, JSON.stringify({
        savedAt: Date.now(), fileName, fromServer, greeting, subject, log: rows,
      }));
    } catch { /* quota or private mode — the run still works, it just can't resume */ }
  }, [fileName, fromServer, greeting, subject]);

  // --- the send loop -------------------------------------------------------
  const runQueue = useCallback(async (indices) => {
    const mcp = mcpRef.current;
    if (!mcp) {
      setProblem({ title: 'Sending is unavailable here', fix: 'Open this page from claude.ai so it can reach your Gmail connector.' });
      return;
    }
    setProblem(null); setHalted(null); setStage('sending');
    stopRef.current = false;

    const cap = dailyCap > 0 ? Math.min(dailyCap, indices.length) : indices.length;
    const startedAt = Date.now();
    setRunInfo({ total: indices.length, planned: cap, startedAt, done: 0, capped: false });

    const patch = (i, next) =>
      setLog((prev) => { const out = prev.map((r, j) => (j === i ? { ...r, ...next } : r)); logRef.current = out; return out; });

    let done = 0;
    let stoppedEarly = null;
    let learnedAddress = false;
    let quotaStreak = 0;
    let pace = Number.isFinite(window.__sendDelayMs) ? window.__sendDelayMs : SEND_DELAY_MS;
    // A test harness may shorten the throttle waits; production uses the config.
    const backoff = Array.isArray(window.__quotaBackoff) ? window.__quotaBackoff : QUOTA_BACKOFF_MS;

    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      if (stopRef.current) { stoppedEarly = 'stopped'; break; }
      if (k >= cap) { stoppedEarly = 'cap'; break; }

      setCursor(i);
      patch(i, { status: 'sending' });
      const row = logRef.current[i];

      // Gmail refuses on quota before it accepts anything, so nothing was
      // delivered and waiting it out cannot duplicate a message. Give the same
      // recipient a few widening pauses before calling it a failure.
      let attempt = 0;
      for (;;) {
        try {
          const sent = await sendOne(mcp, {
            server: fromServer,
            to: row.email,
            subject,
            html: personalize(greetingOf(row, greeting)),
            text: personalize(greetingOf(row, greeting), EMAIL_TEMPLATE_TEXT),
          });
          patch(i, { status: 'sent', detail: null, code: null });
          quotaStreak = 0;
          // The connector has no "who am I" lookup, so the sending address is
          // read off the first message that actually went out, then remembered.
          if (!learnedAddress && !addresses[fromServer] && sent?.messageId) {
            learnedAddress = true;
            resolveSenderAddress(mcp, { server: fromServer, messageId: sent.messageId })
              .then((addr) => { if (addr) setAddresses((prev) => ({ ...prev, [fromServer]: addr })); });
          }
          break;
        } catch (e) {
          const d = describeMcpError(e);

          if (isQuotaError(e) && !isDailyQuotaError(e) && attempt < backoff.length && !stopRef.current) {
            const wait = backoff[attempt];
            attempt++;
            // Every later send slows down too, or the next one just hits it again.
            pace = Math.min(Math.max(pace * 2, 2000), MAX_PACE_MS);
            setRunInfo((p) => ({ ...p, throttledUntil: Date.now() + wait, pace }));
            patch(i, { status: 'waiting', detail: `Gmail is throttling — waiting ${Math.round(wait / 1000)}s, then trying again.` });
            await sleep(wait);
            if (stopRef.current) { patch(i, { status: 'stopped', detail: null }); break; }
            patch(i, { status: 'sending' });
            continue;
          }

          patch(i, { status: isAmbiguous(d.code) ? 'uncertain' : 'failed', detail: d.fix, code: d.code });

          if (isQuotaError(e)) {
            quotaStreak++;
            // A day's allowance does not come back in a minute. Once several
            // recipients in a row exhaust their retries, stop rather than
            // marking the rest of the list failed for the same reason.
            if (isDailyQuotaError(e) || quotaStreak >= QUOTA_GIVE_UP) {
              setHalted({ ...d, quota: true });
              stoppedEarly = 'quota';
            }
          }
          if (FATAL.has(d.code)) { setHalted(d); stoppedEarly = 'fatal'; }
          break;
        }
      }
      if (stoppedEarly === 'fatal' || stoppedEarly === 'quota') break;

      done++;
      const elapsed = Date.now() - startedAt;
      setRunInfo((p) => ({ ...p, done, etaMs: (elapsed / done) * (cap - done) }));
      if (done % 5 === 0) persist(logRef.current);
      // Pacing keeps the run gentle on Gmail's rate limit, and widens itself
      // whenever Gmail pushes back. A test harness may shorten the starting
      // value via window.__sendDelayMs; production starts from the config.
      if (k < indices.length - 1 && pace > 0) await sleep(pace);
    }

    setLog((prev) => {
      const out = prev.map((r) => (['sending', 'waiting', 'pending'].includes(r.status) ? { ...r, status: 'stopped' } : r));
      logRef.current = out; persist(out); return out;
    });
    setRunInfo((p) => ({ ...p, done, capped: stoppedEarly === 'cap', stopped: stoppedEarly, throttledUntil: null }));
    setStage('results');
  }, [dailyCap, fromServer, greeting, subject, addresses, persist]);

  const beginRun = () => {
    const rows = recipients.map((r) => ({ ...r, status: 'pending', detail: null, code: null }));
    setLog(rows); logRef.current = rows;
    runQueue(rows.map((_, i) => i));
  };

  const rerun = (predicate) => {
    const idx = log.map((r, i) => (predicate(r) ? i : -1)).filter((i) => i >= 0);
    if (idx.length) runQueue(idx);
  };

  const doResume = () => {
    setLog(resumable.log); logRef.current = resumable.log;
    setFileName(resumable.fileName || '');
    if (resumable.greeting) setGreeting(resumable.greeting);
    if (resumable.subject) setSubject(resumable.subject);
    setResumable(null);
    const idx = resumable.log.map((r, i) => (['pending', 'stopped', 'waiting', 'sending'].includes(r.status) ? i : -1)).filter((i) => i >= 0);
    runQueue(idx);
  };

  const discardResume = () => {
    try { window.localStorage.removeItem(RESUME_KEY); } catch { /* nothing to clear */ }
    setResumable(null);
  };

  const canSend = conn.status === 'ready' && !!fromServer && subject.trim() !== '';

  const counts = useMemo(() => {
    const by = (s) => log.filter((r) => r.status === s).length;
    return { sent: by('sent'), failed: by('failed'), uncertain: by('uncertain'), stopped: by('stopped') };
  }, [log]);

  const buildCsv = useCallback(() => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [
      ['row', 'first_name', 'full_name', 'email', 'status', 'detail'].join(','),
      ...log.map((r) => [r.rowNumber, r.firstName, r.fullName, r.email, r.status, r.detail].map(esc).join(',')),
    ].join('\r\n');
  }, [log]);

  /**
   * Hand over the log however this view allows: a real file save when the
   * downloads capability is granted, otherwise the clipboard, otherwise a
   * text box to copy out of by hand. A record of who was contacted is worth
   * keeping after a run of this size.
   */
  const saveLog = async () => {
    const csv = buildCsv();
    const dl = dlRef.current;
    if (dl) {
      try {
        await dl.save({ filename: `email-blast-${new Date().toISOString().slice(0, 10)}.csv`, data: csv });
        return;
      } catch { /* the viewer declined — fall through to copying */ }
    }
    try {
      await navigator.clipboard.writeText(csv);
      setCopied('done');
      return;
    } catch { /* clipboard blocked in this frame — show it instead */ }
    setCopied('manual');
  };

  const railState = (id) => {
    const order = RAIL.map(([s]) => s);
    const here = order.indexOf(RAIL_OF[stage]);
    const mine = order.indexOf(id);
    return mine === here ? 'active' : mine < here ? 'done' : 'todo';
  };

  return (
    <div className="shell">
      <div className="card">
        <div className="card__rule" />

        <header className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 34 26" width="30" height="23" fill="none" stroke="currentColor"
                 strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="0.8" y="3.8" width="21.4" height="16.4" />
              <polyline points="0.8,3.8 11.5,12.6 22.2,3.8" />
              <line x1="25.5" y1="8" x2="33" y2="8" />
              <line x1="25.5" y1="12.5" x2="30" y2="12.5" />
              <line x1="25.5" y1="17" x2="33" y2="17" />
            </svg>
          </span>
          <span className="brand__text">
            <span className="brand__name">MAIL RUNNER</span>
            <span className="brand__sub">BULK EMAIL SENDER</span>
          </span>
        </header>

        <ConnectorStrip conn={conn} address={addresses[fromServer]} />

        <CampaignBar
          accounts={accounts} fromServer={fromServer} setFromServer={setFromServer}
          addresses={addresses} subject={subject} setSubject={setSubject}
          showAddAccount={showAddAccount} setShowAddAccount={setShowAddAccount}
        />

        <ul className="rail">
          {RAIL.map(([id, label], i) => (
            <li key={id} data-state={railState(id)}>
              <span>{String(i + 1).padStart(2, '0')}</span>{label}
            </li>
          ))}
        </ul>

        {problem && (
          <div className="section">
            <div className="notice" data-tone="bad"><b>{problem.title}</b><small>{problem.fix}</small></div>
          </div>
        )}

        {resumable && stage === 'upload' && (
          <div className="section">
            <div className="notice" data-tone="warn">
              <b>An unfinished run is saved on this device</b>
              <small>
                {nf.format(resumable.log.filter((r) => r.status === 'sent').length)} already sent,{' '}
                {nf.format(resumable.log.filter((r) => ['pending', 'stopped', 'waiting', 'sending'].includes(r.status)).length)} still to go
                {resumable.fileName ? ` from ${resumable.fileName}` : ''}. Resuming skips everyone already contacted.
              </small>
              <div className="actions" style={{ paddingTop: 6 }}>
                <button className="primary" onClick={doResume} disabled={!canSend}>Resume that run</button>
                <button className="ghost" onClick={discardResume}>Discard it</button>
              </div>
            </div>
          </div>
        )}

        {stage === 'upload' && <UploadStage dragOver={dragOver} setDragOver={setDragOver} onFile={handleFile} />}

        {stage === 'review' && sheet && detection && (
          <ReviewStage
            fileName={fileName} sheets={sheets} sheetIndex={sheetIndex} onSheet={chooseSheet}
            detection={detection} headers={sheet.headers}
            greeting={greeting} setGreeting={setGreeting}
            recipients={recipients} skipped={skipped}
            previewIndex={previewIndex} setPreviewIndex={setPreviewIndex}
            showPreview={showPreview} setShowPreview={setShowPreview}
            onContinue={() => setStage('confirm')} onStartOver={startOver}
          />
        )}

        {stage === 'confirm' && (
          <ConfirmStage
            recipients={recipients} greeting={greeting} skipped={skipped} subject={subject}
            onBack={() => setStage('review')} onConfirm={() => setStage('ready')}
          />
        )}

        {stage === 'ready' && (
          <ReadyStage
            recipients={recipients} greeting={greeting} canSend={canSend}
            fromServer={fromServer} subject={subject} addresses={addresses}
            dailyCap={dailyCap} setDailyCap={setDailyCap}
            onSend={beginRun} onBack={() => setStage('confirm')}
          />
        )}

        {stage === 'sending' && (
          <SendingStage log={log} cursor={cursor} runInfo={runInfo} onStop={() => { stopRef.current = true; }} />
        )}

        {stage === 'results' && (
          <ResultsStage
            log={log} counts={counts} halted={halted} runInfo={runInfo}
            copied={copied} csv={buildCsv}
            onRetryFailed={() => rerun((r) => r.status === 'failed')}
            onRetryUncertain={() => rerun((r) => r.status === 'uncertain')}
            onSendRest={() => rerun((r) => r.status === 'stopped')}
            onSave={saveLog} onStartOver={startOver}
          />
        )}

        <footer className="foot">
          Your spreadsheet is read in this page and never uploaded. Messages are sent one at a
          time from your own Gmail account — nothing goes out until you press Send.
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ConnectorStrip({ conn, address }) {
  const map = {
    checking: ['wait', 'Checking your Gmail connection…', null],
    ready: address
      ? ['ok', `Sending as ${address}`, 'Connected to your own Gmail account.']
      : ['ok', 'Gmail is connected.', 'Messages will be sent from your own account.'],
    reauth: ['bad', 'Gmail needs reconnecting.', 'Reconnect Gmail in claude.ai Settings → Connectors, then reload this page.'],
    missing: ['bad', 'Gmail is not connected.', 'Add the Gmail connector in claude.ai Settings → Connectors, then reload this page.'],
    unavailable: ['bad', 'Sending is unavailable here.', 'Open this page from claude.ai — a direct link cannot reach your connectors. You can still check a list and preview the email.'],
    error: ['bad', conn.title, conn.fix],
  };
  const [tone, title, detail] = map[conn.status] ?? ['bad', 'Gmail is unavailable.', null];
  return (
    <div className="conn" data-tone={tone}>
      <span className="conn__dot" /><b>{title}</b>{detail && <span>{detail}</span>}
    </div>
  );
}

/**
 * The two settings that apply to every message in a run, kept at the top of the
 * page rather than buried in a later step: which mailbox sends, and what the
 * subject line says. A page cannot add a connector itself — that is an account
 * action on claude.ai — so "Add an account" explains where to do it.
 */
function CampaignBar({ accounts, fromServer, setFromServer, addresses, subject, setSubject, showAddAccount, setShowAddAccount }) {
  const empty = subject.trim() === '';
  const known = addresses?.[fromServer];
  return (
    <div className="campaign">
      <div className="campaign__fields">
        <label className="field">
          <span className="field__label">
            SEND FROM
            <button className="link" type="button" onClick={() => setShowAddAccount((v) => !v)}>
              {showAddAccount ? 'close' : 'add an account'}
            </button>
          </span>
          <select
            value={fromServer}
            onChange={(e) => setFromServer(e.target.value)}
            disabled={accounts.length === 0}
          >
            {accounts.length === 0 && <option value="">no account connected</option>}
            {accounts.map((a) => (
              <option key={a.server} value={a.server}>
                {accountLabel(a.server, addresses)}
                {a.authStatus === 'needs_reauth' ? ' — needs reconnecting' : ''}
              </option>
            ))}
          </select>
          <span className="field__hint">
            {accounts.length === 0
              ? 'None connected yet.'
              : known
                ? `Sending as ${known}, via the ${fromServer} connector.`
                : 'Gmail does not tell a page which address it is. The exact sending address appears here after the first message goes out.'}
          </span>
        </label>

        <label className="field">
          <span className="field__label">SUBJECT</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject line for every message"
            aria-invalid={empty}
          />
          <span className="field__hint">
            {empty ? 'Every message needs a subject.' : 'Used for every message in the run.'}
          </span>
        </label>
      </div>

      {showAddAccount && (
        <div className="notice">
          <b>Adding another mailbox</b>
          <small>
            1 — Open claude.ai and go to Settings → Connectors.
            <br />
            2 — Connect the Google account you want to send from.
            <br />
            3 — Reload this page; it will appear in the list above.
          </small>
          <small>
            A newly connected mailbox also has to be allowed for this page. If it does not
            show up after reloading, ask Claude to republish the page with that connector
            included.
          </small>
        </div>
      )}
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
          An Excel workbook or CSV with a name column and an email column. Names and addresses are
          found automatically. The file is read here in the page and never uploaded.
        </p>
      </div>
      <div
        className="drop" data-over={dragOver} role="button" tabIndex={0}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ref.current?.click())}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files?.[0]); }}
      >
        <strong>Drop your spreadsheet here, or click to choose one</strong>
        <span>XLSX / CSV · BUILT FOR LISTS IN THE THOUSANDS</span>
      </div>
      <input ref={ref} type="file" style={{ display: 'none' }}
        accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        onChange={(e) => onFile(e.target.files?.[0])} />
    </section>
  );
}

/** Renders at most `limit` rows — a list in the thousands must not put every
 *  row in the document. */
function RowTable({ rows, head, limit = TABLE_WINDOW, render }) {
  const shown = rows.slice(0, limit);
  return (
    <div className="scroll">
      <table>
        {head && <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>}
        <tbody>
          {shown.map(render)}
          {rows.length > shown.length && (
            <tr>
              <td className="n">···</td>
              <td colSpan={(head?.length ?? 4) - 1} style={{ color: 'var(--muted)' }}>
                and {nf.format(rows.length - shown.length)} more — all of them are included
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReviewStage(props) {
  const {
    fileName, sheets, sheetIndex, onSheet, detection, headers, greeting, setGreeting,
    recipients, skipped, previewIndex, setPreviewIndex, showPreview, setShowPreview,
    onContinue, onStartOver,
  } = props;

  const nameCols = [
    detection.firstNameIndex >= 0 && headers[detection.firstNameIndex],
    detection.lastNameIndex >= 0 && headers[detection.lastNameIndex],
    detection.firstNameIndex < 0 && detection.fullNameIndex >= 0 && headers[detection.fullNameIndex],
  ].filter(Boolean);
  const emailCol = detection.emailIndex >= 0 ? headers[detection.emailIndex] : null;
  const sample = recipients[0];

  return (
    <>
      <section className="section">
        <div className="section__head">
          <div className="eyebrow">02 — REVIEW</div>
          <h3>What was found</h3>
          <p className="section__note">
            Reading <b>{fileName}</b>
            {sheets.length > 1 ? ` — using the sheet with the most rows.` : '.'}
          </p>
        </div>

        {sheets.length > 1 && (
          <label className="field">
            <span className="field__label">SHEET</span>
            <select value={sheetIndex} onChange={(e) => onSheet(Number(e.target.value))}>
              {sheets.map((s, i) => <option key={s.name} value={i}>{s.name} — {nf.format(s.rows.length)} rows</option>)}
            </select>
          </label>
        )}

        <div className="found">
          <div className="found__row">
            <span className="found__k">NAME</span>
            <span className="found__v">{nameCols.length ? nameCols.join(' + ') : 'not found'}</span>
            <span className="chip" data-kind={nameCols.length ? 'ok' : 'bad'}>
              {nameCols.length ? 'FOUND IN HEADER' : 'NOT FOUND'}
            </span>
          </div>
          <div className="found__row">
            <span className="found__k">EMAIL</span>
            <span className="found__v">{emailCol || (detection.emailIndex >= 0 ? `column ${detection.emailIndex + 1}` : 'not found')}</span>
            <span className="chip" data-kind={detection.emailSource === 'header' ? 'ok' : detection.emailSource === 'content' ? 'guess' : 'bad'}>
              {detection.emailSource === 'header' ? 'FOUND IN HEADER'
                : detection.emailSource === 'content' ? 'FOUND IN THE DATA' : 'NOT FOUND'}
            </span>
          </div>
        </div>

        {detection.emailIndex < 0 && (
          <div className="notice" data-tone="bad">
            <b>No email column in this sheet</b>
            <small>Nothing can be sent from it. Pick another sheet, or add a column headed “Email”.</small>
          </div>
        )}

        <div className="section__head" style={{ paddingTop: 6 }}>
          <span className="field__label">GREET EACH CLIENT BY</span>
        </div>
        <div className="choices">
          <button
            className={`choice${greeting === 'first' ? ' choice--on' : ''}`}
            onClick={() => setGreeting('first')} aria-pressed={greeting === 'first'}
          >
            <b>First name</b>
            <small>{sample ? `Hi ${sample.firstName || 'there'},` : 'Hi Sara,'}</small>
          </button>
          <button
            className={`choice${greeting === 'full' ? ' choice--on' : ''}`}
            onClick={() => setGreeting('full')} aria-pressed={greeting === 'full'}
            disabled={!detection.hasFullName}
          >
            <b>Full name</b>
            <small>
              {detection.hasFullName
                ? (sample ? `Hi ${sample.fullName || 'there'},` : 'Hi Sara Ahmadi,')
                : 'This sheet has no surname column'}
            </small>
          </button>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div className="eyebrow">03 — RECIPIENTS</div>
          <h3>{nf.format(recipients.length)} {recipients.length === 1 ? 'client' : 'clients'}</h3>
          <p className="section__note">
            {skipped.length > 0
              ? `${nf.format(skipped.length)} ${skipped.length === 1 ? 'row is' : 'rows are'} left out — open the list below to see why.`
              : 'Every row in this sheet has a usable address.'}
          </p>
        </div>

        {recipients.length > 0 && (
          <RowTable
            rows={recipients} head={['ROW', 'GREETED AS', 'EMAIL']}
            render={(r) => (
              <tr key={`${r.rowNumber}-${r.email}`}>
                <td className="n">{r.rowNumber}</td>
                <td>{greetingOf(r, greeting) || <span className="blank">no name</span>}</td>
                <td className="addr">{r.email}</td>
              </tr>
            )}
          />
        )}

        {skipped.length > 0 && (
          <details>
            <summary>{nf.format(skipped.length)} ROW{skipped.length === 1 ? '' : 'S'} LEFT OUT</summary>
            <RowTable
              rows={skipped} head={['ROW', 'NAME', 'VALUE', 'WHY']}
              render={(s, i) => (
                <tr key={`${s.rowNumber}-${i}`}>
                  <td className="n">{s.rowNumber}</td>
                  <td>{s.firstName || <span className="blank">no name</span>}</td>
                  <td className="addr">{s.raw || <span className="blank">empty</span>}</td>
                  <td className="why">{s.reason}</td>
                </tr>
              )}
            />
          </details>
        )}

        {recipients.length > 0 && (
          <>
            <div className="actions">
              <button className="link" onClick={() => setShowPreview((v) => !v)}>
                {showPreview ? 'Hide the email' : 'Preview the email as a client sees it'}
              </button>
            </div>
            {showPreview && recipients[previewIndex] && (
              <>
                <label className="field">
                  <span className="field__label">PREVIEWING</span>
                  <select value={previewIndex} onChange={(e) => setPreviewIndex(Number(e.target.value))}>
                    {recipients.slice(0, TABLE_WINDOW).map((r, i) => (
                      <option key={`${r.rowNumber}-${r.email}`} value={i}>
                        {greetingOf(r, greeting) || 'no name'} — {r.email}
                      </option>
                    ))}
                  </select>
                </label>
                <iframe className="preview" title="Email preview" sandbox=""
                  srcDoc={personalize(greetingOf(recipients[previewIndex], greeting))} />
              </>
            )}
          </>
        )}

        <div className="actions">
          <button className="primary" onClick={onContinue} disabled={recipients.length === 0}>
            Continue
          </button>
          <button className="ghost" onClick={onStartOver}>Use a different file</button>
        </div>
      </section>
    </>
  );
}

function ConfirmStage({ recipients, greeting, skipped, subject, onBack, onConfirm }) {
  return (
    <section className="section">
      <div className="section__head">
        <div className="eyebrow">04 — CONFIRM</div>
        <h3>Check this before you arm the send</h3>
        <p className="section__note">Nothing is sent on this screen.</p>
      </div>

      <div className="stats">
        <div><div className="stat__n">{nf.format(recipients.length)}</div><div className="stat__l">RECIPIENTS</div></div>
        <div><div className="stat__n">{nf.format(skipped.length)}</div><div className="stat__l">LEFT OUT</div></div>
        <div><div className="stat__n">1</div><div className="stat__l">EMAIL EACH</div></div>
        <div><div className="stat__n">0</div><div className="stat__l">CC / BCC</div></div>
      </div>

      <div className="quote">
        Each client gets their own message, addressed only to them — nobody sees another
        client's address.
      </div>

      <div className="notice">
        <b>Subject — {subject}</b>
        <small>
          Greeting: {greeting === 'full' ? 'full name' : 'first name'} · First:{' '}
          {recipients[0]?.email} · Last: {recipients[recipients.length - 1]?.email}
        </small>
      </div>

      <div className="actions">
        <button className="primary" onClick={onConfirm}>Confirm — this list is correct</button>
        <button className="ghost" onClick={onBack}>Back to the list</button>
      </div>
    </section>
  );
}

function ReadyStage(props) {
  const { recipients, greeting, canSend, fromServer, subject, addresses, dailyCap, setDailyCap, onSend, onBack } = props;
  const planned = dailyCap > 0 ? Math.min(dailyCap, recipients.length) : recipients.length;
  const leftover = recipients.length - planned;
  const eta = planned * (SEND_DELAY_MS + 1500);

  return (
    <section className="section">
      <div className="section__head">
        <div className="eyebrow">READY TO SEND</div>
        <h3>Send {nf.format(planned)} {planned === 1 ? 'email' : 'emails'} now?</h3>
        <p className="section__note">
          This is the last step. Pressing Send starts contacting clients immediately, and
          email cannot be recalled.
        </p>
      </div>

      <div className="found">
        <div className="found__row">
          <span className="found__k">FROM</span>
          <span className="found__v">
            {accountLabel(fromServer, addresses) || 'no account connected'}
            {addresses?.[fromServer] ? '' : ' — address confirmed after the first send'}
          </span>
        </div>
        <div className="found__row">
          <span className="found__k">SUBJECT</span>
          <span className="found__v">{subject}</span>
        </div>
      </div>

      <div className="grid2">
        <label className="field">
          <span className="field__label">STOP AFTER</span>
          <select value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))}>
            {DAILY_CAP_CHOICES.map((n) => (
              <option key={n} value={n}>{n === 0 ? 'No limit — send the whole list' : `${nf.format(n)} emails`}</option>
            ))}
          </select>
          <span className="field__hint">
            Gmail caps daily sending — about 500 on a personal account, 2,000 on Workspace.
          </span>
        </label>
      </div>

      <div className="stats">
        <div><div className="stat__n">{nf.format(planned)}</div><div className="stat__l">SENDING NOW</div></div>
        {leftover > 0 && <div><div className="stat__n" data-t="warn">{nf.format(leftover)}</div><div className="stat__l">LEFT FOR NEXT RUN</div></div>}
        <div><div className="stat__n">{humanDuration(eta)}</div><div className="stat__l">ROUGHLY</div></div>
      </div>

      {leftover > 0 && (
        <div className="notice" data-tone="warn">
          <b>{nf.format(leftover)} clients will be left for a later run</b>
          <small>
            Your progress is saved as it goes. Come back tomorrow, reopen this page, and
            resume — everyone already contacted is skipped.
          </small>
        </div>
      )}

      {recipients.length > 500 && dailyCap === 0 && (
        <div className="notice" data-tone="warn">
          <b>Sending {nf.format(recipients.length)} in one run may hit Gmail's daily limit</b>
          <small>
            A personal @gmail.com account stops accepting sends after roughly 500 a day.
            Once it does, the rest of the run fails. Consider a limit instead.
          </small>
        </div>
      )}

      <div className="notice">
        <b>Leave this page open while it sends</b>
        <small>
          Sending happens in this tab, one message at a time. If it closes, progress is
          saved and you can resume where it stopped.
        </small>
      </div>

      <div className="actions">
        <button className="primary big" onClick={onSend} disabled={!canSend || recipients.length === 0}>
          Send {nf.format(planned)} {planned === 1 ? 'email' : 'emails'}
        </button>
        <button className="ghost" onClick={onBack}>Back</button>
      </div>
      {!canSend && (
        <p className="section__note">
          Sending needs a working Gmail connection — see the note at the top of the page.
        </p>
      )}
    </section>
  );
}

const PILL = { sent: 'SENT', failed: 'FAILED', uncertain: 'CHECK SENT', sending: 'SENDING', waiting: 'THROTTLED', pending: 'WAITING', stopped: 'NOT SENT' };

function SendingStage({ log, cursor, runInfo, onStop }) {
  const planned = runInfo?.planned ?? log.length;
  const done = runInfo?.done ?? 0;
  const pct = planned ? Math.round((done / planned) * 100) : 0;
  const now = log[cursor];
  // Show a window around the cursor — a thousand live rows would crawl.
  const from = Math.max(0, cursor - 12);
  const window = log.slice(from, from + 40);

  return (
    <section className="section">
      <div className="section__head">
        <div className="eyebrow">SENDING — LEAVE THIS PAGE OPEN</div>
        <h3>{nf.format(done)} of {nf.format(planned)} sent</h3>
      </div>

      <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="section__note">
        {now && now.status !== 'stopped' ? `Sending to ${now.email}…` : 'Wrapping up…'}
        {runInfo?.etaMs ? ` · about ${humanDuration(runInfo.etaMs)} left` : ''}
      </p>

      {log.some((r) => r.status === 'waiting') && (
        <div className="notice" data-tone="warn">
          <b>Gmail is throttling — waiting, then carrying on</b>
          <small>
            Gmail would not take another message this quickly. Nothing was sent to this
            person yet. The run pauses, slows down, and picks up where it left off; leave
            the page open.
          </small>
        </div>
      )}

      <div className="scroll">
        <table>
          <tbody>
            {window.map((r) => (
              <tr key={`${r.rowNumber}-${r.email}`}>
                <td className="n">{r.rowNumber}</td>
                <td className="addr">{r.email}</td>
                <td style={{ textAlign: 'right' }}><span className="pill" data-s={r.status}>{PILL[r.status]}</span></td>
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
  const { log, counts, halted, runInfo, copied, csv, onRetryFailed, onRetryUncertain, onSendRest, onSave, onStartOver } = props;
  const [filter, setFilter] = useState('all');
  const rows = filter === 'all' ? log : log.filter((r) => r.status === filter);

  const headline = [
    `${nf.format(counts.sent)} sent`,
    counts.failed ? `${nf.format(counts.failed)} failed` : null,
    counts.uncertain ? `${nf.format(counts.uncertain)} to check` : null,
    counts.stopped ? `${nf.format(counts.stopped)} not sent` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className="section">
      <div className="section__head">
        <div className="eyebrow">RESULTS</div>
        <h3>{headline}</h3>
      </div>

      <div className="stats">
        <div><div className="stat__n" data-t="ok">{nf.format(counts.sent)}</div><div className="stat__l">SENT</div></div>
        {counts.failed > 0 && <div><div className="stat__n" data-t="bad">{nf.format(counts.failed)}</div><div className="stat__l">FAILED</div></div>}
        {counts.uncertain > 0 && <div><div className="stat__n" data-t="warn">{nf.format(counts.uncertain)}</div><div className="stat__l">TO CHECK</div></div>}
        {counts.stopped > 0 && <div><div className="stat__n">{nf.format(counts.stopped)}</div><div className="stat__l">NOT SENT</div></div>}
      </div>

      {runInfo?.capped && (
        <div className="notice" data-tone="warn">
          <b>Stopped at your limit of {nf.format(runInfo.planned)}</b>
          <small>
            {nf.format(counts.stopped)} clients are still waiting. Reopen this page tomorrow
            and resume — everyone already contacted is skipped.
          </small>
        </div>
      )}

      {halted && (
        <div className="notice" data-tone={halted.quota ? 'warn' : 'bad'}>
          <b>Stopped — {halted.title}</b>
          <small>{halted.fix} The remaining {nf.format(counts.stopped)} were not contacted.</small>
          {halted.quota && (
            <small>
              Nothing here was half-sent: Gmail turns a message away before accepting it,
              so everyone still listed as not sent simply has not been emailed. Come back
              once the limit resets and press “Send the remaining”.
            </small>
          )}
        </div>
      )}

      {counts.uncertain > 0 && (
        <div className="notice" data-tone="warn">
          <b>{nf.format(counts.uncertain)} may have gone out anyway</b>
          <small>
            Gmail stopped answering before confirming, so these could have been delivered or
            not. Check your Sent folder before resending — resending a delivered message
            emails that client twice.
          </small>
        </div>
      )}

      <div className="actions">
        {['all', 'sent', 'failed', 'uncertain', 'stopped'].map((f) => (
          <button key={f} className={filter === f ? 'primary' : 'ghost'} onClick={() => setFilter(f)}>
            {f === 'all' ? `All ${nf.format(log.length)}` : `${PILL[f]} ${nf.format(log.filter((r) => r.status === f).length)}`}
          </button>
        ))}
      </div>

      <RowTable
        rows={rows} head={['ROW', 'EMAIL', 'STATUS', 'DETAIL']}
        render={(r) => (
          <tr key={`${r.rowNumber}-${r.email}`}>
            <td className="n">{r.rowNumber}</td>
            <td className="addr">{r.email}</td>
            <td><span className="pill" data-s={r.status}>{PILL[r.status]}</span></td>
            <td className="why">{r.detail || ''}</td>
          </tr>
        )}
      />

      <div className="actions">
        {counts.failed > 0 && <button className="primary" onClick={onRetryFailed}>Retry the {nf.format(counts.failed)} that failed</button>}
        {counts.stopped > 0 && <button className="primary" onClick={onSendRest}>Send the remaining {nf.format(counts.stopped)}</button>}
        {counts.uncertain > 0 && <button className="ghost" onClick={onRetryUncertain}>Resend the {nf.format(counts.uncertain)} to check — only after checking Sent</button>}
        <button className="ghost" onClick={onSave}>
          {copied === 'done' ? 'Log copied ✓' : 'Save the log'}
        </button>
        <button className="ghost" onClick={onStartOver}>Start over</button>
      </div>

      {copied === 'manual' && (
        <label className="field">
          <span className="field__label">LOG — SELECT ALL AND COPY</span>
          <textarea className="csv" readOnly rows={10} value={csv()} onFocus={(e) => e.target.select()} />
        </label>
      )}
    </section>
  );
}
