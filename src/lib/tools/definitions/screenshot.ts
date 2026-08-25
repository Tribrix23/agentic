import { ToolDefinition, ToolHandler } from '../types';

export const definition: ToolDefinition = {
  name: 'screenshot',
  description: 'Capture only a specific application window by title, like OBS Window Capture. The target may be behind other windows or minimized. Omit windowTitle to capture the primary screen.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      windowTitle: { type: 'string', description: 'Full or partial application window title. Use listWindows first when the title is unknown.' },
      savePath: { type: 'string', description: 'Path to save the screenshot (optional, defaults to temp)' },
      format: { type: 'string', description: 'Image format (png, jpg, default: png)' }
    },
    required: []
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 20000,
  icon: 'Camera'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { windowTitle, savePath } = args;
    const format = String(args.format || 'png').toLowerCase() === 'jpg' ? 'jpg' : 'png';
    const timestamp = Date.now();
    const defaultPath = `${context.projectRoot}/screenshot_${timestamp}.${format}`;
    const outputPath = savePath || defaultPath;

    let attachments: any[] = [];
    const attachImage = async () => {
      try {
        const base64data = await (window as any).electron.readFileContent(outputPath, context.projectRoot);
        if (base64data && typeof base64data === 'string' && base64data.startsWith('data:image')) {
          attachments = [{
            name: `screenshot.${format}`,
            path: outputPath,
            content: base64data
          }];
        } else {
          console.error('Invalid image data returned from readFileContent');
        }
      } catch (err) {
        console.error('Failed to attach screenshot for vision:', err);
      }
    };

    if (windowTitle) {
      const result = await (window as any).electron.captureWindow({ windowTitle, savePath: outputPath, format });
      if (!result.success) {
        return { success: false, output: `Window screenshot failed: ${result.error}` };
      }
      await attachImage();
      return {
        success: true,
        output: `Captured only window "${result.title}" (PID ${result.processId}) to: ${outputPath}\nThe image has been automatically attached to this message so you can read it.`,
        artifacts: [{ type: 'artifact_created', path: outputPath, metadata: { kind: 'image', title: result.title, processId: result.processId } }],
        attachments,
      };
    }

    const escapedPath = outputPath.replace(/'/g, "''");
    const imageFormat = format === 'jpg' ? 'Jpeg' : 'Png';
    const screenshotCommand = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height; $graphics = [System.Drawing.Graphics]::FromImage($bmp); $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); $bmp.Save('${escapedPath}', [System.Drawing.Imaging.ImageFormat]::${imageFormat}); $graphics.Dispose(); $bmp.Dispose()"`;
    const result = await (window as any).electron.runCommandCapture(screenshotCommand, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Screenshot failed: ${result.error}` };
    }
    
    await attachImage();
    return {
      success: true,
      output: `Primary-screen screenshot saved to: ${outputPath}\nThe image has been automatically attached to this message so you can read it.`,
      artifacts: [{ type: 'artifact_created', path: outputPath, metadata: { kind: 'image', title: 'Primary screen' } }],
      attachments,
    };
  } catch (error: any) {
    return { success: false, output: `Failed to take screenshot: ${error.message || String(error)}` };
  }
};
