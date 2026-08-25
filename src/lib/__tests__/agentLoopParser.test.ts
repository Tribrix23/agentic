import { isStandaloneToolArgumentsJson, parseToolCallsFromText } from '../agentLoop';
import { parseTextToolProtocol } from '../agent/textToolProtocol';
import { normalizeAssistantTurn } from '../agent/turnNormalizer';
import { agenticMessageToChatMessage, createAssistantMessage, createToolMessage } from '../messageTypes';
import { IncrementalToolCallParser } from '../incrementalToolCallParser';
import { buildXmlToolPrompt } from '../contextBuilder';
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

  it('identifies leaked standalone tool arguments for an XML retry', () => {
    expect(isStandaloneToolArgumentsJson('{"path":"for_loops.c","startLine":1,"endLine":200}')).toBe(true);
    expect(isStandaloneToolArgumentsJson('{"name":"readFile","arguments":{"path":"for_loops.c"}}')).toBe(false);
    expect(isStandaloneToolArgumentsJson('{"example":"ordinary response data"}')).toBe(false);
  });

  it('accepts canonical XML and rejects JSON syntaxes in XML mode', () => {
    const xml = parseTextToolProtocol(
      '<tool_call><function=writeFile><parameter=path>notes.txt</parameter><parameter=content>Hello</parameter></function></tool_call>',
      knownTools,
      'xml',
    );
    expect(xml.actions).toHaveLength(1);
    expect(xml.actions[0].arguments).toEqual({ path: 'notes.txt', content: 'Hello' });

    expect(parseTextToolProtocol('call:writeFile{"path":"notes.txt"}', knownTools, 'xml').actions).toHaveLength(0);
    expect(parseTextToolProtocol('{"name":"writeFile","arguments":{"path":"notes.txt"}}', knownTools, 'xml').actions).toHaveLength(0);
  });

  it('does not normalize native calls in XML mode', () => {
    const turn = normalizeAssistantTurn({
      identity: { runId: 'run', conversationId: 'conversation', turnId: 'turn' },
      text: '',
      reasoning: '',
      toolCalls: [{ callId: 'native-1', name: 'writeFile', argumentsText: '{"path":"notes.txt"}' }],
      finishReason: 'tool_calls',
    }, knownTools, 'xml');
    expect(turn.actions).toHaveLength(0);
  });

  it('serializes child tool history as XML text', () => {
    const assistant = createAssistantMessage('test');
    assistant.toolCalls = [{ id: 'call-1', name: 'writeFile', arguments: { path: 'notes.txt', content: 'Hello' }, status: 'completed', timestamp: Date.now() }];
    const chat = agenticMessageToChatMessage(assistant, 'xml');
    expect(chat.tool_calls).toBeUndefined();
    expect(chat.content).toContain('<function=writeFile>');

    const result = createToolMessage('call-1', 'writeFile', { success: true, output: 'created' });
    const resultChat = agenticMessageToChatMessage(result, 'xml');
    expect(resultChat.role).toBe('user');
    expect(resultChat.content).toContain('<tool_result');
  });

  it('decodes HTML entities while preserving opaque source whitespace', () => {
    const content = '<!doctype html>\n  <h1 class="title">Hello & welcome</h1>\n';
    const parsed = parseTextToolProtocol(
      `<tool_call><function=writeFile><parameter=path>index.html</parameter><parameter=content>&lt;!doctype html&gt;\n  &lt;h1 class=&quot;title&quot;&gt;Hello &amp; welcome&lt;/h1&gt;\n</parameter></function></tool_call>`,
      knownTools,
      'xml',
    );
    expect(parsed.actions[0].arguments.content).toBe(content);
  });

  it('round-trips an intentional entity without decoding twice', () => {
    const parsed = parseTextToolProtocol(
      '<tool_call><function=writeFile><parameter=path>x.html</parameter><parameter=content>&amp;lt;</parameter></function></tool_call>',
      knownTools,
      'xml',
    );
    expect(parsed.actions[0].arguments.content).toBe('&lt;');
  });

  it('diagnoses an unencoded parameter delimiter collision', () => {
    const parsed = parseTextToolProtocol(
      '<tool_call><function=writeFile><parameter=path>x.html</parameter><parameter=content><div></parameter><p></p></div></function></tool_call>',
      knownTools,
      'xml',
    );
    expect(parsed.actions).toHaveLength(0);
    expect(parsed.diagnostics.join('\n')).toContain('Malformed XML parameters');
  });

  it('keeps CDATA out of the XML tool contract', () => {
    expect(buildXmlToolPrompt([])).toContain('Do not wrap parameter values in CDATA');
  });

  it('escapes XML child history and decodes it back', () => {
    const assistant = createAssistantMessage('test');
    assistant.toolCalls = [{ id: 'call-2', name: 'writeFile', arguments: { path: 'x.html', content: '<h1 title="a">A & B</h1>' }, status: 'completed', timestamp: Date.now() }];
    const chat = agenticMessageToChatMessage(assistant, 'xml');
    expect(chat.content).toContain('&lt;h1 title=&quot;a&quot;&gt;A &amp; B&lt;/h1&gt;');
    expect(parseTextToolProtocol(chat.content, knownTools, 'xml').actions[0].arguments.content).toBe('<h1 title="a">A & B</h1>');

    const result = agenticMessageToChatMessage(createToolMessage('call-2', 'x&tool', { success: false, output: '</parameter><p>error</p>' }), 'xml');
    expect(result.content).toContain('&lt;/parameter&gt;');
    expect(result.content).toContain('name="x&amp;tool"');
  });

  it('matches final decoding in the streaming preview', () => {
    const parser = new IncrementalToolCallParser();
    const updates = parser.feed('<tool_call><function=writeFile><parameter=path>x.html</parameter><parameter=content>\n  &lt;h1&gt;Hi &amp; bye&lt;/h1&gt;\n</parameter></function></tool_call>');
    expect(updates[0].content).toBe('  <h1>Hi & bye</h1>\n');
  });
});
