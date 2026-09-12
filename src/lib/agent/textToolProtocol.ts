import { parseMcpToolCalls } from '../mcp/xml';
import { toMcpAlias } from '../mcp/renderer';
import type { ToolAction } from './runtimeTypes';
import { decodeXmlEntities } from './xmlCodec';

export interface TextToolParseResult {
  actions: ToolAction[];
  text: string;
  diagnostics: string[];
}

export type TextToolProtocolMode = 'permissive' | 'xml';

// Module-level counter — guarantees every parsed tool call gets a globally
// unique callId regardless of where in the source text the match occurs.
let _callIdCounter = 0;
function nextCallId(prefix: string): string {
  return `${prefix}:${++_callIdCounter}`;
}

function scalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

function validName(name: string, known?: Set<string>): boolean {
  // We intentionally DO NOT strictly enforce known names here.
  // If we silently drop well-formed loose <function=X> blocks just because X is unknown,
  // the LLM never gets an "Unknown tool" feedback and might enter a format error loop.
  return /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(name);
}

function normalizeToolName(raw: string): string {
  let name = raw.trim();
  if (name === 'write_file') return 'writeFile';
  if (name === 'edit_file') return 'editFile';
  if (name === 'read_file') return 'readFile';
  if (name === 'run_command') return 'runCommand';
  if (name === 'read_skill') return 'readSkill';
  if (name === 'deep_research') return 'deepResearch';
  return name;
}

const PHANTOM_TAGS_REGEX = /<\/?(?:arg_value|arg_key|parameters|arguments|args)>/gi;

interface ExtractedCall {
  name: string;
  args: Record<string, unknown>;
  startOffset?: number;
  length?: number;
}

function parseParametersFromBody(body: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const consumed: Array<[number, number]> = [];

  // Strip phantom wrapper tags first
  const cleanBody = body.replace(PHANTOM_TAGS_REGEX, '');

  // 1. <parameter=argName>value</parameter> or <parameter name="argName">value</parameter>
  const paramRegex = /<parameter(?:=|\s+name=["']?)([a-zA-Z0-9_-]+)["']?>([\s\S]*?)(?:<\/parameter>|(?=<parameter|<\/function>|<\/tool_call>|$))/gi;
  let paramMatch: RegExpExecArray | null;
  while ((paramMatch = paramRegex.exec(cleanBody)) !== null) {
    const key = paramMatch[1].trim();
    if (key.toLowerCase() !== 'null') {
      args[key] = parseParameterValue(key, paramMatch[2]);
    }
    consumed.push([paramMatch.index, paramMatch.index + paramMatch[0].length]);
  }

  // 2. <parameter>key>value</parameter>
  const hallucinatedNamed = /<parameter>\s*([a-zA-Z0-9_-]+)\s*>([\s\S]*?)(?:<\/parameter>|(?=<parameter|<\/function>|<\/tool_call>|$))/gi;
  let hallucinatedMatch: RegExpExecArray | null;
  while ((hallucinatedMatch = hallucinatedNamed.exec(cleanBody)) !== null) {
    if (!consumed.some(([start, end]) => hallucinatedMatch!.index >= start && hallucinatedMatch!.index < end)) {
      const key = hallucinatedMatch[1].trim();
      if (key.toLowerCase() !== 'null') {
        args[key] = parseParameterValue(key, hallucinatedMatch[2]);
      }
      consumed.push([hallucinatedMatch.index, hallucinatedMatch.index + hallucinatedMatch[0].length]);
    }
  }

  // 3. Naked parameter: <parameter>content</parameter>
  const nakedParameter = /<parameter>(?!\s*[a-zA-Z0-9_-]+>)([\s\S]*?)(?:<\/parameter>|(?=<parameter|<\/function>|<\/tool_call>|$))/gi;
  let nakedMatch: RegExpExecArray | null;
  while ((nakedMatch = nakedParameter.exec(cleanBody)) !== null) {
    if (!consumed.some(([start, end]) => nakedMatch!.index >= start && nakedMatch!.index < end)) {
      const contentName = Object.keys(args).includes('content') ? 'file_content' : 'content';
      args[contentName] = parseParameterValue(contentName, nakedMatch[1]);
      consumed.push([nakedMatch.index, nakedMatch.index + nakedMatch[0].length]);
    }
  }

  // 4. Fallback: <argName>value</argName> (e.g. <skillName>v2-stop-slop</skillName>, <path>globe.html</path>)
  if (Object.keys(args).length === 0) {
    const standardXml = /<([a-zA-Z0-9_-]+)>([\s\S]*?)(?:<\/\1>|(?=<[a-zA-Z0-9_-]+>|<\/function>|<\/tool_call>|$))/gi;
    let standardMatch: RegExpExecArray | null;
    while ((standardMatch = standardXml.exec(cleanBody)) !== null) {
      const key = standardMatch[1].trim();
      const lower = key.toLowerCase();
      if (!['function', 'invoke', 'tool_call', 'parameter', 'arg_value', 'arg_key', 'parameters', 'arguments', 'args', 'null'].includes(lower)) {
        args[key] = parseParameterValue(key, standardMatch[2]);
        consumed.push([standardMatch.index, standardMatch.index + standardMatch[0].length]);
      }
    }
  }

  // 5. Fallback: Function-call / Python style e.g. (skillName="v2-stop-slop") or ("v2-stop-slop")
  if (Object.keys(args).length === 0) {
    const callMatch = /^\s*\(([\s\S]*?)\)\s*$/.exec(cleanBody.trim());
    if (callMatch) {
      const inside = callMatch[1].trim();
      const kvRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,\s)]+))/g;
      let kvMatch;
      while ((kvMatch = kvRegex.exec(inside)) !== null) {
        const key = kvMatch[1];
        const val = kvMatch[2] ?? kvMatch[3] ?? kvMatch[4];
        args[key] = parseParameterValue(key, val);
      }
      if (Object.keys(args).length === 0 && inside) {
        const singleStrMatch = /^["']([^"']*)["']$/.exec(inside);
        if (singleStrMatch) {
          args['defaultArg'] = singleStrMatch[1];
        }
      }
    }
  }

  return args;
}

function extractToolInvocationsFromSegment(
  toolCallBody: string,
  knownToolNames?: Set<string>,
): ExtractedCall[] {
  const results: ExtractedCall[] = [];

  // 1. Primary format: <function=name>...</function> or <invoke name="...">...</invoke>
  const functionRegex = /<(?:function|invoke)(?:=|\s+name=["']?)([a-zA-Z0-9_-]+)["']?>([\s\S]*?)(?:<\/(?:function|invoke)>|$)/gi;
  let functionMatch: RegExpExecArray | null;
  while ((functionMatch = functionRegex.exec(toolCallBody)) !== null) {
    const name = normalizeToolName(functionMatch[1]);
    if (/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(name)) {
      const args = parseParametersFromBody(functionMatch[2]);
      results.push({ name, args, startOffset: functionMatch.index, length: functionMatch[0].length });
    }
  }
  if (results.length > 0) return results;

  // 2. Format: <function>toolName</function>...params...
  const tagFunctionRegex = /<function>\s*([a-zA-Z0-9_-]+)\s*<\/function>([\s\S]*?)(?=<function>|$)/gi;
  let tagFunctionMatch: RegExpExecArray | null;
  while ((tagFunctionMatch = tagFunctionRegex.exec(toolCallBody)) !== null) {
    const name = normalizeToolName(tagFunctionMatch[1]);
    if (/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(name)) {
      const args = parseParametersFromBody(tagFunctionMatch[2]);
      results.push({ name, args, startOffset: tagFunctionMatch.index, length: tagFunctionMatch[0].length });
    }
  }
  if (results.length > 0) return results;

  // 3. Format: JSON object inside <tool_call> e.g. {"name": "readSkill", "arguments": {...}}
  const trimmed = toolCallBody.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const rawName = parsed.name || parsed.function || parsed.tool || '';
      const name = normalizeToolName(rawName);
      if (name && /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(name)) {
        const rawArgs = parsed.arguments || parsed.parameters || parsed.params || parsed.args || {};
        results.push({
          name,
          args: typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {},
          startOffset: 0,
          length: toolCallBody.length,
        });
        return results;
      }
    } catch {
      // not valid JSON, proceed to other fallbacks
    }
  }

  // 4. Format: Outer tag is tool name e.g. <readSkill><skillName>v2-stop-slop</skillName></readSkill>
  const outerTagMatch = /^\s*<([a-zA-Z_][a-zA-Z0-9_-]*)\b[^>]*>([\s\S]*?)<\/\1>\s*$/i.exec(trimmed);
  if (outerTagMatch) {
    const candidateName = normalizeToolName(outerTagMatch[1]);
    if (validName(candidateName, knownToolNames)) {
      const args = parseParametersFromBody(outerTagMatch[2]);
      results.push({ name: candidateName, args, startOffset: 0, length: toolCallBody.length });
      return results;
    }
  }

  // 5. Format: Bare tool name at start of <tool_call>
  // e.g. <tool_call>readSkill<skillName>v2-stop-slop</skillName>\n</arg_value></tool_call>
  // or <tool_call>\nreadSkill\n<skillName>v2-stop-slop</skillName>\n</tool_call>
  const cleanBody = toolCallBody.replace(PHANTOM_TAGS_REGEX, '').trim();
  const bareMatch = /^([a-zA-Z_][a-zA-Z0-9_-]*)([\s\S]*)$/.exec(cleanBody);
  if (bareMatch) {
    const candidateName = normalizeToolName(bareMatch[1]);
    if (validName(candidateName, knownToolNames)) {
      const args = parseParametersFromBody(bareMatch[2]);
      results.push({ name: candidateName, args, startOffset: 0, length: toolCallBody.length });
      return results;
    }
  }

  return results;
}

export function parseTextToolProtocol(
  source: string,
  knownToolNames?: Set<string>,
  mode: TextToolProtocolMode = 'permissive'
): TextToolParseResult {
  const actions: ToolAction[] = [];
  const ranges: Array<[number, number]> = [];
  const diagnostics: string[] = [];

  const isOverlapping = (start: number, end: number): boolean => {
    return ranges.some(([rStart, rEnd]) => Math.max(start, rStart) < Math.min(end, rEnd));
  };

  const recordAction = (name: string, args: Record<string, unknown>, start: number, end: number) => {
    if (!validName(name, knownToolNames)) {
      diagnostics.push(`Invalid or unknown tool: ${name}`);
      return;
    }
    actions.push({
      kind: 'tool',
      callId: nextCallId('text'),
      name,
      arguments: args,
      source: 'text',
      sourceStart: start,
      sourceEnd: end,
    });
    ranges.push([start, end]);
  };

  // ── Pass 1: MCP tool calls (permissive mode) ──────────────────────────────
  for (const call of mode === 'permissive' ? parseMcpToolCalls(source) : []) {
    const name = toMcpAlias(call.server, call.tool);
    if (validName(name, knownToolNames)) {
      actions.push({ kind: 'tool', callId: nextCallId('text:mcp'), name, arguments: call.arguments, source: 'text' });
    }
  }

  // ── Pass 2: <tool_call> blocks (all formats) ──────────────────────────────
  const xmlRegex = /<tool_call\b[^>]*>\s*([\s\S]*?)(?:<\/tool_call>|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = xmlRegex.exec(source)) !== null) {
    const toolCallBody = match[1];
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    ranges.push([matchStart, matchEnd]);

    const invocations = extractToolInvocationsFromSegment(toolCallBody, knownToolNames);
    for (const inv of invocations) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(inv.name)) {
        diagnostics.push(`Invalid tool name format: ${inv.name}`);
        continue;
      }
      // DO NOT filter by knownToolNames here!
      // If it's explicitly wrapped in <tool_call>, we MUST pass it up to the agentLoop
      // so that it can return an "Unknown tool: X" error to the LLM. 
      // If we drop it here, the engine falsely assumes the XML was malformed.
      actions.push({
        kind: 'tool',
        callId: nextCallId('text'),
        name: inv.name,
        arguments: inv.args,
        source: 'text',
        sourceStart: matchStart + (inv.startOffset ?? 0),
        sourceEnd: matchStart + (inv.startOffset ?? 0) + (inv.length ?? match[0].length),
      });
    }
  }

  // ── Pass 3: Loose <function=...> or <invoke=...> blocks OUTSIDE <tool_call> ──
  // Many models emit <function=name> directly without wrapping in <tool_call>,
  // or close the first tool call early and omit the opening <tool_call> for the second.
  const looseFunctionRegex = /<(?:function|invoke)(?:=|\s+name=["']?)([a-zA-Z0-9_-]+)["']?>([\s\S]*?)(?:<\/(?:function|invoke)>|(?=<\/tool_call>|$))/gi;
  while ((match = looseFunctionRegex.exec(source)) !== null) {
    const matchStart = match.index;
    let matchEnd = match.index + match[0].length;

    // Check if this function call is already inside a consumed <tool_call> range
    if (isOverlapping(matchStart, matchEnd)) continue;

    // Also consume any hallucinated trailing closing tags like </tool_call> right after
    const trailingSnippet = source.slice(matchEnd, matchEnd + 50);
    const trailingClose = /^(?:\s*<\/tool_call>)+/i.exec(trailingSnippet);
    if (trailingClose) {
      matchEnd += trailingClose[0].length;
    }

    const name = normalizeToolName(match[1]);
    const args = parseParametersFromBody(match[2]);
    recordAction(name, args, matchStart, matchEnd);
  }

  // ── Pass 4: Loose <function>name</function> OUTSIDE <tool_call> ───────────
  const looseTagFunctionRegex = /<function>\s*([a-zA-Z0-9_-]+)\s*<\/function>([\s\S]*?)(?:<\/function>|(?=<(?:function|invoke)|<\/tool_call>|$))/gi;
  while ((match = looseTagFunctionRegex.exec(source)) !== null) {
    const matchStart = match.index;
    let matchEnd = match.index + match[0].length;
    if (isOverlapping(matchStart, matchEnd)) continue;

    const trailingSnippet = source.slice(matchEnd, matchEnd + 50);
    const trailingClose = /^(?:\s*<\/tool_call>)+/i.exec(trailingSnippet);
    if (trailingClose) matchEnd += trailingClose[0].length;

    const name = normalizeToolName(match[1]);
    const args = parseParametersFromBody(match[2]);
    recordAction(name, args, matchStart, matchEnd);
  }

  // ── Pass 5: Known tools emitted directly as XML tags: <knownTool>...</knownTool>
  if (knownToolNames && knownToolNames.size > 0) {
    for (const toolName of knownToolNames) {
      const tagRegex = new RegExp(`<${toolName}\\b[^>]*>([\\s\\S]*?)(?:<\\/${toolName}>|$)`, 'gi');
      let tagMatch: RegExpExecArray | null;
      while ((tagMatch = tagRegex.exec(source)) !== null) {
        const start = tagMatch.index;
        const end = tagMatch.index + tagMatch[0].length;
        if (isOverlapping(start, end)) continue;
        const args = parseParametersFromBody(tagMatch[1]);
        recordAction(toolName, args, start, end);
      }
    }
  }

  // ── Pass 6: Antigravity native syntax: call:tool_name{json_args} ───────────
  const callSyntax = mode === 'permissive' ? /call:([a-zA-Z_][a-zA-Z0-9_]*)\s*(\{[^\r\n]*\})/g : null;
  if (callSyntax) {
    while ((match = callSyntax.exec(source)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (isOverlapping(start, end)) continue;
      const name = match[1];
      if (!validName(name, knownToolNames)) continue;
      try {
        const args = JSON.parse(match[2]);
        recordAction(name, args, start, end);
      } catch {
        diagnostics.push(`Malformed JSON arguments for ${name}.`);
      }
    }
  }

  // ── Clean extracted tool ranges and stray tags from the remaining text ─────
  let text = ranges
    .sort((a, b) => b[0] - a[0])
    .reduce((value, [start, end]) => value.slice(0, start) + value.slice(end), source);

  // Clean any remaining orphaned XML tool tags or phantom tags
  text = text
    .replace(/<parameter\b[^>]*>[\s\S]*?<\/parameter>/gi, '')
    .replace(/<\/?(?:tool_call|function|invoke|parameter|arg_value|arg_key|parameters|arguments|args)\b[^>]*>/gi, '')
    .trim();

  return { actions, text, diagnostics };
}

const OPAQUE_FIELDS = new Set(['content', 'codecontent', 'replacementcontent', 'file_content', 'replace', 'replacement']);

function parseParameterValue(name: string, value: string): unknown {
  let decoded = decodeXmlEntities(value);
  
  // LLMs frequently ignore the system prompt and wrap XML tool parameters in CDATA.
  // Strip CDATA tags if present to prevent them from bleeding into file contents.
  decoded = decoded.replace(/<!\[CDATA\[/g, '');
  decoded = decoded.replace(/\]\]>/g, '');
  
  return OPAQUE_FIELDS.has(name.toLowerCase()) ? decoded : scalar(decoded);
}
