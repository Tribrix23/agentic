import { McpToolInfo } from './types';

function escapeXml(value: any): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function parseValue(value: string): any {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

export interface McpXmlToolCall { server: string; tool: string; arguments: Record<string, any>; }

export function parseMcpToolCalls(xml: string): McpXmlToolCall[] {
  const calls: McpXmlToolCall[] = [];
  const callRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  let match: RegExpExecArray | null;
  while ((match = callRegex.exec(xml))) {
    const body = match[1];
    const server = body.match(/<server>([\s\S]*?)<\/server>/i)?.[1]?.trim();
    const tool = body.match(/<tool>([\s\S]*?)<\/tool>/i)?.[1]?.trim();
    const argsBody = body.match(/<arguments>([\s\S]*?)<\/arguments>/i)?.[1] || '';
    if (!server || !tool) continue;
    const args: Record<string, any> = {};
    const argRegex = /<([a-zA-Z_][a-zA-Z0-9_.-]*)>([\s\S]*?)<\/\1>/g;
    let arg: RegExpExecArray | null;
    while ((arg = argRegex.exec(argsBody))) args[arg[1]] = parseValue(arg[2]);
    calls.push({ server, tool, arguments: args });
  }
  return calls;
}

export function formatMcpToolCallResult(server: string, tool: string, result: { success: boolean; output: string }): string {
  const status = result.success ? 'success' : 'error';
  const field = result.success ? `<result><content>${escapeXml(result.output)}</content></result>` : `<error>${escapeXml(result.output)}</error>`;
  return `<tool_result><server>${escapeXml(server)}</server><tool>${escapeXml(tool)}</tool><status>${status}</status>${field}</tool_result>`;
}

export function formatMcpToolsAsXml(tools: McpToolInfo[]): string {
  return tools.map(tool => `<mcp_tool><server>${escapeXml(tool.qualifiedName.split(':')[0])}</server><name>${escapeXml(tool.name)}</name><description>${escapeXml(tool.description || '')}</description><parameters>${escapeXml(JSON.stringify(tool.inputSchema || {}))}</parameters></mcp_tool>`).join('\n');
}
