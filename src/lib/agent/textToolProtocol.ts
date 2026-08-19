import { parseMcpToolCalls } from '../mcp/xml';
import { toMcpAlias } from '../mcp/renderer';
import type { ToolAction } from './runtimeTypes';

export interface TextToolParseResult {
  actions: ToolAction[];
  text: string;
  diagnostics: string[];
}

function scalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

function validName(name: string, known?: Set<string>): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(name) && (!known?.size || known.has(name));
}

export function parseTextToolProtocol(source: string, knownToolNames?: Set<string>): TextToolParseResult {
  const actions: ToolAction[] = [];
  const ranges: Array<[number, number]> = [];
  const diagnostics: string[] = [];

  for (const call of parseMcpToolCalls(source)) {
    const name = toMcpAlias(call.server, call.tool);
    if (validName(name, knownToolNames)) actions.push({ kind: 'tool', callId: `text:mcp:${actions.length}`, name, arguments: call.arguments, source: 'text' });
  }

  const xml = /<tool_call>\s*<function=([a-zA-Z0-9_-]+)>([\s\S]*?)<\/function>\s*<\/tool_call>/gi;
  let match: RegExpExecArray | null;
  while ((match = xml.exec(source)) !== null) {
    const name = match[1].trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(name)) { diagnostics.push(`Invalid tool name format: ${name}`); continue; }
    const args: Record<string, unknown> = {};
    const body = match[2];
    const parameter = /<parameter=([a-zA-Z0-9_-]+)>([\s\S]*?)<\/parameter>/gi;
    let parameterMatch: RegExpExecArray | null;
    while ((parameterMatch = parameter.exec(body)) !== null) args[parameterMatch[1].trim()] = scalar(parameterMatch[2]);
    if (Object.keys(args).length === 0) {
      const legacy = /<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/gi;
      let legacyMatch: RegExpExecArray | null;
      while ((legacyMatch = legacy.exec(body)) !== null) args[legacyMatch[1].trim()] = scalar(legacyMatch[2]);
    }
    actions.push({ kind: 'tool', callId: `text:${match.index}`, name, arguments: args, source: 'text', sourceStart: match.index, sourceEnd: match.index + match[0].length });
    ranges.push([match.index, match.index + match[0].length]);
  }

  const callSyntax = /call:([a-zA-Z_][a-zA-Z0-9_]*)\s*(\{[^\r\n]*\})/g;
  while ((match = callSyntax.exec(source)) !== null) {
    const name = match[1];
    if (!validName(name, knownToolNames)) continue;
    try {
      const args = JSON.parse(match[2]);
      actions.push({ kind: 'tool', callId: `text:${match.index}`, name, arguments: args, source: 'text', sourceStart: match.index, sourceEnd: match.index + match[0].length });
      ranges.push([match.index, match.index + match[0].length]);
    } catch { diagnostics.push(`Malformed JSON arguments for ${name}.`); }
  }

  const text = ranges.sort((a, b) => b[0] - a[0]).reduce((value, [start, end]) => value.slice(0, start) + value.slice(end), source).trim();
  return { actions, text, diagnostics };
}