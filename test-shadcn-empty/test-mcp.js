const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');
const process = require('process');

async function testShadcn() {
  const transport = new StdioClientTransport({
    command: 'node.exe',
    args: [path.join('..', 'agentic-mcp-server', 'node_modules', 'shadcn', 'dist', 'index.js'), 'mcp'],
    env: { ...process.env },
    stderr: 'pipe'
  });
  transport.stderr.on('data', d => console.error('[Shadcn err]', d.toString()));
  const client = new Client({ name: 'test', version: '1.0' });
  try {
    await client.connect(transport);
    console.log('Shadcn connected successfully!');
  } catch (e) {
    console.error('Shadcn error:', e);
  }
}
testShadcn();
