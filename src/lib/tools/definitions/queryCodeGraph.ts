import { ToolDefinition, ToolHandler } from '../types';

export const definition: ToolDefinition = {
  name: 'queryCodeGraph',
  description: 'Query the semantic Knowledge Graph (Graphify) of the codebase to find dependencies, callers, imports, or file symbols.',
  category: 'search',
  parameters: {
    type: 'object',
    properties: {
      queryType: { type: 'string', enum: ['file_symbols', 'callers', 'dependencies'], description: 'What to query.' },
      target: { type: 'string', description: 'The file path or symbol name to query.' }
    },
    required: ['queryType', 'target']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 30000,
  icon: 'Network'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { queryType, target } = args;
    const electron = (window as any).electron;
    
    if (!context.projectRoot) {
      return { success: false, output: 'No project root available for graph query.' };
    }

    if (queryType === 'file_symbols') {
      const nodes = await electron.dbGetCodeNodes(context.projectRoot);
      const fileNodes = nodes.filter((n: any) => n.filePath === target && n.symbolType !== 'file');
      return { 
        success: true, 
        output: `Symbols in ${target}:\n${fileNodes.map((n: any) => `- ${n.symbolType} ${n.symbolName} (Lines ${n.startLine}-${n.endLine})`).join('\n')}`
      };
    } else if (queryType === 'callers') {
      const callers = await electron.dbGetCodeGraphCallers(`symbol:${target}`);
      if (!callers || callers.length === 0) return { success: true, output: `No callers found for '${target}'.` };
      return {
        success: true,
        output: `Callers of '${target}':\n${callers.map((c: any) => `- ${c.symbolName} in ${c.filePath}`).join('\n')}`
      };
    } else if (queryType === 'dependencies') {
      let sourceId = target;
      if (target.includes('.')) sourceId = `file:${target}`; 
      const deps = await electron.dbGetCodeGraphDeps(sourceId);
      if (!deps || deps.length === 0) return { success: true, output: `No dependencies found for '${target}'.` };
      return {
        success: true,
        output: `Dependencies of '${target}':\n${deps.map((d: any) => `- ${d.relationType} ${d.symbolName} (${d.symbolType})`).join('\n')}`
      };
    }
    
    return { success: false, output: 'Invalid queryType.' };
  } catch (error: any) {
    return { success: false, output: `Graph query failed: ${error.message}` };
  }
};

