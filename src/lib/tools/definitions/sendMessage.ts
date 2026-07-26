import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'sendMessage',
  description: 'Sends a message to a running subagent.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      conversationId: { type: 'string', description: 'The conversation ID of the subagent.' },
      message: { type: 'string', description: 'The message to send.' }
    },
    required: ['conversationId', 'message']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 60000,
  icon: 'MessageSquare'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { conversationId, message } = args;
    
    // Dispatch event to MainContent to send the message to the actual subagent loop
    window.dispatchEvent(new CustomEvent('send-subagent-message', {
      detail: {
        conversationId,
        message
      }
    }));

    return { 
      success: true, 
      output: `Message sent to subagent ${conversationId}.` 
    };
  } catch (error: any) {
    return { success: false, output: `Failed to send message: ${error.message || String(error)}` };
  }
};
