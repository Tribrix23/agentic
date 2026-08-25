import { McpToolInfo } from './types';
import { decodeXmlEntities, escapeXmlText } from '../agent/xmlCodec';

function parseValue(value: string): any {
  const trimmed = decodeXmlEntities(value).trim();
  const unquoted = trimmed.replace(/^(['"])(.*)\1$/, '$2');
  if (/^true$/i.test(unquoted)) return true;
  if (/^false$/i.test(unquoted)) return false;
  if (unquoted !== '' && !Number.isNaN(Number(unquoted))) return Number(unquoted);
  return trimmed;
}

export interface McpXmlToolCall { server: string; tool: string; arguments: Record<string, any>; }

export function parseMcpToolCalls(xml: string): McpXmlToolCall[] {
  const calls: McpXmlToolCall[] = [];
  const callRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  let match: RegExpExecArray | null;
  while ((match = callRegex.exec(xml))) {
    const body = match[1];
    const server = body.match(/<server>([\s\S]*?)<\/server>/i)?.[1];
    const tool = body.match(/<tool>([\s\S]*?)<\/tool>/i)?.[1];
    const argsBody = body.match(/<arguments>([\s\S]*?)<\/arguments>/i)?.[1] || '';
    if (!server || !tool) continue;
    const args: Record<string, any> = {};
    const argRegex = /<([a-zA-Z_][a-zA-Z0-9_.-]*)>([\s\S]*?)<\/\1>/g;
    let arg: RegExpExecArray | null;
    while ((arg = argRegex.exec(argsBody))) args[arg[1]] = parseValue(arg[2]);
    calls.push({ server: decodeXmlEntities(server.trim()), tool: decodeXmlEntities(tool.trim()), arguments: args });
  }
  return calls;
}

export function formatMcpToolCallResult(server: string, tool: string, result: { success: boolean; output: string }): string {
  const status = result.success ? 'success' : 'error';
  const field = result.success ? `<result><content>${escapeXmlText(result.output)}</content></result>` : `<error>${escapeXmlText(result.output)}</error>`;
  return `<tool_result><server>${escapeXmlText(server)}</server><tool>${escapeXmlText(tool)}</tool><status>${status}</status>${field}</tool_result>`;
}

export function formatMcpToolsAsXml(tools: McpToolInfo[]): string {
  return tools.map(tool => `<mcp_tool><server>${escapeXmlText(tool.qualifiedName.split(':')[0])}</server><name>${escapeXmlText(tool.name)}</name><description>${escapeXmlText(tool.description || '')}</description><parameters>${escapeXmlText(JSON.stringify(tool.inputSchema || {}))}</parameters></mcp_tool>`).join('\n');
}
