import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'convertFormat',
  description: 'Convert files between formats (e.g., JSON to YAML, Markdown to HTML).',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to file to convert' },
      from: { type: 'string', description: 'Source format (json, yaml, markdown, html)' },
      to: { type: 'string', description: 'Target format (json, yaml, markdown, html)' },
      outputPath: { type: 'string', description: 'Output file path (optional, defaults to same name with new extension)' }
    },
    required: ['path', 'from', 'to']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 15000,
  icon: 'RefreshCw'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, from, to, outputPath } = args;
    const targetPath = path.startsWith('/') || /^[a-zA-Z]:\\/.test(path) 
      ? path 
      : `${context.projectRoot}/${path}`.replace(/\/+/g, '/');

    const content = await (window as any).electron.readFileContent(targetPath, context.projectRoot);
    let convertedContent: string;
    
    // Simple format conversions
    if (from === 'json' && to === 'yaml') {
      const obj = JSON.parse(content);
      convertedContent = JSON.stringify(obj, null, 2)
        .replace(/"/g, '')
        .replace(/:/g, ': ')
        .replace(/,/g, '');
      // This is a very basic conversion - in production, use a proper library
      return { success: false, output: 'JSON to YAML conversion requires a YAML library. Use a tool like js-yaml.' };
    } else if (from === 'yaml' && to === 'json') {
      return { success: false, output: 'YAML to JSON conversion requires a YAML library. Use a tool like js-yaml.' };
    } else if (from === 'markdown' && to === 'html') {
      return { success: false, output: 'Markdown to HTML conversion requires a library like marked.' };
    } else if (from === 'html' && to === 'markdown') {
      return { success: false, output: 'HTML to Markdown conversion requires a library like turndown.' };
    } else {
      return { success: false, output: `Conversion from ${from} to ${to} is not supported or requires additional libraries.` };
    }
    
    const finalOutputPath = outputPath || path.replace(new RegExp(`\\.${from}$`), `.${to}`);
    await (window as any).electron.writeFileContent(finalOutputPath, convertedContent);
    
    return { success: true, output: `Converted to: ${finalOutputPath}` };
  } catch (error: any) {
    return { success: false, output: `Failed to convert: ${error.message || String(error)}` };
  }
};
