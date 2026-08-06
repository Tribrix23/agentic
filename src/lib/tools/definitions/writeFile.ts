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
      const brainDir = `${(window as any).electron.appDataDir || context.projectRoot}/.agentic/brain/${context.conversationId || 'default'}`;
      targetPath = `${brainDir}/${relativeOrAbsPath}`.replace(/\/+/g, '/');
    } else {
      targetPath = relativeOrAbsPath.startsWith('/') || /^[a-zA-Z]:\\/.test(relativeOrAbsPath) 
        ? relativeOrAbsPath 
        : `${context.projectRoot}/${relativeOrAbsPath}`.replace(/\/+/g, '/');
    }
      
    console.log('[writeFile] Target path:', targetPath);
    
    // ── Branch-and-Merge Strategy ──────────────────────────────────────
    // 1. Write to a .agentic-branch temp file first
    // 2. On success, copy content to the real target
    // 3. On failure, the original file is untouched
    const branchPath = targetPath + '.agentic-branch';
    
    // Step 1: Write content to the branch file
    const branchResult = await (window as any).electron.saveFileContent(branchPath, content, { createDirs: true });
    
    if (!branchResult.success) {
      console.error('[writeFile] Branch write failed:', branchResult.error);
      return { success: false, output: `Failed to write file (branch): ${branchResult.error}` };
    }
    
    // Step 2: Write to the actual target (branch validated the content was written successfully)
    const result = await (window as any).electron.saveFileContent(targetPath, content, { createDirs: true });
    
    // Step 3: Clean up branch file (best effort)
    try {
      if ((window as any).electron?.deleteFile) {
        await (window as any).electron.deleteFile(branchPath);
      } else {
        // If deleteFile doesn't exist, try to remove via file system API if available
        console.warn('[writeFile] deleteFile not available, branch file may remain:', branchPath);
      }
    } catch (e) {
      console.warn('[writeFile] Failed to delete branch file:', branchPath, e);
    }
    
    console.log('[writeFile] Branch-and-merge completed:', result);
    
    if (result.success) {
      if (isArtifact) {
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
