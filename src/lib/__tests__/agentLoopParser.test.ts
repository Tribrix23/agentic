import { parseToolCallsFromText } from '../agentLoop';
import { describe, it, expect } from 'vitest';

const knownTools = new Set(['askUser', 'writeFile']);

describe('agent loop text tool parser', () => {
  it('parses the legacy askUser XML form', () => {
    const legacy = parseToolCallsFromText(
      '<tool_call>\n<function=askUser>\n<question>What type of file would you like me to create?</question>\n</function>\n</tool_call>',
      knownTools,
    );

    expect(legacy).toHaveLength(1);
    expect(legacy[0].name).toBe('askUser');
    expect(legacy[0].arguments.question).toBe('What type of file would you like me to create?');
  });

  it('parses the canonical parameter XML form', () => {
    const canonical = parseToolCallsFromText(
      '<tool_call><function=askUser><parameter=question>Which path should I use?</parameter></function></tool_call>',
      knownTools,
    );

    expect(canonical).toHaveLength(1);
    expect(canonical[0].arguments.question).toBe('Which path should I use?');
  });

  it('does not parse ordinary XML outside a tool_call wrapper', () => {
    const ordinaryXml = parseToolCallsFromText('<question>This is ordinary response content.</question>', knownTools);
    expect(ordinaryXml).toHaveLength(0);
  });
});