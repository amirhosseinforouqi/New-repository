# Email Blast

A mail-merge tool for **Asif Jabbarov, Mortgage Broker**. Upload an Excel client
list, and it personalizes the new-office announcement for each client and sends
it one message at a time through your own Gmail account via the Gmail MCP
connector.

The UI uses the email's own palette — navy `#14243A`, gold `#B08C45`, cream
`#FDFCFA` — so the tool reads as an extension of the brand.

## What it does

1. **Upload** an `.xlsx`/`.xls` workbook. The file is parsed in your browser with
   SheetJS; it is never uploaded anywhere.
2. **Auto-detects columns.** Scans the header row for a first-name column
   (`First Name`, `fname`, `given name`, …) and an email column (`Email`,
   `e-mail`, `Email Address`, …). The detected mapping is shown with a confidence
   tag, and either can be overridden from a dropdown. If no header looks like an
   email column, it falls back to sniffing the data for a column that is mostly
   email addresses. A title row above the real header is skipped automatically.
3. **Previews the recipients.** Every valid recipient is listed before anything
   is sent. Rows with a missing or malformed address are filtered out and shown
   separately with a reason, and repeat addresses are collapsed so no client is
   emailed twice. You can also render the personalized email itself for any
   recipient.
4. **Personalizes** the embedded HTML template by replacing the literal
   `[FIRST NAME]` token with each client's first name. A blank name falls back to
   a neutral greeting ("Hi there,"). The subject is fixed:
   `New Office | Asif Jabbarov`.
5. **Requires confirmation above 5 recipients** — a summary screen with the
   recipient count, the subject line, the first and last address, and a
   "Confirm — Send All" button. At 5 or fewer, Send goes straight through.
6. **Sends sequentially** through the Gmail MCP connector, with a live progress
   bar, per-recipient status, and a "stop after the current email" button.
7. **Reports results** — sent vs. failed counts, an expandable per-recipient log
   with the error message for each failure, a one-click retry for just the
   failures, and a CSV export of the log.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run smoke    # parsing / detection / personalization tests, no network
npm run build    # production build into dist/
```

## Connecting Gmail

The Connection panel (step 4) needs two things:

| Field | Notes |
|---|---|
| **Anthropic API key** | Kept in memory for the tab only — never written to disk. |
| **Gmail MCP server URL** | The URL of your Gmail connector. Remembered in `localStorage` on this device. |
| Gmail MCP auth token | Only if your connector requires one. Not persisted. |
| Model | Defaults to `claude-opus-5`. |

There is no default MCP URL, because it is specific to your connector — copy it
from your Anthropic/Claude connector settings, or set `VITE_GMAIL_MCP_URL` at
build time.

Each send is one `POST /v1/messages` call carrying both halves the MCP connector
requires — `mcp_servers` and a matching `mcp_toolset` entry in `tools` — under
the `mcp-client-2025-11-20` beta. The model is instructed to make exactly one
send call with the HTML body verbatim; the response is then inspected for an
`mcp_tool_use` block (a send was attempted) and an errored `mcp_tool_result`
(Gmail rejected it), so a recipient is only marked **sent** when Gmail actually
accepted the message.

Automatic SDK retries are **disabled** (`maxRetries: 0`). A connection that drops
after Gmail has already accepted a message would otherwise be retried and email
the client twice; failures are reported per recipient and retried deliberately
from the results screen instead.

### About the API key in the browser

Calling the API straight from the browser requires
`dangerouslyAllowBrowser: true`, which is fine for one broker running this
locally on their own machine — the key never leaves the tab. **Do not deploy this
as a public page with a key baked in.** If it ever needs to be hosted, run a
small server that holds the key and forwards to `api.anthropic.com`, then point
the **API base URL** field (under Advanced) at that server.

### Cost

Every email sends the full ~25 KB HTML template through the model and back out
in the tool call, roughly 6k input + 6k output tokens per recipient. At
`claude-opus-5` rates that is on the order of $0.18 per email — about $18 per 100
clients. Effort is set to `low` since relaying a fixed template is mechanical
work. Switching the Model field to a cheaper model cuts this substantially.

## Reusing this for another campaign

Everything worth changing lives in two files:

- **`src/emailTemplate.js`** — the embedded HTML, with `[FIRST NAME]` left as a
  literal placeholder token.
- **`src/config.js`** — subject line, placeholder token, fallback greeting, the
  5-recipient confirmation threshold, send delay, brand palette, the column
  detection patterns, and the model/MCP settings.

## Layout

```
src/
  config.js            all tunable parameters
  emailTemplate.js     the announcement HTML, verbatim
  EmailBlast.jsx       the five-stage UI
  styles.css           brand palette
  lib/
    excel.js           workbook parsing, column detection, recipient filtering
    personalize.js     placeholder substitution
    gmail.js           the Gmail MCP send call
scripts/
  smoke-test.mjs       node scripts/smoke-test.mjs
```

## A note on sending

Nothing is sent until you press Send, and sent mail cannot be recalled. Client
lists are covered by `.gitignore` (`*.xlsx`, `*.xls`, `*.csv`) so a spreadsheet
dropped into this folder is not committed by accident.
