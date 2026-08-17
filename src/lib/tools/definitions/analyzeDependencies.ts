import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'analyzeDependencies',
  description: 'Analyze project dependencies from package.json, requirements.txt, or similar files.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to dependency file (auto-detected if not provided)' },
      checkOutdated: { type: 'boolean', description: 'Check for outdated dependencies' }
    },
    required: []
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 15000,
  icon: 'Package'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, checkOutdated = false } = args;
    
    // Try to find package.json or requirements.txt
    let depFile = path;
    if (!depFile) {
      const tree = await (window as any).electron.readProjectFiles(context.projectRoot);
      const findDepFile = (nodes: any[]): string | null => {
        for (const node of nodes) {
          if (node.type === 'file' && (node.name === 'package.json' || node.name === 'requirements.txt')) {
            return node.path;
          }
          if (node.children) {
            const found = findDepFile(node.children);
            if (found) return found;
          }
        }
        return null;
      };
      depFile = findDepFile(tree);
    }
    
    if (!depFile) {
      return { success: false, output: 'No dependency file found (package.json or requirements.txt)' };
    }
    
    const content = await (window as any).electron.readFileContent(depFile);
    const fileName = depFile.split('/').pop();
    
    let analysis = `Analyzing ${fileName}:\n\n`;
    
    if (fileName === 'package.json') {
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depCount = Object.keys(deps).length;
      analysis += `Total dependencies: ${depCount}\n\n`;
      
      analysis += 'Production dependencies:\n';
      if (pkg.dependencies) {
        Object.entries(pkg.dependencies).forEach(([name, version]) => {
          analysis += `  - ${name}: ${version}\n`;
        });
      }
      
      analysis += '\nDevelopment dependencies:\n';
      if (pkg.devDependencies) {
        Object.entries(pkg.devDependencies).forEach(([name, version]) => {
          analysis += `  - ${name}: ${version}\n`;
        });
      }
      
      if (checkOutdated) {
        analysis += '\nNote: Outdated check requires npm CLI. Run: npm outdated';
      }
    } else if (fileName === 'requirements.txt') {
      const lines = content.split('\n').filter((l: string) => l.trim() && !l.startsWith('#'));
      analysis += `Total dependencies: ${lines.length}\n\n`;
      lines.forEach((line: string) => {
        analysis += `  - ${line}\n`;
      });
    }
    
    return { success: true, output: analysis };
  } catch (error: any) {
    return { success: false, output: `Failed to analyze dependencies: ${error.message || String(error)}` };
  }
};
