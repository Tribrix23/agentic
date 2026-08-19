import { parseToolCallsFromText } from '../agentLoop';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const knownTools = new Set(['askUser', 'writeFile']);

export function runAgentLoopParserTests(): void {
  const legacy = parseToolCallsFromText(
    '<tool_call>\n<function=askUser>\n<question>What type of file would you like me to create?</question>\n</function>\n</tool_call>',
    knownTools,
  );
  assert(legacy.length === 1, 'The legacy askUser XML form should parse as one tool call');
  assert(legacy[0].name === 'askUser', 'The parsed legacy call should target askUser');
  assert(
    legacy[0].arguments.question === 'What type of file would you like me to create?',
    'The legacy question tag should become the question argument',
  );

  const canonical = parseToolCallsFromText(
    '<tool_call><function=askUser><parameter=question>Which path should I use?</parameter></function></tool_call>',
    knownTools,
  );
  assert(canonical.length === 1, 'The canonical askUser XML form should parse as one tool call');
  assert(canonical[0].arguments.question === 'Which path should I use?', 'The canonical question argument should parse');

  const ordinaryXml = parseToolCallsFromText('<question>This is ordinary response content.</question>', knownTools);
  assert(ordinaryXml.length === 0, 'XML outside a tool_call wrapper must not become a tool call');
}

if (typeof window === 'undefined') runAgentLoopParserTests();