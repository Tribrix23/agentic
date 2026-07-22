import { ToolCall, ToolResult, ToolContext } from './types';
import { getTool } from './registry';
import { checkPermission, PermissionConfig } from '../permissions';

export async function executeTool(toolCall: ToolCall, context: ToolContext, permissionConfig: PermissionConfig): Promise<ToolResult> {
  const tool = getTool(toolCall.name);
  if (!tool) {
    return { success: false, output: `Tool not found: ${toolCall.name}` };
  }

  const permission = checkPermission(toolCall.name, toolCall.arguments, permissionConfig);
  
  if (permission === 'deny') {
    return { success: false, output: `Permission denied for tool: ${toolCall.name}` };
  }

  if (permission === 'ask' || tool.definition.requiresApproval) {
    const approved = await new Promise<boolean>((resolve) => {
      const handleResponse = (e: any) => {
        if (e.detail.id === toolCall.id) {
          window.removeEventListener('tool-approval-response', handleResponse);
          resolve(e.detail.approved);
        }
      };
      window.addEventListener('tool-approval-response', handleResponse);
      window.dispatchEvent(new CustomEvent('tool-approval-request', { detail: { toolCall } }));
    });

    if (!approved) {
      return { success: false, output: `User rejected tool execution: ${toolCall.name}` };
    }
  }

  const startTime = Date.now();
  
  // Create an abort controller for the timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), tool.definition.timeout);
  
  // Merge context signal
  const onContextAbort = () => controller.abort();
  context.signal.addEventListener('abort', onContextAbort);

  try {
    const combinedContext = { ...context, signal: controller.signal };
    const result = await tool.handler(toolCall.arguments, combinedContext);
    
    // Add timing info
    if (result) {
      (result as any).durationMs = Date.now() - startTime;
    }
    
    return result;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, output: `Tool execution timed out after ${tool.definition.timeout}ms` };
    }
    return { success: false, output: `Error executing tool: ${err.message}` };
  } finally {
    clearTimeout(timeoutId);
    context.signal.removeEventListener('abort', onContextAbort);
  }
}
