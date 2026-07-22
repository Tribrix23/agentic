import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'readUrl',
  description: 'Read contents of a URL.',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to read' }
    },
    required: ['url']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 30000,
  icon: 'Link'
};

export const handler: ToolHandler = async (args, context) => {
  // Stub implementation as requested
  return { 
    success: false, 
    output: 'URL reading requires backend configuration. This feature is currently not available.' 
  };
};
