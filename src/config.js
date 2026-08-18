// ---------------------------------------------------------------------------
// Config block — the knobs most likely to change between campaigns.
// Swap EMAIL_TEMPLATE (src/emailTemplate.js) and the patterns below to reuse
// this tool for any other mail-merge-style Gmail send from an Excel list.
// ---------------------------------------------------------------------------

/** Fixed subject line used for every recipient. */
export const SUBJECT = 'New Office | Asif Jabbarov';

/** Token in EMAIL_TEMPLATE replaced with each recipient's first name. */
export const PLACEHOLDER = '[FIRST NAME]';

/** Used when a row has a valid email but a blank first name. */
export const FALLBACK_FIRST_NAME = 'there';

/** Above this many recipients, a confirmation screen is required before sending. */
export const CONFIRM_THRESHOLD = 5;

/** Pause between sends, in ms. Keeps the send gentle on Gmail's rate limits. */
export const SEND_DELAY_MS = 750;

/**
 * Gmail enforces a daily recipient cap — roughly 500/day on a personal
 * @gmail.com account and 2,000/day on Google Workspace. A run stops cleanly at
 * this many and can be resumed the next day rather than failing mid-list.
 */
export const DAILY_CAP_DEFAULT = 450;
export const DAILY_CAP_CHOICES = [200, 450, 900, 1800, 0];

/** Rows drawn in a preview table at once. Beyond this a count stands in for the
 *  rest — a 1,000-row list must not put 1,000 nodes in the document. */
export const TABLE_WINDOW = 200;

/** Where an interrupted run is kept so it can be resumed without re-sending. */
export const RESUME_KEY = 'emailblast.run.v1';

/** Brand palette — mirrors the email template so the tool feels like the brand. */
export const BRAND = {
  navy: '#14243A',
  navyLight: '#1B2E48',
  gold: '#B08C45',
  goldSoft: '#D9B978',
  goldDeep: '#8A6A2C',
  cream: '#FDFCFA',
  sand: '#F4F0E7',
  sandDeep: '#E9E5DD',
  rule: '#E3DED4',
  ink: '#23292F',
  body: '#3F4750',
  muted: '#666E78',
  success: '#2E6B4F',
  danger: '#9B2C2C',
};

// --- Column detection -------------------------------------------------------
// Ordered by confidence: the first pattern that matches any header wins, so
// "First Name" beats a bare "Name" even if "Name" appears in an earlier column.

export const FIRST_NAME_PATTERNS = [
  /^first[\s._-]*name$/i,
  /^(?:client|customer|contact)[\s._-]*first[\s._-]*name$/i,
  /^f[\s._-]*name$/i,
  /^fname$/i,
  /^given[\s._-]*name$/i,
  /first[\s._-]*name/i,
  /given[\s._-]*name/i,
  /^first$/i,
];

export const LAST_NAME_PATTERNS = [
  /^last[\s._-]*name$/i,
  /^(?:client|customer|contact)[\s._-]*last[\s._-]*name$/i,
  /^l[\s._-]*name$/i,
  /^lname$/i,
  /^surname$/i,
  /^family[\s._-]*name$/i,
  /last[\s._-]*name/i,
  /^last$/i,
];

export const FULL_NAME_PATTERNS = [
  /^full[\s._-]*name$/i,
  /^(?:client|customer|contact)[\s._-]*name$/i,
  /^display[\s._-]*name$/i,
  /^name$/i,
];

export const EMAIL_PATTERNS = [
  /^e[\s._-]*mail[\s._-]*address$/i,
  /^e[\s._-]*mail$/i,
  /^(?:client|customer|contact|primary|work|personal)[\s._-]*e[\s._-]*mail/i,
  /e[\s._-]*mail/i,
  /^mail$/i,
];

// --- Anthropic API / Gmail MCP connector ------------------------------------

/**
 * Remote Gmail MCP server URL. There is no universal default — copy the URL for
 * your Gmail connector from your Anthropic/Claude connector settings. It can
 * also be set at runtime in the tool's Connection panel, or at build time via
 * VITE_GMAIL_MCP_URL.
 */
export const GMAIL_MCP_URL = import.meta.env?.VITE_GMAIL_MCP_URL ?? '';

/** Name the toolset binds to. Must match on both halves of the MCP request. */
export const MCP_SERVER_NAME = 'gmail';

/** Beta flag required by the MCP connector on /v1/messages. */
export const MCP_BETA = 'mcp-client-2025-11-20';

/** Beta flag + parameter for server-side refusal fallbacks. Set to false to disable. */
export const ENABLE_REFUSAL_FALLBACK = true;
export const REFUSAL_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export const MODEL = 'claude-opus-5';
export const MAX_TOKENS = 16000;
/** Relaying a fixed template is mechanical work — low effort keeps cost down. */
export const EFFORT = 'low';
