import { ToolDefinition, ToolHandler } from '../types';

export const definition: ToolDefinition = {
  name: 'listWindows',
  description: 'List all open windows with their titles and process IDs.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 5000,
  icon: 'Window'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    let captureTitles: string[] = [];
    if ((window as any).electron?.listCaptureWindows) {
      try {
        const sources = await (window as any).electron.listCaptureWindows();
        if (Array.isArray(sources)) {
          captureTitles = sources.map((s: any) => s.name?.trim()).filter(Boolean);
        }
      } catch {
        // ignore
      }
    }

    const command = "powershell -NoProfile -Command '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Process | Where-Object {$_.MainWindowTitle -ne \"\"} | Select-Object Id, ProcessName, MainWindowTitle | Format-Table -AutoSize'";
    const result = await (window as any).electron.runCommandCapture(command, context.projectRoot);

    const sections: string[] = [];
    if (captureTitles.length > 0) {
      sections.push(`Windows available for screenshot capture (${captureTitles.length}):\n` + captureTitles.map(t => `- "${t}"`).join('\n'));
    }
    if (result.stdout?.trim()) {
      sections.push(`Process details:\n${result.stdout.trim()}`);
    }

    if (sections.length === 0) {
      if (result.error) {
        return { success: false, output: `Failed to list windows: ${result.error}` };
      }
      return { success: true, output: 'No windows found.' };
    }

    return { success: true, output: sections.join('\n\n') };
  } catch (error: any) {
    return { success: false, output: `Failed to list windows: ${error.message || String(error)}` };
  }
};
