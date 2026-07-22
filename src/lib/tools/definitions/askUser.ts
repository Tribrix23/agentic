import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'askUser',
  description: 'Ask the user a question to clarify requirements or get approval for a specific design choice.',
  category: 'user',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to ask the user' },
      options: { 
        type: 'array', 
        items: { type: 'string' },
        description: 'Optional list of predefined choices'
      }
    },
    required: ['question']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 300000, // 5 minutes wait for user
  icon: 'MessageCircleQuestion'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { question, options } = args;
    
    return await new Promise<ToolResult>((resolve) => {
      const eventId = Math.random().toString(36).substring(7);
      
      const handleResult = (e: any) => {
        if (e.detail.id === eventId) {
          window.removeEventListener('agent-user-response', handleResult);
          resolve({ success: true, output: `User answered: ${e.detail.response}` });
        }
      };
      
      window.addEventListener('agent-user-response', handleResult);
      
      window.dispatchEvent(new CustomEvent('agent-ask-user', { 
        detail: { id: eventId, question, options } 
      }));
      
      context.signal.addEventListener('abort', () => {
        window.removeEventListener('agent-user-response', handleResult);
        resolve({ success: false, output: 'User questioning aborted' });
      });
    });
  } catch (error: any) {
    return { success: false, output: `Failed to ask user: ${error.message || String(error)}` };
  }
};
