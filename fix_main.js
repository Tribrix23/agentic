const fs = require('fs');
let text = fs.readFileSync('c:/Codes/agentic/src/main.ts', 'utf8');

const gdriveCode = 
    if (!mcpClientManager.getServer('gdrive')) {
      const isPackaged = app.isPackaged;
      const gdriveServerPath = isPackaged
        ? path.join(process.resourcesPath, 'servers', 'gdrive-mcp', 'index.js')
        : path.join(__dirname, '..', '..', 'servers', 'gdrive-mcp', 'index.js');
  
      mcpClientManager.addServer({
        id: 'gdrive',
        name: 'Google Drive',
        transport: {
          type: 'stdio',
          command: process.execPath,
          args: [gdriveServerPath],
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
        },
        permissions: ['read', 'write', 'execute', 'network'],
        autoConnect: true,
      });
      void mcpClientManager.connectServer('gdrive').catch(error => console.error('[MCP] GDrive failed to connect:', error));
    }
;

if (!text.includes("gdriveServerPath")) {
  text = text.replace("if (!mcpClientManager.getServer('gmail')) {", gdriveCode + "\n    if (!mcpClientManager.getServer('gmail')) {");
  fs.writeFileSync('c:/Codes/agentic/src/main.ts', text, 'utf8');
  console.log("Success");
} else {
  console.log("Already there");
}
