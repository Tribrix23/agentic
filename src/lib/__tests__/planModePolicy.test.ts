import { describe, expect, it } from 'vitest';
import { buildPlanModeContract, getImplementationPlanPath, getInteractionMode, getPlanToolDefinitions, normalizePlanToolCall, rejectPlanToolCall } from '../tools/planModePolicy';

describe('Plan mode policy', () => {
  it('preserves explicit modes and legacy agentMode behavior', () => {
    expect(getInteractionMode({ interactionMode: 'plan', agentMode: true })).toBe('plan');
    expect(getInteractionMode({ agentMode: true })).toBe('agent');
    expect(getInteractionMode({ agentMode: false })).toBe('ask');
  });

  it('exposes only plan capabilities to the model', () => {
    const definitions = [
      { definition: { name: 'readFile', description: 'read', parameters: {} } },
      { definition: { name: 'writeFile', description: 'plan', parameters: {} } },
      { definition: { name: 'editFile', description: 'edit plan', parameters: {} } },
      { definition: { name: 'runCommand', description: 'process', parameters: {} } },
    ] as any;
    expect(getPlanToolDefinitions(definitions).map(tool => tool.function.name)).toEqual(['readFile', 'writeFile', 'editFile']);
  });

  it('rejects every non-plan mutation', () => {
    for (const name of ['deleteFile', 'renameFile', 'runCommand', 'invokeSubagent', 'mcp_mutate']) {
      expect(rejectPlanToolCall({ name, arguments: {} } as any)?.success).toBe(false);
    }
    expect(rejectPlanToolCall({ name: 'writeFile', arguments: {} } as any)).toBeUndefined();
    expect(rejectPlanToolCall({ name: 'editFile', arguments: {} } as any)).toBeUndefined();
  });

  it('forces normal file tools onto the canonical artifact name', () => {
    const write = normalizePlanToolCall({ name: 'writeFile', arguments: { path: '../../escape.py', content: '# Plan' } } as any);
    expect(write.arguments.path).toBe('implementation_plan.md');
    expect(write.arguments.artifactMetadata.requestFeedback).toBe(true);
    const edit = normalizePlanToolCall({ name: 'editFile', arguments: { path: 'other.md', search: 'a', replace: 'b' } } as any);
    expect(edit.arguments.path).toBe('implementation_plan.md');
  });

  it('removes provider thinking and tool markup from plan content', () => {
    const call = normalizePlanToolCall({
      name: 'writeFile',
      arguments: { path: 'implementation_plan.md', content: '<think>internal reasoning</think>\n# Real plan\n<tool_call>echo</tool_call>' },
    } as any);
    expect(call.arguments.content).toBe('# Real plan');
  });

  it('derives one conversation-scoped canonical plan path', () => {
    expect(getImplementationPlanPath({ projectRoot: 'C:/project', conversationId: 'conversation-42' })).toBe('C:/project/.agentic/brain/conversation-42/implementation_plan.md');
  });

  it('requires inspection and artifact persistence', () => {
    const contract = buildPlanModeContract();
    expect(contract).toContain('listDirectory');
    expect(contract).toContain('readFile');
    expect(contract).toContain('writeFile');
    expect(contract).toContain('implementation_plan.md');
  });
});
