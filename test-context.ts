import { buildContext } from './src/lib/contextBuilder';
import { createAssistantMessage, createToolMessage, createUserMessage } from './src/lib/messageTypes';
import { DEFAULT_AI_CONFIG } from './src/lib/aiConfig';

const config = { ...DEFAULT_AI_CONFIG, contextWindowSize: 128000 };

const messages = [
  createUserMessage('read the folder'),
];

const assistantMsg = createAssistantMessage('Dispatcher v1');
assistantMsg.content = "Thinking through the approach... \n```json\n{\"tool_call\": {\"name\": \"listDirectory\", \"arguments\": {\"path\": \".\"}}}\n```";
assistantMsg.toolCalls = [{ id: '1', name: 'listDirectory', arguments: { path: '.' } }];

messages.push(assistantMsg);

const toolMsg = createToolMessage('1', 'listDirectory', { success: true, output: 'file tree here' });
messages.push(toolMsg);

const context = buildContext(config, messages, undefined, undefined);

console.log(JSON.stringify(context.messages, null, 2));
