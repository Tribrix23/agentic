export class TerminalTools {
  
  /**
   * Executes a terminal command, automatically translating common Unix commands
   * to their Windows equivalents when running on a Windows platform.
   * Also implements context truncation to prevent token overflow.
   */
  static async executeCommand(args: { command: string, cwd?: string }): Promise<string> {
    let finalCommand = args.command;
    
    // Cross-Platform Mapping Layer
    if (process.platform === 'win32') {
      // Non-destructive translations
      if (finalCommand.startsWith('ls')) finalCommand = finalCommand.replace(/^ls/, 'dir');
      if (finalCommand.startsWith('cat ')) finalCommand = finalCommand.replace(/^cat /, 'type ');
      if (finalCommand.startsWith('touch ')) finalCommand = finalCommand.replace(/^touch /, 'type nul > ');
      if (finalCommand.startsWith('cp ')) finalCommand = finalCommand.replace(/^cp /, 'copy ');
      if (finalCommand.startsWith('mv ')) finalCommand = finalCommand.replace(/^mv /, 'move ');
      if (finalCommand.startsWith('pwd')) finalCommand = finalCommand.replace(/^pwd/, 'cd');
      
      // Destructive translations (Only executed if SecurityInterceptor let it pass or user approved)
      if (finalCommand.startsWith('rm -rf ')) finalCommand = finalCommand.replace(/^rm -rf /, 'rmdir /s /q ');
      else if (finalCommand.startsWith('rm ')) finalCommand = finalCommand.replace(/^rm /, 'del ');
    }

    try {
        // Dispatch to Electron Backend via the existing IPC handler
        const res = await (window as any).electron.invoke('run-command-capture', finalCommand, args.cwd);
        
        // CONTEXT TRUNCATION: Prevent terminal outputs from blowing out the LLM context window
        let output = res.stdout || res.stderr || 'Command executed successfully.';
        
        // If output exceeds 2000 characters, truncate the middle to save tokens
        if (output.length > 2000) {
            output = output.substring(0, 1000) + 
                     "\n\n...[OUTPUT TRUNCATED BY SYSTEM TO PRESERVE TOKENS]...\n\n" + 
                     output.substring(output.length - 1000);
        }
        
        return output;
    } catch (e: any) {
        return `Error executing command: ${e.message}`;
    }
  }
}
