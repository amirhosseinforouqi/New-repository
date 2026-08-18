import { SUBJECT } from '../config.js';

export const GMAIL_SERVER = 'Gmail';
export const GMAIL_SEND_TOOL = 'send_message';

/**
 * Codes where a rejection is NOT proof the email failed to go out: the call
 * may have reached Gmail and been accepted before the reply was lost. Retrying
 * one of these could email a client twice, so these are reported separately
 * from clean failures and are never retried automatically.
 */
const AMBIGUOUS = new Set(['server_unavailable', 'upstream_error', 'cancelled']);

export const isAmbiguous = (code) => AMBIGUOUS.has(code);

/**
 * Turn an McpError into copy that names the actual fix. Collapsing every code
 * into one banner would hide the single action that unblocks the page.
 */
export function describeMcpError(err) {
  const code = err?.code ?? 'upstream_error';
  const server = err?.server || GMAIL_SERVER;
  switch (code) {
    case 'needs_reauth':
      return {
        code,
        title: `${server} needs reconnecting`,
        fix: `Your ${server} connection has expired. Reconnect it in claude.ai Settings → Connectors, then reload this page.`,
      };
    case 'server_not_connected':
      return {
        code,
        title: `${server} is not connected`,
        fix: `Add the ${server} connector in claude.ai Settings → Connectors, then reload this page.`,
      };
    case 'selection_required':
      return {
        code,
        title: `Choose which ${server} account to use`,
        fix: `You have more than one ${server} connector. Pick one when claude.ai prompts you, then reload this page.`,
      };
    case 'server_not_found':
      return {
        code,
        title: `${server} is no longer available`,
        fix: `The connector was removed. Re-add ${server} in claude.ai Settings → Connectors.`,
      };
    case 'blocked_by_policy':
      return {
        code,
        title: 'Blocked by your organization',
        fix: `Your organization's policy blocks sending through ${server} from a page like this.`,
      };
    case 'approval_required':
      return {
        code,
        title: 'Needs per-send approval',
        fix: 'Your organization requires approval for each send, which pages cannot request yet.',
      };
    case 'not_in_manifest':
      return {
        code,
        title: 'Sending was not permitted',
        fix: `This page asked for ${server} access that was not granted. Reload and allow it when prompted.`,
      };
    case 'rate_limited':
      return {
        code,
        title: 'Gmail is throttling this account',
        fix: 'Gmail would not accept more mail just now. Nothing was sent to this person.',
      };
    case 'tool_error':
      if (isQuotaError(err)) {
        return {
          code,
          quota: true,
          title: isDailyQuotaError(err) ? "Gmail's daily sending limit is used up" : 'Gmail is throttling this account',
          fix: isDailyQuotaError(err)
            ? 'Gmail caps how much one account can send per day — about 500 on a personal @gmail.com address, 2,000 on Workspace. Nothing was sent to this person. The limit resets in 24 hours; resume then.'
            : 'Gmail refused to take more mail this quickly. Nothing was sent to this person.',
        };
      }
      return {
        code,
        title: 'Gmail rejected the message',
        fix: err?.message || 'Gmail reported a problem with this message.',
      };
    case 'not_granted':
    case 'capability_disabled':
    case 'capability_removed':
      return {
        code,
        title: 'Sending is unavailable here',
        fix: 'Open this page from claude.ai rather than a direct link, and make sure connector access is allowed.',
      };
    case 'server_unavailable':
      return {
        code,
        title: 'Gmail did not answer',
        fix: 'The connection dropped before Gmail replied. This message may or may not have gone out — check Sent before resending.',
      };
    case 'cancelled':
      return {
        code,
        title: 'Send was cancelled',
        fix: 'The send was interrupted. Check Sent before resending.',
      };
    default:
      return {
        code,
        title: 'Send did not complete',
        fix:
          err?.message ||
          'Something went wrong before Gmail confirmed. Check Sent before resending.',
      };
  }
}

/**
 * Send one message through the viewer's own Gmail connector.
 *
 * Success is carried by the promise resolving — a tool-level failure rejects
 * with `tool_error` — so there is no result payload to interpret. No
 * AbortSignal is passed: aborting a send leaves the outcome unknown, and this
 * is an action that must not double-fire.
 */
export async function sendOne(mcp, { to, html, text, subject = SUBJECT, server = GMAIL_SERVER }) {
  const result = await mcp.callTool(
    server,
    GMAIL_SEND_TOOL,
    {
      to: [to],
      subject,
      htmlBody: html,
      ...(text ? { body: text } : {}),
    },
    { cache: false },
  );

  const id = result?.payload?.id;
  return { messageId: typeof id === 'string' ? id : null };
}

export const GMAIL_GET_TOOL = 'get_message';

/** Pull the first plausible address out of whatever shape the reply takes. */
function findAddress(value, depth = 0) {
  if (value == null || depth > 4) return null;
  if (typeof value === 'string') {
    const angled = /<([^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,})>/.exec(value);
    if (angled) return angled[1];
    const bare = /[^\s@<>",;:]+@[^\s@<>",;:]+\.[A-Za-z]{2,}/.exec(value);
    return bare ? bare[0] : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findAddress(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === 'object') {
    // A `{name, value}` pair is one header. Answer only for From, so a
    // header list never yields the recipient's address by arriving first.
    if (typeof value.name === 'string' && 'value' in value) {
      return /^from$/i.test(value.name.trim()) ? findAddress(value.value, depth + 1) : null;
    }
    // Prefer anything explicitly labelled "from" before falling back to a scan.
    for (const key of Object.keys(value)) {
      if (/^from$/i.test(key)) {
        const hit = findAddress(value[key], depth + 1);
        if (hit) return hit;
      }
    }
    for (const key of Object.keys(value)) {
      if (/^(to|cc|bcc|recipient|reply|delivered)/i.test(key)) continue; // never a sender
      const hit = findAddress(value[key], depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Read back the address a just-sent message went out as.
 *
 * The Gmail connector exposes no "who am I" lookup, so the only authoritative
 * source for the sending address is the From header of a message the account
 * has actually sent. Best-effort by design: a failure here must never affect
 * the send that already succeeded, so this resolves null instead of throwing.
 */
export async function resolveSenderAddress(mcp, { server = GMAIL_SERVER, messageId }) {
  if (!messageId) return null;
  try {
    const result = await mcp.callTool(
      server,
      GMAIL_GET_TOOL,
      { messageId, messageFormat: 'MINIMAL' },
      { cache: true },
    );
    return findAddress(result?.payload) || findAddress(result?.content) || null;
  } catch {
    return null;
  }
}

/**
 * Was this rejection Gmail refusing on quota or rate?
 *
 * Google reports both its per-second rate cap and its daily sending cap as
 * RESOURCE_EXHAUSTED ("Resource has been exhausted (e.g. check quota)"), which
 * arrives here as a tool_error. The connector's own throttle arrives as
 * rate_limited. Both mean Gmail refused the message before accepting it, so
 * nothing was delivered and re-sending cannot duplicate anything.
 */
export function isQuotaError(err) {
  if (err?.code === 'rate_limited') return true;
  if (err?.code !== 'tool_error') return false;
  const text = `${err?.message ?? ''} ${JSON.stringify(err?.data ?? '')}`;
  return /resource has been exhausted|resource_exhausted|quota|rate limit|rateLimitExceeded|userRateLimitExceeded|too many requests|\b429\b/i.test(text);
}

/** Tell a daily-cap refusal apart from a slow-down. Daily says so explicitly. */
export function isDailyQuotaError(err) {
  const text = `${err?.message ?? ''} ${JSON.stringify(err?.data ?? '')}`;
  return /daily|per day|sending quota|limit for sending|exceeded.*quota for/i.test(text);
}
