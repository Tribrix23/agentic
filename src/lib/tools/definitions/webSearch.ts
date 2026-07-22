import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'webSearch',
  description: 'Search the web for information.',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' }
    },
    required: ['query']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 30000,
  icon: 'Globe'
};

export const handler: ToolHandler = async (args, context) => {
  // Stub implementation as requested
  return { 
    success: false, 
    output: 'Web search requires backend configuration. This feature is currently not available.' 
  };
};
