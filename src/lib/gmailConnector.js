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
        title: 'Sending too quickly',
        fix: 'Wait a moment, then send the remaining recipients.',
      };
    case 'tool_error':
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
