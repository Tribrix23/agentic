import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'optimizeImage',
  description: 'Optimize images by compressing or resizing them.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to image file' },
      quality: { type: 'number', description: 'Quality (1-100, default: 80)' },
      maxWidth: { type: 'number', description: 'Maximum width in pixels' },
      maxHeight: { type: 'number', description: 'Maximum height in pixels' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 20000,
  icon: 'Image'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, quality = 80, maxWidth, maxHeight } = args;
    const targetPath = path.startsWith('/') || /^[a-zA-Z]:\\/.test(path) 
      ? path 
      : `${context.projectRoot}/${path}`.replace(/\/+/g, '/');

    // Check if sharp or imagemagick is available
    const sharpCheck = await (window as any).electron.runCommand('which sharp', context.projectRoot);
    const magickCheck = await (window as any).electron.runCommand('which magick', context.projectRoot);
    
    let command: string;
    if (!sharpCheck.error) {
      // Use sharp (Node.js image library)
      command = `sharp "${targetPath}"`;
      if (quality) command += ` -q ${quality}`;
      if (maxWidth || maxHeight) command += ` -resize ${maxWidth || ''}x${maxHeight || ''}`;
      command += ` "${targetPath}"`;
    } else if (!magickCheck.error) {
      // Use ImageMagick
      command = `magick "${targetPath}"`;
      if (quality) command += ` -quality ${quality}`;
      if (maxWidth || maxHeight) command += ` -resize ${maxWidth || ''}x${maxHeight || ''}`;
      command += ` "${targetPath}"`;
    } else {
      return { 
        success: false, 
        output: 'Image optimization requires sharp or ImageMagick. Install with: npm install sharp or install ImageMagick.' 
      };
    }

    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Optimization failed: ${result.error}` };
    }
    
    return { success: true, output: `Image optimized: ${targetPath}` };
  } catch (error: any) {
    return { success: false, output: `Failed to optimize image: ${error.message || String(error)}` };
  }
};
