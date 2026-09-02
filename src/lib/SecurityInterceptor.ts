import { ToolCall } from './messageTypes';
import { getPermissionConfig, checkPermission } from './permissions';

export class SecurityInterceptor {
  private static READ_ONLY_TOOLS = new Set([
    'read_file', 'view_file', 'list_dir', 'listDirectory', 'readFile', 'grepSearch', 'grep_search', 'findByName'
  ]);

  static requiresApproval(toolCall: ToolCall, toolDefinitions: any[] = [], projectRoot?: string): boolean {
    const config = getPermissionConfig(projectRoot);
    const permAction = checkPermission(toolCall.name, toolCall.arguments || {}, config);
    
    // If the permission engine explicitly allows or denies, respect that and don't prompt
    if (permAction === 'allow') return false;
    if (permAction === 'deny') return false; // Handled by executor to show error
    
    // If it asks, definitely ask
    if (permAction === 'ask') return true;

    // Fallback to definition
    const definition = toolDefinitions.find(item => (item?.function?.name ?? item?.name) === toolCall.name);
    if (definition?.requiresApproval === true || definition?.function?.requiresApproval === true) return true;

    return false;
  }
}
