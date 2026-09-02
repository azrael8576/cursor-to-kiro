import type { HookAdapterConfig } from "./hooks.js";

// Self-contained generated program: it must work after the migration CLI is removed.
export function adapterSource(config: HookAdapterConfig): string {
  return (
    `// Generated Cursor → Kiro adapter. Verify the disabled hook against your Kiro version before enabling.\nconst config = ${JSON.stringify(config)};\n` +
    String.raw`
import { spawn } from 'node:child_process';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const problem = (kind, detail, code) => { process.stderr.write(kind + ': ' + detail + '\n'); process.exitCode = code; };
async function main() {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 4 * 1024 * 1024) return problem('INVALID_INPUT', 'input exceeds 4 MiB', config.failClosed ? 2 : 0);
  }
  let input;
  try { input = JSON.parse(raw); } catch { return problem('INVALID_INPUT', 'expected JSON', config.failClosed ? 2 : 0); }
  if (!object(input)) return problem('INVALID_INPUT', 'expected object', config.failClosed ? 2 : 0);
  const cursor = { ...input, hook_event_name: config.trigger };
  const names = { shell: 'Shell', read: 'Read', write: 'Write' };
  if (typeof cursor.tool_name === 'string') cursor.tool_name = names[cursor.tool_name] || cursor.tool_name;
  let subject = cursor.tool_name;
  if (config.trigger === 'beforeSubmitPrompt') subject = 'UserPromptSubmit';
  if (config.trigger === 'stop') subject = 'Stop';
  if (/ShellExecution$/.test(config.trigger)) {
    if (cursor.tool_name !== 'Shell') return;
    if (!object(input.tool_input) || typeof input.tool_input.command !== 'string') return problem('MISSING_INPUT', 'tool_input.command', 2);
    cursor.command = input.tool_input.command;
    subject = cursor.command;
  }
  if (/MCPExecution$/.test(config.trigger)) {
    if (typeof input.tool_name !== 'string' || !input.tool_name.startsWith('@') || !input.tool_name.includes('/')) return problem('MISSING_INPUT', 'verified MCP server/tool name mapping required', 2);
    const [server, ...tool] = input.tool_name.slice(1).split('/');
    cursor.tool_name = tool.join('/');
    cursor.mcp_server_name = server;
    cursor.tool_input = JSON.stringify(input.tool_input);
    subject = 'MCP:' + cursor.tool_name;
  }
  if (config.trigger === 'beforeReadFile') {
    if (cursor.tool_name !== 'Read') return;
    if (!object(input.tool_input) || typeof input.tool_input.path !== 'string') return problem('MISSING_INPUT', 'tool_input.path', 2);
    cursor.file_path = input.tool_input.path;
  }
  if (config.matcher !== undefined) {
    if (typeof subject !== 'string') return problem('MISSING_INPUT', 'matcher subject for ' + config.trigger, 2);
    if (!new RegExp(config.matcher).test(subject)) return;
  }
  // Run the original command from Kiro's project-root cwd. Never interpolate event data into shell code.
  const child = spawn(config.command, { shell: true, cwd: process.cwd(), detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', failure;
  const kill = () => {
    try { if (process.platform === 'win32') child.kill('SIGKILL'); else process.kill(-child.pid, 'SIGKILL'); } catch { /* Child already exited. */ }
  };
  const timer = config.timeout === 0 ? undefined : setTimeout(() => { failure = 'TIMEOUT'; kill(); }, config.timeout * 1000);
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify(cursor));
  child.stdout.on('data', data => { stdout += data; if (stdout.length > 4 * 1024 * 1024) { failure = 'OUTPUT_LIMIT'; kill(); } });
  child.stderr.on('data', data => { stderr += data; if (stderr.length > 4 * 1024 * 1024) { failure = 'OUTPUT_LIMIT'; kill(); } });
  const status = await new Promise(resolve => { child.on('error', error => { failure = error.message; resolve(null); }); child.on('close', resolve); });
  if (timer !== undefined) clearTimeout(timer);
  if (failure) return problem('HOOK_FAILURE', failure, config.failClosed ? 2 : 0);
  if (status === 2) return problem('DENIED', stderr || 'source hook exited 2', 2);
  if (status !== 0) return problem('HOOK_FAILURE', stderr || 'source hook exited ' + status, config.failClosed ? 2 : 0);
  if (!stdout.trim()) return;
  let result;
  try { result = JSON.parse(stdout); } catch { return problem('INVALID_OUTPUT', 'expected Cursor JSON output', config.failClosed ? 2 : 0); }
  if (!object(result)) return problem('INVALID_OUTPUT', 'expected object', config.failClosed ? 2 : 0);
  const supported = ['permission', 'continue', 'user_message', 'agent_message', 'additional_context'];
  const unsupported = Object.keys(result).filter(key => !supported.includes(key));
  if (unsupported.length || (result.permission !== undefined && !['allow', 'deny'].includes(result.permission))) return problem('UNSUPPORTED_OUTPUT', unsupported.join(', ') || 'permission=' + result.permission, 2);
  if ((result.continue !== undefined && typeof result.continue !== 'boolean') || ['user_message','agent_message','additional_context'].some(key => result[key] !== undefined && typeof result[key] !== 'string')) return problem('INVALID_OUTPUT', 'unexpected field type', config.failClosed ? 2 : 0);
  if (result.permission === 'deny' || result.continue === false) return problem('DENIED', result.user_message || result.agent_message || 'source hook denied', 2);
  if (typeof result.additional_context === 'string') process.stdout.write(result.additional_context);
}
main().catch(error => problem('ADAPTER_FAILURE', error.message, 2));
`
  );
}
