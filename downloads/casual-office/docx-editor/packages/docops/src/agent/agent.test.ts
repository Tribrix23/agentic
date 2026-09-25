/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it } from 'bun:test';
import { runAgent } from './agent';
import { ToolRegistry, type ToolSource } from './registry';
import type { AgentEvent, LlmFn, LlmResponse } from './types';
import type { DocOpsResult } from '../types';

/** A scripted LLM: returns queued responses in order. */
function scriptedLlm(responses: LlmResponse[]): { llm: LlmFn; seen: string[] } {
  const seen: string[] = [];
  let i = 0;
  const llm: LlmFn = async ({ system }) => {
    seen.push(system.slice(0, 16));
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return r;
  };
  return { llm, seen };
}

function plan(...tasks: string[]): LlmResponse {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'p', name: 'submit_plan', input: { tasks } }],
  };
}
function callTool(name: string): LlmResponse {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: `c${Math.round(0)}`, name, input: {} }],
  };
}
function finish(text: string): LlmResponse {
  return { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
}
function reflection(goalMet: boolean, remainingTasks: string[] = []): LlmResponse {
  return {
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'r',
        name: 'submit_reflection',
        input: { goalMet, note: 'ok', remainingTasks },
      },
    ],
  };
}

function registryWith(names: string[], calls: string[] = []): ToolRegistry {
  const src: ToolSource = {
    id: 'docops',
    listTools: () =>
      names.map((n) => ({
        name: n,
        description: n,
        input_schema: { type: 'object' as const, properties: {} },
      })),
    callTool: async (name): Promise<DocOpsResult> => {
      calls.push(name);
      return { ok: true, changedBlockIds: [`${name}-b`] };
    },
  };
  const r = new ToolRegistry();
  r.register(src);
  return r;
}

describe('runAgent (plan → execute → reflect)', () => {
  it('plans, executes each task via the tool loop, and reflects to completion', async () => {
    const toolCalls: string[] = [];
    const registry = registryWith(['get_outline', 'rewrite_selection'], toolCalls);
    // plan(2 tasks) → task1: call tool → finish → task2: call tool → finish → reflect(met)
    const { llm } = scriptedLlm([
      plan('Rewrite the intro', 'Add a summary'),
      callTool('rewrite_selection'),
      finish('done step 1'),
      callTool('rewrite_selection'),
      finish('done step 2'),
      reflection(true),
    ]);

    const events: AgentEvent[] = [];
    const result = await runAgent(
      'Polish the document',
      { llm, registry },
      { onEvent: (e) => events.push(e) }
    );

    expect(result.goalMet).toBe(true);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.every((t) => t.status === 'done')).toBe(true);
    // Both executed tasks called the write tool.
    expect(toolCalls).toEqual(['rewrite_selection', 'rewrite_selection']);
    expect(result.changedBlockIds).toContain('rewrite_selection-b');
    // Emitted a plan event with the two tasks and a terminal done event.
    expect(events.find((e) => e.type === 'plan')).toBeTruthy();
    expect(events.find((e) => e.type === 'done')).toBeTruthy();
  });

  it('appends corrective tasks when reflection says the goal is not met', async () => {
    const registry = registryWith(['rewrite_selection']);
    const { llm } = scriptedLlm([
      plan('Do the thing'),
      finish('did the thing'),
      reflection(false, ['Fix the leftover issue']),
      finish('fixed it'),
      reflection(true),
    ]);
    const result = await runAgent('Goal', { llm, registry }, { maxReflections: 2 });
    // Original task + one corrective task from reflection.
    expect(result.tasks.length).toBeGreaterThanOrEqual(2);
    expect(result.tasks.some((t) => t.title === 'Fix the leftover issue')).toBe(true);
  });

  it('stops a task that repeats the identical tool call (loop guard)', async () => {
    const toolCalls: string[] = [];
    const registry = registryWith(['get_outline'], toolCalls);
    // The executor emits the SAME call every round; scriptedLlm repeats the last
    // response, so without the guard it would run all maxRoundsPerTask rounds.
    const { llm } = scriptedLlm([
      plan('Read the outline'),
      callTool('get_outline'),
      callTool('get_outline'),
      reflection(true),
    ]);
    await runAgent('Goal', { llm, registry }, { maxRoundsPerTask: 6 });
    // Executed once, then the guard broke the loop — not 6 identical calls.
    expect(toolCalls).toEqual(['get_outline']);
  });

  it('feeds the planning context snapshot to the planner', async () => {
    const registry = registryWith(['rewrite_selection']);
    let planMsg = '';
    let call = 0;
    const llm: LlmFn = async ({ messages }) => {
      if (call++ === 0) {
        const c = messages[0].content;
        planMsg = typeof c === 'string' ? c : '';
        return plan('Do X');
      }
      return finish('done');
    };
    await runAgent(
      'Summarize the document',
      { llm, registry },
      { planningContext: 'H1: Introduction\nH2: Methods' }
    );
    expect(planMsg).toContain('H2: Methods');
    expect(planMsg).toContain('Summarize the document');
  });

  it('marks a step that calls no tool as failed, not done (no false success)', async () => {
    const registry = registryWith(['rewrite_selection']);
    // The executor narrates without calling any tool, then reflection claims met.
    const { llm } = scriptedLlm([
      plan('Rewrite the intro'),
      finish('I have rewritten the introduction.'),
      reflection(true),
    ]);
    const result = await runAgent('Goal', { llm, registry });
    expect(result.tasks[0].status).toBe('failed');
    expect(result.changedBlockIds).toHaveLength(0);
  });

  it('falls back to the goal as a single task when no plan is produced', async () => {
    const registry = registryWith(['get_outline']);
    const { llm } = scriptedLlm([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] }, // empty plan
      finish('done'),
      reflection(true),
    ]);
    const result = await runAgent('Just do X', { llm, registry });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe('Just do X');
  });

  it('stops when aborted', async () => {
    const registry = registryWith(['get_outline']);
    const controller = new AbortController();
    const { llm } = scriptedLlm([plan('a', 'b', 'c')]);
    controller.abort();
    const result = await runAgent('Goal', { llm, registry }, { signal: controller.signal });
    // Aborted before executing any task.
    expect(result.tasks.every((t) => t.status !== 'done')).toBe(true);
  });
});
