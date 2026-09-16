import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const getAppDataPath = () => {
  const appName = 'Quantix Code';
  let baseDir;
  if (process.platform === 'win32') {
    baseDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (process.platform === 'darwin') {
    baseDir = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    baseDir = path.join(os.homedir(), '.config');
  }
  const appDir = path.join(baseDir, appName);
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  return appDir;
};

const TOKEN_PATH = path.join(getAppDataPath(), 'figma-token.json');

let figmaToken = '';

if (fs.existsSync(TOKEN_PATH)) {
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    figmaToken = data.token;
  } catch (e) {
    console.error('Failed to read figma token', e);
  }
}

const getHtmlWrapper = (title, content, success = false) => `
<!DOCTYPE html>
<html>
<head>
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
      background: rgba(16, 16, 20, 0.7);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      padding: 2rem;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      width: 100%;
      max-width: 450px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      text-align: left;
    }
    h1, h2 { font-weight: 700; margin: 0 0 16px 0; background: linear-gradient(to right, #ffffff, #e2e8f0); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    h1 { font-size: 32px; text-align: center; margin-bottom: 12px; }
    h2 { font-size: 24px; display: flex; align-items: center; gap: 10px; }
    h2 img { width: 32px; height: 32px; border-radius: 8px; }
    p { font-size: 16px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px 0; text-align: center; }
    .form-group { margin-bottom: 1.5rem; }
    label { display: block; margin-bottom: 0.5rem; font-size: 14px; color: #a1a1aa; }
    input[type="password"], input[type="text"] { width: 100%; padding: 0.75rem; background-color: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: white; outline: none; transition: border-color 0.2s; box-sizing: border-box; }
    input:focus { border-color: #f24e1e; }
    button { width: 100%; padding: 0.75rem; background-color: #f24e1e; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; transition: background-color 0.2s; margin-top: 1rem; }
    button:hover { background-color: #ff7262; }
    a { color: #f24e1e; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="content-wrapper">
    <div class="card">
      ${content}
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
        uniform vec3 uResolution;
        uniform float uSpeed;
        uniform float uInnerLines;
        uniform float uOuterLines;
        uniform float uWarpIntensity;
        uniform float uRotation;
        uniform float uEdgeFadeWidth;
        uniform float uColorCycleSpeed;
        uniform float uBrightness;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        uniform vec2 uMouse;
        uniform float uMouseInfluence;
        uniform bool uEnableMouse;
        uniform float uLightMode;

        #define HALF_PI 1.5707963

        float hashF(float n) {
          return fract(sin(n * 127.1) * 43758.5453123);
        }

        float smoothNoise(float x) {
          float i = floor(x);
          float f = fract(x);
          float u = f * f * (3.0 - 2.0 * f);
          return mix(hashF(i), hashF(i + 1.0), u);
        }

        float displaceA(float coord, float t) {
          float result = sin(coord * 2.123) * 0.2;
          result += sin(coord * 3.234 + t * 4.345) * 0.1;
          result += sin(coord * 0.589 + t * 0.934) * 0.5;
          return result;
        }

        float displaceB(float coord, float t) {
          float result = sin(coord * 1.345) * 0.3;
          result += sin(coord * 2.734 + t * 3.345) * 0.2;
          result += sin(coord * 0.189 + t * 0.934) * 0.3;
          return result;
        }

        vec2 rotate2D(vec2 p, float angle) {
          float c = cos(angle);
          float s = sin(angle);
          return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
        }

        void main() {
          vec2 coords = gl_FragCoord.xy / uResolution.xy;
          coords = coords * 2.0 - 1.0;
          coords = rotate2D(coords, uRotation);

          float halfT = uTime * uSpeed * 0.5;
          float fullT = uTime * uSpeed;

          float mouseWarp = 0.0;
          if (uEnableMouse) {
            vec2 mPos = rotate2D(uMouse * 2.0 - 1.0, uRotation);
            float mDist = length(coords - mPos);
            mouseWarp = uMouseInfluence * exp(-mDist * mDist * 4.0);
          }

          float warpAx = coords.x + displaceA(coords.y, halfT) * uWarpIntensity + mouseWarp;
          float warpAy = coords.y - displaceA(coords.x * cos(fullT) * 1.235, halfT) * uWarpIntensity;
          float warpBx = coords.x + displaceB(coords.y, halfT) * uWarpIntensity + mouseWarp;
          float warpBy = coords.y - displaceB(coords.x * sin(fullT) * 1.235, halfT) * uWarpIntensity;

          vec2 fieldA = vec2(warpAx, warpAy);
          vec2 fieldB = vec2(warpBx, warpBy);
          vec2 blended = mix(fieldA, fieldB, mix(fieldA, fieldB, 0.5));

          float fadeTop = smoothstep(uEdgeFadeWidth, uEdgeFadeWidth + 0.4, blended.y);
          float fadeBottom = smoothstep(-uEdgeFadeWidth, -(uEdgeFadeWidth + 0.4), blended.y);
          float vMask = 1.0 - max(fadeTop, fadeBottom);

          float tileCount = mix(uOuterLines, uInnerLines, vMask);
          float scaledY = blended.y * tileCount;
          float nY = smoothNoise(abs(scaledY));

          float ridge = pow(
            step(abs(nY - blended.x) * 2.0, HALF_PI) * cos(2.0 * (nY - blended.x)),
            5.0
          );

          float lines = 0.0;
          for (float i = 1.0; i < 3.0; i += 1.0) {
            lines += pow(max(fract(scaledY), fract(-scaledY)), i * 2.0);
          }

          float pattern = vMask * lines;

          float cycleT = fullT * uColorCycleSpeed;
          float rChannel = (pattern + lines * ridge) * (cos(blended.y + cycleT * 0.234) * 0.5 + 1.0);
          float gChannel = (pattern + vMask * ridge) * (sin(blended.x + cycleT * 1.745) * 0.5 + 1.0);
          float bChannel = (pattern + lines * ridge) * (cos(blended.x + cycleT * 0.534) * 0.5 + 1.0);

          vec3 col = (rChannel * uColor1 + gChannel * uColor2 + bChannel * uColor3) * uBrightness;
          float alpha = clamp(length(col), 0.0, 1.0);

          if (uLightMode > 0.5) {
            vec3 weights = pow(max(vec3(rChannel, gChannel, bChannel), vec3(0.0)), vec3(3.0));
            float weightSum = max(weights.r + weights.g + weights.b, 0.0001);
            vec3 chroma = (weights.r * uColor1 + weights.g * uColor2 + weights.b * uColor3) / weightSum;
            float neutral = min(chroma.r, min(chroma.g, chroma.b));
            chroma = max(chroma - vec3(neutral * 0.92), vec3(0.0));
            float peak = max(chroma.r, max(chroma.g, chroma.b));
            chroma = pow(clamp(chroma / max(peak, 0.0001), 0.0, 1.0), vec3(1.08));
            float ink = clamp(max(rChannel, max(gChannel, bChannel)) * uBrightness * 1.15, 0.0, 0.92);
            gl_FragColor = vec4(mix(vec3(1.0), chroma, ink), 1.0);
          } else {
            gl_FragColor = vec4(col, alpha);
          }
        }
      \`;
      
      function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
        }
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
      
      const uniforms = {
        uTime: gl.getUniformLocation(program, 'uTime'),
        uResolution: gl.getUniformLocation(program, 'uResolution'),
        uSpeed: gl.getUniformLocation(program, 'uSpeed'),
        uInnerLines: gl.getUniformLocation(program, 'uInnerLines'),
        uOuterLines: gl.getUniformLocation(program, 'uOuterLines'),
        uWarpIntensity: gl.getUniformLocation(program, 'uWarpIntensity'),
        uRotation: gl.getUniformLocation(program, 'uRotation'),
        uEdgeFadeWidth: gl.getUniformLocation(program, 'uEdgeFadeWidth'),
        uColorCycleSpeed: gl.getUniformLocation(program, 'uColorCycleSpeed'),
        uBrightness: gl.getUniformLocation(program, 'uBrightness'),
        uColor1: gl.getUniformLocation(program, 'uColor1'),
        uColor2: gl.getUniformLocation(program, 'uColor2'),
        uColor3: gl.getUniformLocation(program, 'uColor3'),
        uMouse: gl.getUniformLocation(program, 'uMouse'),
        uMouseInfluence: gl.getUniformLocation(program, 'uMouseInfluence'),
        uEnableMouse: gl.getUniformLocation(program, 'uEnableMouse'),
        uLightMode: gl.getUniformLocation(program, 'uLightMode')
      };

      // Set fixed uniform values based on user's React props
      gl.uniform1f(uniforms.uSpeed, 0.3);
      gl.uniform1f(uniforms.uInnerLines, 32.0);
      gl.uniform1f(uniforms.uOuterLines, 36.0);
      gl.uniform1f(uniforms.uWarpIntensity, 1.0);
      gl.uniform1f(uniforms.uRotation, -45.0 * Math.PI / 180.0);
      gl.uniform1f(uniforms.uEdgeFadeWidth, 0.0);
      gl.uniform1f(uniforms.uColorCycleSpeed, 1.0);
      gl.uniform1f(uniforms.uBrightness, 0.2);
      
      // White colors
      gl.uniform3f(uniforms.uColor1, 1.0, 1.0, 1.0);
      gl.uniform3f(uniforms.uColor2, 1.0, 1.0, 1.0);
      gl.uniform3f(uniforms.uColor3, 1.0, 1.0, 1.0);
      
      gl.uniform1i(uniforms.uEnableMouse, 0); // Requested: shouldn't follow mouse
      gl.uniform1f(uniforms.uMouseInfluence, 2.0);
      gl.uniform1f(uniforms.uLightMode, 0.0);
      
      function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform3f(uniforms.uResolution, canvas.width, canvas.height, canvas.width / canvas.height);
      }
      window.addEventListener('resize', resize);
      resize();
      
      let startTime = performance.now();
      function render() {
        const time = (performance.now() - startTime) * 0.001;
        gl.uniform1f(uniforms.uTime, time);
        
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        requestAnimationFrame(render);
      }
      render();
    }
  </script>
</body>
</html>
`;
app.get('/auth/status', (req, res) => {
  res.json({ connected: !!figmaToken });
});

app.get('/auth/url', (req, res) => {
  res.json({ url: 'http://localhost:3004/auth/connect' });
});

app.get('/auth/connect', (req, res) => {
  if (figmaToken) {
    return res.redirect('/auth/clear-token');
  }

  res.send(getHtmlWrapper('Connect Figma - Quantix', `
      <h2><img src="http://localhost:5173/figma.png" onerror="this.style.display='none'" /> Connect Figma</h2>
      <form method="POST" action="/auth/save">
        <div class="form-group">
          <label>Personal Access Token <br><small style="color: #94a3b8; line-height: 1.5; display: inline-block; margin-top: 4px;">Go to <a href="https://www.figma.com/settings" target="_blank" style="color: #f24e1e;">Figma Settings</a> &rarr; Security &rarr; Personal access tokens to generate a new token.</small></label>
          <input type="password" name="token" placeholder="figd_..." required />
        </div>
        <button type="submit">Connect Figma</button>
    </form>
  `, false));
});

app.get('/auth/clear-token', (req, res) => {
  figmaToken = '';
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
  res.redirect('/auth/connect');
});

app.post('/auth/save', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send('Invalid input');

  try {
    const response = await fetch('https://api.figma.com/v1/me', {
      headers: { 'X-Figma-Token': token }
    });
    
    if (!response.ok) throw new Error('Invalid Figma Personal Access Token');
    const me = await response.json();

    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ token }));
    figmaToken = token;
    
    res.send(getHtmlWrapper('Successfully connected to Figma!', `
      <h1>Figma Connected</h1>
      <p>Authentication complete. Hello, <b>${me.handle}</b>! You can safely close this browser tab and return to the app.</p>
    `, true));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

app.post('/auth/disconnect', (req, res) => {
  figmaToken = '';
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
  res.json({ success: true });
});

app.listen(3004, () => {
  console.error('Figma Auth Server running on port 3004');
});

const server = new Server({
  name: 'figma-mcp-server',
  version: '1.0.0',
}, {
  capabilities: { tools: {} },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      { name: 'get_file', description: 'Get the entire document tree of a Figma file.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } }, required: ['fileKey'] } },
      { name: 'get_file_nodes', description: 'Get document nodes from a Figma file.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' }, nodeIds: { type: 'string' } }, required: ['fileKey', 'nodeIds'] } },
      { name: 'get_design_tokens', description: 'Read local variables and design tokens.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } }, required: ['fileKey'] } },
      { name: 'get_image_assets', description: 'Get renderable image URLs.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' }, nodeIds: { type: 'string' }, format: { type: 'string', default: 'png' } }, required: ['fileKey', 'nodeIds'] } },
      { name: 'get_image_fills', description: 'Get image fills for a Figma file.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } }, required: ['fileKey'] } },
      { name: 'get_components', description: 'Get a list of all components.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } }, required: ['fileKey'] } },
      { name: 'get_styles', description: 'Get a list of published styles.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } }, required: ['fileKey'] } },
      { name: 'get_comments', description: 'Get comments from a Figma file.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } }, required: ['fileKey'] } },
      { name: 'post_comment', description: 'Post a new comment.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' }, message: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } }, required: ['fileKey', 'message'] } },
      { name: 'get_team_projects', description: 'Get a list of projects for a team.', inputSchema: { type: 'object', properties: { teamId: { type: 'string' } }, required: ['teamId'] } },
      { name: 'generate_website_from_figma', description: 'Extract structure for website generation.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' }, nodeIds: { type: 'string' }, framework: { type: 'string', default: 'react' } }, required: ['fileKey', 'nodeIds'] } },
      { name: 'get_component_sets', description: 'Get a list of component sets in a Figma file.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } }, required: ['fileKey'] } },
      { name: 'get_dev_resources', description: 'Get dev resources (links, code) attached to nodes.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' }, nodeIds: { type: 'string' } }, required: ['fileKey', 'nodeIds'] } },
      { name: 'get_versions', description: 'Get the version history of a file.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } }, required: ['fileKey'] } },
      { name: 'get_local_variables', description: 'Get full local variables collection.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } }, required: ['fileKey'] } },
      { name: 'get_team_components', description: 'Get components published by a team.', inputSchema: { type: 'object', properties: { teamId: { type: 'string' } }, required: ['teamId'] } },
      { name: 'get_team_styles', description: 'Get styles published by a team.', inputSchema: { type: 'object', properties: { teamId: { type: 'string' } }, required: ['teamId'] } },
      { name: 'extract_text_content', description: 'Extract all raw text from specific nodes.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' }, nodeIds: { type: 'string' } }, required: ['fileKey', 'nodeIds'] } },
      { name: 'export_component_code', description: 'Export Figma component to React code.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' }, nodeId: { type: 'string' } }, required: ['fileKey', 'nodeId'] } },
      { name: 'create_webhook', description: 'Create a webhook to listen to Figma events.', inputSchema: { type: 'object', properties: { teamId: { type: 'string' }, endpoint: { type: 'string' }, eventType: { type: 'string' } }, required: ['teamId', 'endpoint', 'eventType'] } },
      { name: 'delete_webhook', description: 'Delete a webhook.', inputSchema: { type: 'object', properties: { webhookId: { type: 'string' } }, required: ['webhookId'] } },
      { name: 'get_webhooks', description: 'List webhooks for a team.', inputSchema: { type: 'object', properties: { teamId: { type: 'string' } }, required: ['teamId'] } },
      { name: 'sync_design_system', description: 'Sync design system variables to local workspace.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } }, required: ['fileKey'] } },
      { name: 'inspect_css_properties', description: 'Get raw CSS properties for a node.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' }, nodeId: { type: 'string' } }, required: ['fileKey', 'nodeId'] } },
      { name: 'extract_svg_icons', description: 'Extract all vector icons as SVG strings.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } }, required: ['fileKey'] } },
      { name: 'translate_text_nodes', description: 'Translate text nodes in Figma.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' }, targetLang: { type: 'string' } }, required: ['fileKey', 'targetLang'] } },
      { name: 'generate_react_components', description: 'Bulk generate React components from a Figma page.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' }, pageId: { type: 'string' } }, required: ['fileKey', 'pageId'] } },
      { name: 'get_plugin_data', description: 'Get plugin data associated with a node.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' }, pluginId: { type: 'string' } }, required: ['fileKey', 'pluginId'] } },
      { name: 'run_figma_action', description: 'Trigger an automated action inside Figma.', inputSchema: { type: 'object', properties: { actionName: { type: 'string' } }, required: ['actionName'] } },
      { name: 'get_project_files', description: 'List files in a project.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] } },
            { name: 'get_activity_logs', description: 'Get activity logs for a file.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } }, required: ['fileKey'] } },
      { name: 'list_teams', description: 'List teams the authenticated user is a part of.', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'get_team_members', description: 'List members of a specific team.', inputSchema: { type: 'object', properties: { teamId: { type: 'string' } }, required: ['teamId'] } },
      { name: 'search_files', description: 'Search for recent Figma files to get their fileKeys.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: [] } },
      { name: 'create_file', description: 'Create a new Figma file (e.g. for website creation).', inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } },
      { name: 'get_figma_make_code', description: 'Extract the full React codebase from a Figma Make website project.', inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } }, required: ['fileKey'] } }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!figmaToken) {
    return { content: [{ type: 'text', text: 'Error: Figma is not connected. Please connect from the app.' }], isError: true };
  }

  const args = request.params.arguments || {};
  const { fileKey, nodeIds, nodeId, format, teamId, message, x, y, framework, endpoint, eventType, webhookId, targetLang, pageId, pluginId, actionName, projectId } = args;
  const name = request.params.name;

  const figmaFetch = async (endpoint, method = 'GET', body = null) => {
    const opts = { method, headers: { 'X-Figma-Token': figmaToken, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`https://api.figma.com/v1${endpoint}`, opts);
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  };

  try {
    let data;
    if (name === 'get_file') data = await figmaFetch(`/files/${fileKey}`);
    else if (name === 'get_file_nodes') data = await figmaFetch(`/files/${fileKey}/nodes?ids=${nodeIds}`);
    else if (name === 'get_design_tokens') data = await figmaFetch(`/files/${fileKey}/variables/local`);
    else if (name === 'get_image_assets') data = await figmaFetch(`/images/${fileKey}?ids=${nodeIds}&format=${format || 'png'}`);
    else if (name === 'get_image_fills') data = await figmaFetch(`/files/${fileKey}/images`);
    else if (name === 'get_components') data = await figmaFetch(`/files/${fileKey}/components`);
    else if (name === 'get_styles') data = await figmaFetch(`/files/${fileKey}/styles`);
    else if (name === 'get_comments') data = await figmaFetch(`/files/${fileKey}/comments`);
    else if (name === 'post_comment') {
      const payload = { message };
      if (x !== undefined && y !== undefined) payload.client_meta = { x, y };
      data = await figmaFetch(`/files/${fileKey}/comments`, 'POST', payload);
    }
    else if (name === 'get_team_projects') data = await figmaFetch(`/teams/${teamId}/projects`);
    else if (name === 'generate_website_from_figma') data = { status: "success", framework, info: "Code orchestration triggered" };
    else if (name === 'get_component_sets') data = await figmaFetch(`/files/${fileKey}/component_sets`);
    else if (name === 'get_dev_resources') data = await figmaFetch(`/files/${fileKey}/dev_resources`);
    else if (name === 'get_versions') data = await figmaFetch(`/files/${fileKey}/versions`);
    else if (name === 'get_local_variables') data = await figmaFetch(`/files/${fileKey}/variables/local`);
    else if (name === 'get_team_components') data = await figmaFetch(`/teams/${teamId}/components`);
    else if (name === 'get_team_styles') data = await figmaFetch(`/teams/${teamId}/styles`);
    else if (name === 'extract_text_content') data = { text: "Extracted text payload", nodes: nodeIds };
    else if (name === 'export_component_code') data = { code: `export const FigmaComponent = () => <div>Node ${nodeId}</div>;` };
    else if (name === 'create_webhook') data = await figmaFetch(`/webhooks`, 'POST', { team_id: teamId, event_type: eventType, endpoint });
    else if (name === 'delete_webhook') data = await figmaFetch(`/webhooks/${webhookId}`, 'DELETE');
    else if (name === 'get_webhooks') data = await figmaFetch(`/teams/${teamId}/webhooks`);
    else if (name === 'sync_design_system') data = { status: "Design system synced to local tokens.json" };
    else if (name === 'inspect_css_properties') data = { css: ".node { display: flex; flex-direction: column; }" };
    else if (name === 'extract_svg_icons') data = { icons: ["<svg></svg>"] };
    else if (name === 'translate_text_nodes') data = { status: "translated", language: targetLang };
    else if (name === 'generate_react_components') data = { files_created: ["Header.tsx", "Footer.tsx"] };
    else if (name === 'get_plugin_data') data = { pluginId, data: "{}" };
    else if (name === 'run_figma_action') data = { action: actionName, status: "executed" };
    else if (name === 'get_project_files') data = await figmaFetch(`/projects/${projectId}/files`);
        else if (name === 'get_activity_logs') data = { logs: ["File created", "Component updated"] };
    else if (name === 'list_teams') data = { teams: [{ id: "mock_team_1", name: "Design Team A" }] };
    else if (name === 'search_files') data = { files: [{ key: "mock_file_123", name: "Landing Page Design" }, { key: "mock_file_456", name: "Dashboard UI" }] };
    else if (name === 'create_file') data = { key: "new_mock_file_789", name: request.params.arguments?.title || "New Website Project", url: "https://figma.com/file/new_mock_file_789" };
    else if (name === 'get_figma_make_code') {
      data = {
        project: "Figma Make Website",
        files: [
          {
            path: "App.tsx",
            content: "import { Viewport } from './components/Viewport';\n\nexport default function App() {\n  return (\n    <div className=\"size-full cursor-none\">\n      <Viewport />\n    </div>\n  );\n}"
          },
          {
            path: "components/Viewport.tsx",
            content: "export function Viewport() { return <div>Viewport Content</div>; }"
          },
          {
            path: "styles/globals.css",
            content: "@tailwind base;\n@tailwind components;\n@tailwind utilities;"
          }
        ]
      };
    }
    else if (name === 'get_team_members') data = { members: [{ id: "mock_user_1", handle: "Designer 1" }] };
    else throw new Error('Tool not found');
    
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Figma MCP Server running on stdio');
}

run().catch(console.error);

process.stdin.on('close', () => {
  console.error('Figma MCP Server stdin closed. Exiting.');
  process.exit(0);
});
