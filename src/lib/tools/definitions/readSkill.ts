import { ToolDefinition, ToolHandler } from '../types';

export const definition: ToolDefinition = {
  name: 'readSkill',
  description: 'Read the documentation and instructions for a specific agent skill. Use this to learn how to apply a skill that is available in your context.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      skillName: { type: 'string', description: 'The exact name of the skill to read, e.g., "accessibility-inclusive-design"' }
    },
    required: ['skillName']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 10000,
  icon: 'Book'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { skillName } = args;
    if (!skillName) {
      return { success: false, output: 'Missing required argument: skillName' };
    }

    const projectRoot = context.projectRoot || '';
    
    const possiblePaths: string[] = [];
    
    const electron = (window as any).electron;

    try {
      if (electron.getUserDataPath) {
        const userDataPath = await electron.getUserDataPath();
        possiblePaths.push(`${userDataPath}/skills/.agents/skills/${skillName}`);
        possiblePaths.push(`${userDataPath}/.agents/skills/${skillName}`);
      }
    } catch(e) {
      // ignore
    }

    // Fallback for dev mode
    possiblePaths.push(`C:/Codes/agentic/skills/.agents/skills/${skillName}`);
    possiblePaths.push(`C:/Codes/agentic/.agents/skills/${skillName}`);

    let targetDir = '';
    let skillMdPath = '';
    let hasSkill = false;
    
    for (const p of possiblePaths) {
      const pFiles = await electron.readProjectFiles(p, projectRoot);
      if (pFiles && pFiles.length > 0) {
        targetDir = p;
        hasSkill = true;
        // check if SKILL.md is inside
        const skillMd = pFiles.find((f: any) => f.name === 'SKILL.md');
        if (skillMd) {
          skillMdPath = skillMd.path;
        }
        break;
      }
    }

    if (!hasSkill) {
      return { success: false, output: `Skill '${skillName}' not found in standard agent locations.` };
    }

    if (!skillMdPath) {
      return { success: false, output: `Skill '${skillName}' found but missing SKILL.md documentation.` };
    }

    // Read the main SKILL.md
    const rangeRes = await electron.readFileRange(skillMdPath, 1, 9999, projectRoot);
    if (!rangeRes?.success) {
      return { success: false, output: `Failed to read SKILL.md: ${rangeRes?.error || 'Unknown error'}` };
    }
    let content = `> **SYSTEM NOTE: This skill's files are located at: ${targetDir}**\n\n` + rangeRes.content;

    // Load references if exist
    const refsDir = `${targetDir}/references`;
    const refsFiles = await electron.readProjectFiles(refsDir, projectRoot);
    
    if (refsFiles && refsFiles.length > 0) {
      content += '\n\n--- Additional References ---\n';
      for (const ref of refsFiles) {
        if (ref.type === 'file' && ref.name.endsWith('.md')) {
          const refRes = await electron.readFileRange(ref.path, 1, 9999, projectRoot);
          if (refRes?.success) {
            content += `\n### [Reference] ${ref.name}\n`;
            content += refRes.content + '\n';
          }
        }
      }
    }

    return { success: true, output: content };
  } catch (error: any) {
    return { success: false, output: `Failed to read skill: ${error?.message || String(error)}` };
  }
};
