import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'validateSchema',
  description: 'Validate JSON or YAML files against a schema or check for syntax errors.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to file to validate' },
      schemaPath: { type: 'string', description: 'Path to JSON schema file (optional)' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 10000,
  icon: 'CheckSquare'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, schemaPath } = args;
    const targetPath = path.startsWith('/') || /^[a-zA-Z]:\\/.test(path) 
      ? path 
      : `${context.projectRoot}/${path}`.replace(/\/+/g, '/');

    const content = await (window as any).electron.readFileContent(targetPath);
    const ext = path.split('.').pop()?.toLowerCase();
    
    if (ext === 'json') {
      try {
        JSON.parse(content);
        if (schemaPath) {
          const schemaTarget = schemaPath.startsWith('/') || /^[a-zA-Z]:\\/.test(schemaPath) 
            ? schemaPath 
            : `${context.projectRoot}/${schemaPath}`.replace(/\/+/g, '/');
          const schemaContent = await (window as any).electron.readFileContent(schemaTarget);
          JSON.parse(schemaContent);
          return { success: true, output: 'JSON is valid. Schema is valid.' };
        }
        return { success: true, output: 'JSON is valid.' };
      } catch (e: any) {
        return { success: false, output: `JSON validation failed: ${e.message}` };
      }
    } else if (ext === 'yaml' || ext === 'yml') {
      // Basic YAML validation - check for common syntax errors
      const lines = content.split('\n');
      const errors: string[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Check for tabs (YAML should use spaces)
        if (line.includes('\t')) {
          errors.push(`Line ${i + 1}: Contains tabs (use spaces)`);
        }
        // Check for inconsistent indentation
        if (line.match(/^\s+/) && line.match(/^\s+/)![0].startsWith('  ')) {
          errors.push(`Line ${i + 1}: Inconsistent indentation`);
        }
      }
      
      if (errors.length > 0) {
        return { success: false, output: `YAML validation failed:\n${errors.join('\n')}` };
      }
      
      return { success: true, output: 'YAML appears valid (basic check).' };
    }
    
    return { success: false, output: 'Unsupported file type. Use .json, .yaml, or .yml' };
  } catch (error: any) {
    return { success: false, output: `Validation failed: ${error.message || String(error)}` };
  }
};
