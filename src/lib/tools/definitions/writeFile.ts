import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'writeFile',
  description: 'Write content to a file. Used for creating project files OR creating rich Markdown Artifacts (like plans or reports).',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file or artifact name (e.g. implementation_plan.md)' },
      content: { type: 'string', description: 'New content for the file' },
      artifactMetadata: {
        type: 'object',
        description: 'Metadata that defines artifact properties. Required when creating an artifact file.',
        properties: {
          requestFeedback: { type: 'boolean', description: 'Set to true to request user feedback/approval.' },
          summary: { type: 'string', description: 'Summary of the artifact file.' },
          userFacing: { type: 'boolean', description: 'Set to true to present to user.' }
        }
      }
    },
    required: ['path', 'content']
  },
  requiresApproval: false,
  dangerLevel: 'dangerous',
  timeout: 30000,
  icon: 'FilePen'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path: relativeOrAbsPath, content, artifactMetadata } = args;
    
    console.log('[writeFile] Writing file:', { path: relativeOrAbsPath, contentLength: content?.length, hasContent: !!content });
    
    if (!content) {
      console.error('[writeFile] No content provided for file:', relativeOrAbsPath);
      return { success: false, output: `Failed to write file: No content provided` };
    }
    
    let targetPath = relativeOrAbsPath;
    let isArtifact = !!artifactMetadata;

    if (isArtifact) {
      // Artifacts go into the brain folder
      const brainDir = `${(window as any).electron.appDataDir || context.projectRoot}/.agentic/brain/${context.conversationId || 'default'}`;
      targetPath = `${brainDir}/${relativeOrAbsPath}`.replace(/\/+/g, '/');
      // Ensure directory exists via IPC or just let saveFileContent handle it if backend does recursive
    } else {
      targetPath = relativeOrAbsPath.startsWith('/') || /^[a-zA-Z]:\\/.test(relativeOrAbsPath) 
        ? relativeOrAbsPath 
        : `${context.projectRoot}/${relativeOrAbsPath}`.replace(/\/+/g, '/');
    }
      
    console.log('[writeFile] Target path:', targetPath);
      
    // Ask backend to create dirs recursively and save
    const result = await (window as any).electron.saveFileContent(targetPath, content, { createDirs: true });
    
    console.log('[writeFile] Save result:', result);
    
    if (result.success) {
      if (isArtifact) {
        // Also save metadata
        await (window as any).electron.saveFileContent(`${targetPath}.meta.json`, JSON.stringify(artifactMetadata), { createDirs: true });
        
        return {
          success: true,
          output: `Successfully saved artifact to ${targetPath}`,
          artifacts: [{
            type: 'artifact_created',
            path: targetPath,
            metadata: artifactMetadata
          }]
        };
      }
      return { 
        success: true, 
        output: `Successfully wrote to ${targetPath} (${content.length} characters)`,
        artifacts: [{
          type: 'file_change',
          path: targetPath,
          content
        }]
      };
    } else {
      console.error('[writeFile] Save failed:', result.error);
      return { success: false, output: `Failed to write file: ${result.error}` };
    }
  } catch (error: any) {
    console.error('[writeFile] Exception:', error);
    return { success: false, output: `Failed to write file: ${error.message || String(error)}` };
  }
};
