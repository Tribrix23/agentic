export interface ProjectMemoryRule {
  id: string;
  projectId: string;
  memoryKey: string;
  memoryValue: string;
  updatedAt: number;
}

/**
 * Loads project-specific architectural rules and context from the SQLite database.
 * This is meant to be injected into the system prompt for every new conversation.
 */
export function getProjectRules(projectId: string): string {
  try {
    const memory = (window as any).electron.dbGetProjectMemory(projectId) as ProjectMemoryRule[];
    if (!memory || memory.length === 0) return '';
    
    let rulesStr = '\\n\\n[Project Memory / Learned Rules]\\n';
    memory.forEach(rule => {
      rulesStr += `- ${rule.memoryKey}: ${rule.memoryValue}\\n`;
    });
    return rulesStr;
  } catch (e) {
    console.error('Failed to load project memory:', e);
    return '';
  }
}

/**
 * Saves a new synthesized rule about the codebase into the SQLite memory table.
 */
export function learnProjectRule(projectId: string, key: string, value: string): boolean {
  try {
    (window as any).electron.dbSaveProjectMemory(projectId, key, value);
    console.log(`[ProjectContext] Learned rule for ${projectId}: ${key} = ${value}`);
    return true;
  } catch (e) {
    console.error('Failed to save project memory:', e);
    return false;
  }
}
