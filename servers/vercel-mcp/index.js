const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const os = require('os');
const getAppDataPath = () => {
  const appName = 'Quantix Code';
  let baseDir;
  if (process.platform === 'win32') {
    baseDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (process.platform === 'darwin') {
    baseDir = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    baseDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }
  const appDir = path.join(baseDir, appName);
  return appDir;
};
const tokenFile = path.join(getAppDataPath(), 'vercel-token.json');

let vercelToken = '';
try {
  if (fs.existsSync(tokenFile)) {
    vercelToken = JSON.parse(fs.readFileSync(tokenFile, 'utf8')).token;
  }
} catch (e) {
  console.error('Failed to read token file');
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/auth/status', (req, res) => {
  res.json({ connected: !!vercelToken });
});

app.get('/auth/url', (req, res) => {
  res.json({ url: 'http://localhost:3006/auth/connect' });
});

app.get('/auth/connect', (req, res) => {
  if (vercelToken) {
    return res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #000; color: #fff;">
          <svg viewBox="0 0 76 65" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64" style="margin-bottom: 24px;"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="#ffffff"/></svg>
          <h2>Vercel is already connected!</h2>
          <p>You can close this window and return to Quantix.</p>
          <button onclick="fetch('/auth/disconnect', {method: 'POST'}).then(() => window.location.reload())" style="margin-top: 20px; padding: 12px 24px; background: #333; color: #fff; border: 1px solid #555; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;">Disconnect</button>
        </body>
      </html>
    `);
  }
  res.send(`
    <html>
      <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #000; color: #fff;">
        <svg viewBox="0 0 76 65" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64" style="margin-bottom: 24px;"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="#ffffff"/></svg>
        <h2>Connect Vercel to Quantix</h2>
        <p style="color: #aaa; margin-bottom: 24px; max-width: 400px; text-align: center;">Please generate a Personal Access Token from your Vercel account settings and paste it below. <br/><br/><a href="https://vercel.com/account/tokens" target="_blank" style="color: #4b93ff; text-decoration: none;">Click here to generate a token</a></p>
        <input type="password" id="tokenInput" placeholder="Vercel Access Token" style="padding: 12px; width: 300px; border-radius: 6px; border: 1px solid #333; background: #111; color: #fff; margin-bottom: 16px;" />
        <button onclick="connect()" style="padding: 12px 24px; background: #fff; color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 16px;">Connect Account</button>
        <script>
          function connect() {
            const token = document.getElementById('tokenInput').value.trim();
            if (!token) return alert('Please enter a token');
            
            fetch('/auth/callback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
              .then(() => {
                document.body.innerHTML = '<svg viewBox="0 0 76 65" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64" style="margin-bottom: 24px;"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="#ffffff"/></svg><h2 style="margin-top:20px;">Successfully Connected!</h2><p>You can safely close this window.</p>';
              });
          }
        </script>
      </body>
    </html>
  `);
});

app.post('/auth/callback', (req, res) => {
  const { token } = req.body;
  if (token) {
    vercelToken = token;
    fs.writeFileSync(tokenFile, JSON.stringify({ token }));
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Missing token' });
  }
});

app.post('/auth/disconnect', (req, res) => {
  vercelToken = '';
  if (fs.existsSync(tokenFile)) fs.unlinkSync(tokenFile);
  res.json({ success: true });
});

const PORT = 3006;
app.listen(PORT, () => {
  console.error(`Vercel Auth server running on http://localhost:${PORT}`);
});

const server = new Server({
  name: "vercel-mcp",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      { name: 'vercel_list_projects', description: 'List your real Vercel projects.', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'vercel_get_deployments', description: 'Get real deployments for a project.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] } },
      { name: 'vercel_get_env', description: 'List environment variables for a project.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] } },
      { name: 'vercel_create_env', description: 'Create an environment variable for a project.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, key: { type: 'string' }, value: { type: 'string' }, target: { type: 'array', items: { type: 'string' }, description: 'e.g. ["production", "preview", "development"]' } }, required: ['projectId', 'key', 'value'] } },
      { name: 'vercel_get_deployment', description: 'Get detailed info about a specific deployment (including preview URL).', inputSchema: { type: 'object', properties: { deploymentId: { type: 'string' } }, required: ['deploymentId'] } },
      { name: 'vercel_create_project', description: 'Create a new Vercel project and optionally link it to a GitHub repo for automatic CI/CD deployments.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, framework: { type: 'string', description: 'e.g. "nextjs", "vite", "create-react-app"' }, githubRepo: { type: 'string', description: 'e.g. "username/repo" to enable automatic deployments on git push' } }, required: ['name'] } },
      { name: 'vercel_trigger_github_deployment', description: 'Trigger a manual Vercel deployment for a project linked to GitHub.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Project name' } }, required: ['name'] } }
    ]
  };
});

async function vercelFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `https://api.vercel.com${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${vercelToken}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vercel API error (${response.status}): ${errorText}`);
  }
  return response.json();
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!vercelToken) {
    return { content: [{ type: 'text', text: 'Error: Vercel is not connected. Please connect from the app.' }], isError: true };
  }

  const name = request.params.name;
  try {
    let data;
    if (name === 'vercel_list_projects') {
      const res = await vercelFetch('/v9/projects');
      data = { projects: res.projects.map(p => ({ id: p.id, name: p.name, framework: p.framework })) };
    } else if (name === 'vercel_get_deployments') {
      const projectId = request.params.arguments.projectId;
      if (!projectId) throw new Error('Missing projectId');
      
      const res = await vercelFetch(`/v6/deployments?projectId=${projectId}`);
      data = { deployments: res.deployments.map(d => ({ id: d.uid, url: d.url, state: d.state, created: d.created })) };
    } else if (name === 'vercel_get_env') {
      const projectId = request.params.arguments.projectId;
      if (!projectId) throw new Error('Missing projectId');
      const res = await vercelFetch(`/v9/projects/${projectId}/env`);
      data = res;
    } else if (name === 'vercel_create_env') {
      const { projectId, key, value, target } = request.params.arguments;
      if (!projectId || !key || !value) throw new Error('Missing required arguments');
      const res = await vercelFetch(`/v10/projects/${projectId}/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, target: target || ['production', 'preview', 'development'], type: 'encrypted' })
      });
      data = res;
    } else if (name === 'vercel_get_deployment') {
      const deploymentId = request.params.arguments.deploymentId;
      if (!deploymentId) throw new Error('Missing deploymentId');
      const res = await vercelFetch(`/v13/deployments/${deploymentId}`);
      data = { id: res.id, url: res.url, name: res.name, state: res.readyState, createdAt: res.createdAt };
    } else if (name === 'vercel_create_project') {
      const { name: projectName, framework, githubRepo } = request.params.arguments;
      if (!projectName) throw new Error('Missing project name');
      const payload = { name: projectName };
      if (framework) payload.framework = framework;
      if (githubRepo) {
        payload.gitRepository = { type: 'github', repo: githubRepo };
      }
      const res = await vercelFetch(`/v10/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      data = { id: res.id, name: res.name, accountId: res.accountId };
    } else if (name === 'vercel_trigger_github_deployment') {
      const { name: projectName } = request.params.arguments;
      if (!projectName) throw new Error('Missing project name');
      const res = await vercelFetch(`/v13/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName, target: 'production' })
      });
      data = { id: res.id, url: res.url, state: res.readyState };
    } else {
      throw new Error('Tool not found');
    }
    
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Vercel MCP Server running on stdio');
}

run().catch(console.error);

process.stdin.on('close', () => {
  console.error('Vercel MCP Server stdin closed. Exiting.');
  process.exit(0);
});
