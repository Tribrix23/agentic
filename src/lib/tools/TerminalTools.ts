export class TerminalTools {
  
  /**
   * Executes a terminal command, automatically translating common Unix commands
   * to their Windows equivalents when running on a Windows platform.
   * Also implements context truncation to prevent token overflow.
   */
  static async executeCommand(args: { command: string, cwd?: string }): Promise<string> {
    let finalCommand = args.command;
    
    // Cross-Platform Mapping Layer
    const isWindows = typeof process !== 'undefined' ? process.platform === 'win32' : navigator.userAgent.toLowerCase().includes('windows');
    if (isWindows) {
      // Non-destructive translations
      finalCommand = finalCommand.replace(/(^|&&\s*|\|\s*|;\s*)ls(\s+|$)/g, '$1dir$2');
      finalCommand = finalCommand.replace(/(^|&&\s*|\|\s*|;\s*)cat\s+/g, '$1type ');
      finalCommand = finalCommand.replace(/(^|&&\s*|\|\s*|;\s*)touch\s+/g, '$1type nul > ');
      finalCommand = finalCommand.replace(/(^|&&\s*|\|\s*|;\s*)cp\s+/g, '$1copy ');
      finalCommand = finalCommand.replace(/(^|&&\s*|\|\s*|;\s*)mv\s+/g, '$1move ');
      finalCommand = finalCommand.replace(/(^|&&\s*|\|\s*|;\s*)pwd(\s+|$)/g, '$1cd$2');
      
      // Destructive translations (Only executed if SecurityInterceptor let it pass or user approved)
      const rmScript = `node -e "process.argv.slice(1).forEach(p=>require('fs').rmSync(p,{recursive:true,force:true}))"`;
      finalCommand = finalCommand.replace(/(^|&&\s*|\|\s*|;\s*)rm\s+-rf\s+/g, `$1${rmScript} `);
      finalCommand = finalCommand.replace(/(^|&&\s*|\|\s*|;\s*)rm\s+-r\s+/g, `$1${rmScript} `);
      finalCommand = finalCommand.replace(/(^|&&\s*|\|\s*|;\s*)rm\s+-f\s+/g, `$1${rmScript} `);
      finalCommand = finalCommand.replace(/(^|&&\s*|\|\s*|;\s*)rm\s+(?!-)/g, `$1${rmScript} `);
    }

    try {
        // Dispatch to Electron Backend via the existing exposed method
        const res = await (window as any).electron.runCommandCapture(finalCommand, args.cwd);
        
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
