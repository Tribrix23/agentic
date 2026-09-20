const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
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
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  return appDir;
};

const TOKEN_PATH = path.join(getAppDataPath(), 'supabase-token.json');

let supabaseToken = '';
let supabaseRef = '';
let supabaseKey = '';
let supabase = null;

if (fs.existsSync(TOKEN_PATH)) {
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    supabaseToken = data.token;
    supabaseRef = data.ref;
    supabaseKey = data.key;
    if (supabaseRef && supabaseKey) {
      supabase = createClient(`https://${supabaseRef}.supabase.co`, supabaseKey);
    }
  } catch (err) {
    console.error('Failed to parse existing token', err);
  }
}

// ---------------------------------------------------------
// Express Server for Auth Flow
// ---------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));

app.get('/auth/status', (req, res) => {
  const isConnected = !!(supabaseRef && supabaseKey);
  res.json({ connected: isConnected });
});

app.get('/auth/url', (req, res) => {
  res.json({ url: 'http://localhost:3003/auth/connect' });
});

const getHtmlWrapper = (title, innerHtml, showLogo = true) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background-color: #080A0F; font-family: 'Inter', sans-serif; }
    canvas { display: block; width: 100vw; height: 100vh; position: absolute; top: 0; left: 0; z-index: 1; opacity: 0.8; }
    .content-wrapper {
      position: relative;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      color: white;
      text-align: center;
      overflow-y: auto;
    }
    .card {
      background-color: rgba(24, 24, 27, 0.6);
      backdrop-filter: blur(12px);
      padding: 2rem;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      width: 100%;
      max-width: 450px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      text-align: left;
    }
    .logo { width: 64px; height: 64px; margin: 0 auto 24px auto; filter: drop-shadow(0px 4px 12px rgba(62, 207, 142, 0.4)); display: block; }
    h1, h2 { font-weight: 700; margin: 0 0 16px 0; background: linear-gradient(to right, #ffffff, #e2e8f0); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    h1 { font-size: 32px; text-align: center; margin-bottom: 12px; }
    h2 { font-size: 24px; display: flex; align-items: center; gap: 10px; }
    h2 img { width: 32px; height: 32px; border-radius: 8px; }
    p { font-size: 16px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px 0; text-align: center; }
    .form-group { margin-bottom: 1.5rem; }
    label { display: block; margin-bottom: 0.5rem; font-size: 14px; color: #a1a1aa; }
    input[type="password"], input[type="text"] { width: 100%; padding: 0.75rem; background-color: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: white; outline: none; transition: border-color 0.2s; box-sizing: border-box; }
    input:focus { border-color: #3ecf8e; }
    button { width: 100%; padding: 0.75rem; background-color: #3ecf8e; color: black; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; transition: background-color 0.2s; margin-top: 1rem; }
    button:hover { background-color: #35b37a; }
    a { color: #3ecf8e; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .project-option { margin-bottom: 10px; display: flex; align-items: center; gap: 10px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); transition: background 0.2s; }
    .project-option:hover { background: rgba(255,255,255,0.05); }
    .project-option input[type="radio"] { width: auto; accent-color: #3ecf8e; }
    .project-option label { margin: 0; color: white; cursor: pointer; flex: 1; font-size: 15px; }
    .project-option small { color: #888; font-size: 12px; display: block; margin-top: 2px; }
    .custom-scrollbar::-webkit-scrollbar { width: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 3px; }
  </style>
</head>
<body>
  <div class="content-wrapper">
    <div class="${showLogo ? '' : 'card'}">
      ${showLogo ? '<img class="logo" src="http://localhost:5173/supabase.png" alt="Supabase" onerror="this.style.display=\'none\'" />' : ''}
      ${innerHtml}
    </div>
  </div>
  
  <script>
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (gl) {
      const vsSource = \`
        attribute vec2 position;
        varying vec2 vUv;
        void main() {
          vUv = position * 0.5 + 0.5;
          gl_Position = vec4(position, 0.0, 1.0);
        }
      \`;
      
      const fsSource = \`
        precision highp float;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec3 uBaseColor;
        uniform float uAmplitude;
        uniform float uFrequencyX;
        uniform float uFrequencyY;
        uniform vec2 uMouse;
        varying vec2 vUv;
        
        vec4 renderImage(vec2 uvCoord) {
            vec2 fragCoord = uvCoord * uResolution.xy;
            vec2 uv = (2.0 * fragCoord - uResolution.xy) / min(uResolution.x, uResolution.y);
            for (float i = 1.0; i < 10.0; i++){
                uv.x += uAmplitude / i * cos(i * uFrequencyX * uv.y + uTime + uMouse.x * 3.14159);
                uv.y += uAmplitude / i * cos(i * uFrequencyY * uv.x + uTime + uMouse.y * 3.14159);
            }
            vec2 diff = (uvCoord - uMouse);
            float dist = length(diff);
            float falloff = exp(-dist * 20.0);
            float ripple = sin(10.0 * dist - uTime * 2.0) * 0.03;
            uv += (diff / (dist + 0.0001)) * ripple * falloff;
            vec3 color = uBaseColor / abs(sin(uTime - uv.y - uv.x));
            return vec4(color, 1.0);
        }
        
        void main() {
            vec4 col = vec4(0.0);
            int samples = 0;
            for (int i = -1; i <= 1; i++){
                for (int j = -1; j <= 1; j++){
                    vec2 offset = vec2(float(i), float(j)) * (1.0 / min(uResolution.x, uResolution.y));
                    col += renderImage(vUv + offset);
                    samples++;
                }
            }
            gl_FragColor = col / float(samples);
        }
      \`;
      
      function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
      }
      
      const program = gl.createProgram();
      gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vsSource));
      gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fsSource));
      gl.linkProgram(program);
      gl.useProgram(program);
      
      const vertices = new Float32Array([
        -1.0, -1.0,
         3.0, -1.0,
        -1.0,  3.0
      ]);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      
      const positionLocation = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      
      const uTime = gl.getUniformLocation(program, 'uTime');
      const uRes = gl.getUniformLocation(program, 'uResolution');
      const uColor = gl.getUniformLocation(program, 'uBaseColor');
      const uAmp = gl.getUniformLocation(program, 'uAmplitude');
      const uFreqX = gl.getUniformLocation(program, 'uFrequencyX');
      const uFreqY = gl.getUniformLocation(program, 'uFrequencyY');
      const uMouse = gl.getUniformLocation(program, 'uMouse');
      
      gl.uniform3f(uColor, 0.015, 0.05, 0.025);
      gl.uniform1f(uAmp, 0.3);
      gl.uniform1f(uFreqX, 3.0);
      gl.uniform1f(uFreqY, 3.0);
      
      let mouse = { x: 0.5, y: 0.5 };
      let targetMouse = { x: 0.5, y: 0.5 };
      
      
      
      function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uRes, canvas.width, canvas.height);
      }
      window.addEventListener('resize', resize);
      resize();
      
      let startTime = performance.now();
      function render() {
        const time = (performance.now() - startTime) * 0.001;
        mouse.x += (targetMouse.x - mouse.x) * 0.05;
        mouse.y += (targetMouse.y - mouse.y) * 0.05;
        
        gl.uniform1f(uTime, time);
        gl.uniform2f(uMouse, mouse.x, mouse.y);
        
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        requestAnimationFrame(render);
      }
      render();
    }
  </script>
</body>
</html>
`;

app.get('/auth/connect', (req, res) => {
  // If we already have a token, we can go straight to project selection!
  if (supabaseToken) {
    return res.redirect('/auth/projects?token=' + encodeURIComponent(supabaseToken));
  }

  res.send(getHtmlWrapper('Connect Supabase - Quantix', `
    <h2><img src="http://localhost:5173/supabase.png" onerror="this.style.display='none'" /> Connect Supabase</h2>
    <form method="POST" action="/auth/projects">
      <div class="form-group">
        <label>Personal Access Token <br><small>(<a href="https://supabase.com/dashboard/account/tokens" target="_blank" style="color: #3ecf8e;">Generate here</a>)</small></label>
        <input type="password" name="token" placeholder="sbp_..." required />
      </div>
      <button type="submit">Fetch Projects</button>
    </form>
  `, false));
});

app.get('/auth/projects', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.redirect('/auth/connect');
  return renderProjects(token, res);
});

app.post('/auth/projects', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send('Token required');
  return renderProjects(token, res);
});

app.get('/auth/clear-token', (req, res) => {
  supabaseToken = '';
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
  res.redirect('/auth/connect');
});

async function renderProjects(token, res) {
  try {
    const response = await fetch('https://api.supabase.com/v1/projects', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      // Token expired or invalid, clear it and redirect to connect
      supabaseToken = '';
      if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
      return res.redirect('/auth/connect');
    }
    
    const projects = await response.json();
    
    let projectOptions = projects.map(p => `
      <div class="project-option">
        <input type="radio" id="${p.id}" name="ref" value="${p.id}" required />
        <label for="${p.id}">${p.name} <br><small>${p.id}</small></label>
      </div>
    `).join('');

    res.send(getHtmlWrapper('Select Project - Quantix', `
      <h2 style="margin-top: 0;">Select a Project</h2>
      <form method="POST" action="/auth/save">
        <input type="hidden" name="token" value="${token}" />
        <div style="max-height: 350px; overflow-y: auto; padding-right: 5px; margin-bottom: 15px;" class="custom-scrollbar">
          ${projectOptions}
        </div>
        <button type="submit">Connect Selected Project</button>
        <div style="margin-top: 16px; text-align: center;">
          <a href="/auth/clear-token" style="font-size: 13px; color: #a1a1aa; text-decoration: underline;">Use a different token</a>
        </div>
      </form>
    `, false));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
}

app.post('/auth/save', async (req, res) => {
  const { token, ref } = req.body;
  if (!token || !ref) return res.status(400).send('Invalid input');

  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to fetch API keys');
    const keys = await response.json();
    const serviceRoleKey = keys.find(k => k.name === 'service_role')?.api_key;
    
    if (!serviceRoleKey) throw new Error('Service role key not found');

    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ token, ref, key: serviceRoleKey }));
    
    supabaseToken = token;
    supabaseRef = ref;
    supabaseKey = serviceRoleKey;
    supabase = createClient(`https://${ref}.supabase.co`, serviceRoleKey);
    
    res.send(getHtmlWrapper('Successfully connected to Supabase!', `
      <h1>Supabase Connected</h1>
      <p>Authentication complete. You can safely close this browser tab and return to the app.</p>
    `, true));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

app.post('/auth/disconnect', (req, res) => {
  supabaseRef = '';
  supabaseKey = '';
  supabase = null;
  if (supabaseToken) {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ token: supabaseToken }));
  } else if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
  res.json({ success: true });
});

app.listen(3003, '127.0.0.1', () => {
  console.error('Supabase Auth Server running on port 3003');
});


// ---------------------------------------------------------
// MCP Server Setup
// ---------------------------------------------------------
const server = new Server({
  name: 'supabase-mcp-server',
  version: '1.0.0',
}, {
  capabilities: { tools: {} },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'execute_query',
        description: 'Execute a data SQL query against the Supabase database. Useful for select, insert, update, delete.',
        inputSchema: {
          type: 'object',
          properties: {
            table: { type: 'string' },
            action: { type: 'string', description: 'select, insert, update, delete' },
            queryObj: { type: 'string', description: 'JSON string of query parameters (e.g. filters)' }
          },
          required: ['table', 'action']
        }
      },
      {
        name: 'execute_sql',
        description: 'Execute arbitrary raw SQL against the Supabase Postgres database. Useful for DDL (CREATE TABLE, ALTER TABLE) or raw SQL queries.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The SQL query string to execute' }
          },
          required: ['query']
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!supabaseRef || !supabaseKey || !supabaseToken) {
    return { content: [{ type: 'text', text: 'Error: Supabase is not connected. Please connect from the app.' }], isError: true };
  }

  if (request.params.name === 'execute_query') {
    const { table, action, queryObj } = request.params.arguments;
    try {
      let result;
      let query = supabase.from(table);
      const args = queryObj ? JSON.parse(queryObj) : {};
      
      if (action === 'select') {
        result = await query.select(args.columns || '*').match(args.match || {});
      } else if (action === 'insert') {
        result = await query.insert(args.data);
      } else if (action === 'update') {
        result = await query.update(args.data).match(args.match || {});
      } else if (action === 'delete') {
        result = await query.delete().match(args.match || {});
      }
      
      if (result.error) throw result.error;
      return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  }

  if (request.params.name === 'execute_sql') {
    const { query } = request.params.arguments;
    try {
      const response = await fetch(`https://api.supabase.com/v1/projects/${supabaseRef}/database/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText);
      }
      
      const data = await response.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error executing SQL: ${error.message}` }], isError: true };
    }
  }

  throw new Error('Tool not found');
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Supabase MCP Server running on stdio');
}

run().catch(console.error);

process.stdin.on('close', () => {
  console.error('Supabase MCP Server stdin closed. Exiting.');
  process.exit(0);
});
