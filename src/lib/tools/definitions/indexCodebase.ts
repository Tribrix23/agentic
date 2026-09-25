import { ToolDefinition, ToolHandler } from '../types';
import { buildProjectGraph } from '../../search/astIndexer';

export const definition: ToolDefinition = {
  name: 'indexCodebase',
  description: 'Parses the entire codebase (TS, JS) to build or refresh the semantic Knowledge Graph (Graphify) so queryCodeGraph works.',
  category: 'search',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 30000,
  icon: 'RefreshCw'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    if (!context.projectRoot) {
      return { success: false, output: 'No project root to index.' };
    }
    
    // Call the exported buildProjectGraph
    await buildProjectGraph(context.projectRoot);
    
    return { success: true, output: 'Codebase Knowledge Graph successfully indexed! You can now use queryCodeGraph.' };
  } catch (error: any) {
    return { success: false, output: `Indexing failed: ${error.message}` };
  }
};

