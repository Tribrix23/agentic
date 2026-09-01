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
  block += 'You have access to the following specialized agent skills installed by the user.\n\n';
  block += '## MANDATORY RULES FOR SKILLS — YOU MUST FOLLOW THESE WITHOUT EXCEPTION:\n';
  block += '1. **NEVER answer questions about a skill from memory or training knowledge.** Skills contain custom user-defined instructions that you do NOT know in advance.\n';
  block += '2. **ALWAYS call the `readSkill` tool FIRST** before you:\n';
  block += '   - Describe what a skill does\n';
  block += '   - Apply a skill to a task\n';
  block += '   - Answer any question about a skill\'s contents\n';
  block += '   - List what a skill covers\n';
  block += '3. If a user asks "what does skill X do?" or "do you have skill X?" — you MUST call `readSkill("X")` immediately. Do NOT answer from your own knowledge.\n';
  block += '4. The descriptions below are ONLY for discovery — they tell you a skill exists, NOT what it contains. The real instructions are in the SKILL.md file.\n\n';
  block += 'Available skills (call readSkill to read their actual contents):\n';
  for (const skill of skills) {
    block += `- ${skill.name}: ${skill.description}\n`;
  }
  block += '</skills>';
  return block;
}
