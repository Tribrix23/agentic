import { ToolDefinition, ToolHandler, ToolResult } from '../types';
import { calculateLineChanges } from '../../incrementalToolCallParser';

// A first write is deliberately small so a provider reaching its output limit
// cannot leave the agent with an unusable partial tool call. Later sections are
// added with editFile, which has no artificial content limit.
export const MAX_INITIAL_WRITE_CHARS = 12000;

export const definition: ToolDefinition = {
  name: 'writeFile',
  description: `Create or replace a file. For a large new file, write a valid skeleton plus at most one logical section (maximum ${MAX_INITIAL_WRITE_CHARS} characters), then continue in later responses with one editFile insertion per section. Never generate or resend a complete large file in one call. Also creates rich Markdown artifacts such as plans or reports.`,
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file or artifact name (e.g. implementation_plan.md)' },
      content: { type: 'string', description: `Complete content for this bounded write. New non-artifact files are limited to ${MAX_INITIAL_WRITE_CHARS} characters; use stable insertion anchors for later editFile calls.` },
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
    
    // The executor serializes writes targeting this path. The branch file
    // still protects the existing file if the staged write itself fails.
    // 1. Write to a .agentic-branch temp file first
    // 2. On success, copy content to the real target
    // 3. On failure, the original file is untouched
    const branchPath = targetPath + '.agentic-branch';

    const boundaryRoot = isArtifact ? `${(window as any).electron.appDataDir || context.projectRoot}/.agentic/brain` : context.projectRoot;
    const fileExistedBeforeWrite = await (window as any).electron.fileExists(targetPath, boundaryRoot).catch(() => false);
    if (!isArtifact && !fileExistedBeforeWrite && content.length > MAX_INITIAL_WRITE_CHARS) {
      return {
        success: false,
        output: `Initial write is too large (${content.length} characters; maximum ${MAX_INITIAL_WRITE_CHARS}). On the next response, create only a valid skeleton plus one logical section. Then use one editFile insertion per response for each remaining section. Do not resend the complete file.`,
      };
    }
    
    // Step 1: Write content to the branch file
    const branchResult = await (window as any).electron.saveFileContent(branchPath, content, { createDirs: true, projectRoot: boundaryRoot });
    
    if (!branchResult.success) {
      console.error('[writeFile] Branch write failed:', branchResult.error);
      return { success: false, output: `Failed to write file (branch): ${branchResult.error}` };
    }
    
    // Step 2: Check if the file already existed (before we overwrite it)
    const fileExisted = fileExistedBeforeWrite;
    let previousContent = '';
    if (fileExisted) {
      try {
        previousContent = await (window as any).electron.readFileContent(targetPath, boundaryRoot) || '';
      } catch (e) { /* ignore */ }
    }
    
    // Step 3: Write to the actual target (branch validated the content was written successfully)
    const result = await (window as any).electron.saveFileContent(targetPath, content, { createDirs: true, projectRoot: boundaryRoot });
    
    // Step 3: Clean up branch file (best effort)
    try {
      if ((window as any).electron?.deleteFile) {
        await (window as any).electron.deleteFile(branchPath, boundaryRoot);
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
        await (window as any).electron.saveFileContent(`${targetPath}.meta.json`, JSON.stringify(artifactMetadata), { createDirs: true, projectRoot: boundaryRoot });
        
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
      const changes = calculateLineChanges(previousContent, content);
      return { 
        success: true, 
        output: `Successfully ${fileExisted ? 'updated' : 'created'} ${targetPath} (${content.length} characters)`,
        artifacts: [{
          type: 'file_change',
          path: targetPath,
          content,
          isNew: !fileExisted,
          added: changes.added,
          removed: changes.removed
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
