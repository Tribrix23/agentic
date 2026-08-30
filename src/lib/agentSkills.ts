export interface AgentSkill {
  name: string;
  description: string;
}

export async function getInstalledSkills(projectRoot: string): Promise<AgentSkill[]> {
  const electron = (window as any).electron;
  if (!electron) return [];

  const possiblePaths: string[] = [];

  try {
    if (electron.getUserDataPath) {
      const userDataPath = await electron.getUserDataPath();
      possiblePaths.push(`${userDataPath}/skills/.agents/skills`);
      possiblePaths.push(`${userDataPath}/.agents/skills`);
    }
  } catch(e) {
    // ignore
  }

  // Fallback for dev mode where preload hasn't refreshed
  possiblePaths.push(`C:/Codes/agentic/skills/.agents/skills`);
  possiblePaths.push(`C:/Codes/agentic/.agents/skills`);

  const skills: AgentSkill[] = [];

  for (const basePath of possiblePaths) {
    try {
      const files = await electron.readProjectFiles(basePath, projectRoot);
      if (files && files.length > 0) {
        for (const item of files) {
          if (item.type === 'folder') {
            // Read SKILL.md to extract description
            const skillMdPath = `${basePath}/${item.name}/SKILL.md`;
            const res = await electron.readFileRange(skillMdPath, 1, 50, projectRoot);
            let description = 'No description available.';
            if (res && res.success) {
              const content = res.content;
              const match = content.match(/description:\s*(.+)/i);
              if (match && match[1]) {
                description = match[1].trim().replace(/^['"]|['"]$/g, '');
              }
            }
            skills.push({ name: item.name, description });
          }
        }
        break; // Found skills in one of the locations, stop looking
      }
    } catch (e) {
      // ignore
    }
  }

  return skills;
}

export function buildSkillsBlock(skills: AgentSkill[]): string {
  if (skills.length === 0) return '';
  let block = '<skills>\n';
  block += 'You have access to specialized "skills" to help you with tasks. Each skill has a name and description.\n';
  block += 'CRITICAL INSTRUCTION: You MUST use the `readSkill` tool to read the full markdown instructions for a skill BEFORE you apply it or write any code based on it! The descriptions below are just summaries. You cannot apply a skill without reading it first.\n\n';
  block += 'Available skills:\n';
  for (const skill of skills) {
    block += `- ${skill.name}: ${skill.description}\n`;
  }
  block += '</skills>';
  return block;
}
