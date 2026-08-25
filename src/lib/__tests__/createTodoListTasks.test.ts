import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTextToolProtocol } from '../agent/textToolProtocol';
import { normalizeToolArguments, validateToolArguments } from '../tools/validation';
import { definition } from '../tools/definitions/createTodoListTasks';
import { executeTool } from '../tools/executor';
import '../tools';
import { clearAllTasks, getDurableTasksForConversation } from '../taskStore';
import { DEFAULT_PERMISSION_CONFIG } from '../permissions';

const conversationId = 'create-todo-xml-test';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  clearAllTasks();
});

describe('createTodoListTasks XML arguments', () => {
  it('parses and normalizes the canonical XML array argument', () => {
    const parsed = parseTextToolProtocol(
      '<tool_call>\n<function=createTodoListTasks>\n<tasks>[{"title":"Create index.html with Tailwind CDN and premium modern design (glassmorphism, vibrant palette, responsive layout)","targetFile":"index.html"}]</tasks>\n</function>\n</tool_call>',
      new Set(['createTodoListTasks']),
    );
    const normalized = normalizeToolArguments(definition.parameters, parsed.actions[0].arguments) as { tasks: unknown };

    expect(parsed.actions).toHaveLength(1);
    expect(Array.isArray(normalized.tasks)).toBe(true);
    expect(validateToolArguments(definition.parameters, normalized).valid).toBe(true);
  });

  it('executes the exact parsed call and persists its target file', async () => {
    const parsed = parseTextToolProtocol(
      '<tool_call><function=createTodoListTasks><tasks>[{"title":"Create index.html with Tailwind CDN and premium modern design (glassmorphism, vibrant palette, responsive layout)","targetFile":"index.html"}]</tasks></function></tool_call>',
      new Set(['createTodoListTasks']),
    );
    const call = {
      id: 'xml-create-todo',
      name: parsed.actions[0].name,
      arguments: parsed.actions[0].arguments,
      status: 'pending' as const,
      timestamp: Date.now(),
    };

    const result = await executeTool(call, {
      projectRoot: 'C:/test-project',
      conversationId,
      signal: new AbortController().signal,
      interactionMode: 'agent',
    }, DEFAULT_PERMISSION_CONFIG);

    expect(result.success).toBe(true);
    expect(call.arguments.tasks).toEqual([{ title: expect.stringContaining('Create index.html'), targetFile: 'index.html' }]);
    expect(getDurableTasksForConversation(conversationId)).toHaveLength(1);
    expect(getDurableTasksForConversation(conversationId)[0].metadata.targetFile).toBe('index.html');
  });

  it('keeps native arrays and rejects malformed JSON without persisting tasks', async () => {
    const nativeArgs = { tasks: [{ title: 'Native task', targetFile: 'native.html' }] };
    expect(normalizeToolArguments(definition.parameters, nativeArgs)).toEqual(nativeArgs);

    const call = {
      id: 'malformed-create-todo',
      name: 'createTodoListTasks',
      arguments: { tasks: '[{"title":"broken"' },
      status: 'pending' as const,
      timestamp: Date.now(),
    };
    const result = await executeTool(call, {
      projectRoot: 'C:/test-project',
      conversationId,
      signal: new AbortController().signal,
      interactionMode: 'agent',
    }, DEFAULT_PERMISSION_CONFIG);

    expect(result.success).toBe(false);
    expect(result.output).toContain('/tasks must be array');
    expect(getDurableTasksForConversation(conversationId)).toHaveLength(0);
  });
});
