import Anthropic from '@anthropic-ai/sdk';
import {
  MCP_SERVER_NAME,
  MCP_BETA,
  ENABLE_REFUSAL_FALLBACK,
  REFUSAL_FALLBACK_BETA,
  MODEL,
  MAX_TOKENS,
  EFFORT,
} from '../config.js';

/**
 * The API key lives only in the browser tab that the broker typed it into.
 * `dangerouslyAllowBrowser` is required for that; see the README for the
 * server-proxy alternative if this ever runs anywhere shared.
 */
export function createClient({ apiKey, baseURL }) {
  return new Anthropic({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    dangerouslyAllowBrowser: true,
    // No automatic retries. A connection that drops after Gmail has already
    // accepted the message would otherwise be retried and email the client
    // twice. Failures are surfaced per recipient instead, and the operator
    // retries them deliberately from the results screen.
    maxRetries: 0,
  });
}

function buildPrompt({ to, subject, html }) {
  return [
    'Send exactly one email using the Gmail tools, then stop.',
    '',
    `To: ${to}`,
    `Subject: ${subject}`,
    '',
    'The HTML body is between the markers below. Send it as the HTML body of the',
    'message, exactly as given — do not edit, reformat, summarise, translate, or',
    'add anything to it, and do not include the markers themselves.',
    '',
    '<<<BEGIN HTML BODY>>>',
    html,
    '<<<END HTML BODY>>>',
    '',
    'Rules:',
    '- Send to that one address only. No CC, no BCC, no other recipients.',
    '- Send the message; do not save it as a draft.',
    '- Do not read, search, or modify anything else in the mailbox.',
    '- Make exactly one send call. If it fails, say what the error was; do not retry.',
  ].join('\n');
}

const textOf = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : b?.text ?? JSON.stringify(b)))
      .join('\n');
  }
  return content == null ? '' : JSON.stringify(content);
};

/** Read a response and decide whether a send actually happened. */
function inspect(message) {
  let attempted = false;
  let toolName = null;
  let toolError = null;

  for (const block of message.content ?? []) {
    if (block.type === 'mcp_tool_use') {
      attempted = true;
      toolName = block.name;
    }
    if (block.type === 'mcp_tool_result' && block.is_error) {
      toolError = textOf(block.content);
    }
  }

  const say = (message.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim();

  return { attempted, toolName, toolError, say };
}

/**
 * Send one personalized email through the Gmail MCP connector.
 * Resolves with `{ toolName, note }` on success; throws on failure.
 */
export async function sendOne(client, { mcpUrl, mcpToken, to, subject, html, model = MODEL, signal }) {
  if (!mcpUrl) throw new Error('No Gmail MCP server URL configured.');

  const betas = [MCP_BETA];
  if (ENABLE_REFUSAL_FALLBACK) betas.push(REFUSAL_FALLBACK_BETA);

  const messages = [{ role: 'user', content: buildPrompt({ to, subject, html }) }];
  let message;

  // The connector can hand the turn back mid-flight; pick it up where it paused.
  for (let attempt = 0; attempt < 3; attempt++) {
    message = await client.beta.messages.create(
      {
        model,
        max_tokens: MAX_TOKENS,
        betas,
        ...(ENABLE_REFUSAL_FALLBACK ? { fallbacks: 'default' } : {}),
        output_config: { effort: EFFORT },
        mcp_servers: [
          {
            type: 'url',
            url: mcpUrl,
            name: MCP_SERVER_NAME,
            ...(mcpToken ? { authorization_token: mcpToken } : {}),
          },
        ],
        tools: [{ type: 'mcp_toolset', mcp_server_name: MCP_SERVER_NAME }],
        messages,
      },
      { signal },
    );

    if (message.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: message.content });
  }

  if (message.stop_reason === 'refusal') {
    const why = message.stop_details?.explanation || message.stop_details?.category || 'no reason given';
    throw new Error(`Request was declined (${why}).`);
  }

  const { attempted, toolName, toolError, say } = inspect(message);

  if (toolError) throw new Error(`Gmail returned an error: ${toolError}`);
  if (!attempted) throw new Error(say ? `No send was attempted — ${say}` : 'No send was attempted.');

  return { toolName, note: say };
}
