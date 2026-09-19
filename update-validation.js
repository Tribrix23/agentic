const fs = require('fs');
let code = fs.readFileSync('src/lib/tools/validation.ts', 'utf8');

const target = `          if (type === 'boolean') {
            if (trimmed.toLowerCase() === 'true') { normalized[name] = true; continue; }
            if (trimmed.toLowerCase() === 'false') { normalized[name] = false; continue; }
          }`;

const replacement = `          if (type === 'boolean') {
            const lower = trimmed.toLowerCase();
            if (lower === 'true' || lower === '1' || lower === 'yes') { normalized[name] = true; continue; }
            if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'null' || lower === 'none' || lower === '') { normalized[name] = false; continue; }
            if (!required.has(name)) {
              delete normalized[name];
              continue;
            }
            normalized[name] = false;
            continue;
          }`;

code = code.replace(target, replacement);
fs.writeFileSync('src/lib/tools/validation.ts', code);
