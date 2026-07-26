import fs from 'fs';
import path from 'path';

const files = fs.readdirSync('./src/lib/tools/definitions').filter(f => f.endsWith('.ts'));
let out = '# Available Tools\n\n';
files.forEach(f => {
  const content = fs.readFileSync(path.join('./src/lib/tools/definitions', f), 'utf-8');
  const nameMatch = content.match(/name:\s*'([^']+)'/);
  const descMatch = content.match(/description:\s*'([^']+)'/);
  
  if (nameMatch) {
    out += `### \`${nameMatch[1]}\`\n`;
    if (descMatch) {
      out += `**Description**: ${descMatch[1]}\n\n`;
    }
    
    let exampleArgs = '{}';
    const paramMatch = content.match(/properties:\s*(\{[\s\S]*?\}),?\s*(?:required:|requiresApproval:)/);
    if (paramMatch) {
      const propsMatch = paramMatch[1].match(/(\w+):\s*\{/g);
      if (propsMatch) {
        const keys = propsMatch.map(p => p.split(':')[0].trim());
        if (keys.length > 0) {
          exampleArgs = `{"${keys[0]}": "value"}`;
        }
      }
    }
    out += `**Usage Example**:\n\`\`\`\ncall:${nameMatch[1]}${exampleArgs}\n\`\`\`\n\n`;
  }
});
fs.writeFileSync('./tools_list.md', out);
