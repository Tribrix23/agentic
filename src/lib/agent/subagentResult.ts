import type { AgenticMessage, ToolCall } from '../messageTypes';
import type { SubagentOutcome } from './subagentTypes';

export function resultFromChildMessages(messages: AgenticMessage[]): Pick<SubagentOutcome, 'summary' | 'finalAssistantContent' | 'changedFiles' | 'toolCalls' | 'commands' | 'tests' | 'diagnostics' | 'artifacts' | 'unresolvedItems'> {
  const calls = messages.flatMap(message => message.toolCalls || []);
  const finalAssistantContent = [...messages].reverse().find(message => message.role === 'assistant' && message.content.trim())?.content.trim() || '';
  const changedFiles = unique(calls.flatMap(changedPath));
  const commands = calls.filter(call => ['runCommand', 'executeCode'].includes(call.name)).map(call => String(call.arguments.command || call.arguments.code || '')).filter(Boolean);
  const tests = calls.filter(call => call.name === 'runTests' || /(?:^|\s)(?:test|vitest|jest|pytest)(?:\s|$)/i.test(String(call.arguments.command || ''))).map(call => String(call.arguments.command || call.result?.summary || call.name));
  const diagnostics = calls.flatMap(call => call.result?.diagnostics || []);
  const artifacts = calls.flatMap(call => call.result?.artifacts || []);
  const failed = calls.filter(call => call.status === 'error' || call.result?.success === false);
  return {
    summary: finalAssistantContent.split(/\r?\n/, 1)[0] || (failed.length ? 'Subagent failed.' : 'Subagent completed.'),
    finalAssistantContent,
    changedFiles,
    toolCalls: calls,
    commands,
    tests,
    diagnostics,
    artifacts,
    unresolvedItems: failed.map(call => `${call.name}: ${call.result?.summary || call.result?.output || 'failed'}`),
  };
}

function changedPath(call: ToolCall): string[] {
  if (!['writeFile', 'editFile', 'createFile', 'deleteFile', 'renameFile', 'createFolder', 'deleteFolder', 'renameFolder'].includes(call.name) || call.result?.success === false) return [];
  return [call.arguments.path, call.arguments.TargetFile, call.arguments.filePath, call.arguments.newPath].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function unique(values: string[]): string[] { return [...new Set(values)]; }