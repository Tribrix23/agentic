import { ToolCall } from './messageTypes';

export class SecurityInterceptor {
  // Blacklist of destructive commands that require manual UI approval
  private static DANGEROUS_TERMINAL_REGEX = /\b(rm|del|rd|rmdir|format|mkfs|chmod|chown|kill|taskkill)\b/i;

  /**
   * Evaluates a tool call to determine if it requires explicit user approval
   * before execution can proceed.
   */
  static requiresApproval(toolCall: ToolCall): boolean {
    if (toolCall.name === 'delete_file') return true;
    
    if (toolCall.name === 'run_terminal_command' && toolCall.arguments.command) {
      if (this.DANGEROUS_TERMINAL_REGEX.test(toolCall.arguments.command)) {
        return true; 
      }
    }
    
    return false;
  }
}
