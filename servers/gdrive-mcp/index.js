const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { google } = require("googleapis");
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const os = require("os");

// Load .env from both the script's directory and the project root just to be safe
require("dotenv").config({ path: path.join(__dirname, '.env') });
require("dotenv").config({ path: path.join(__dirname, '..', '..', '.env') });

// OAuth2 Setup
const CLIENT_ID = process.env.GMAIL_CLIENT_ID || "YOUR_CLIENT_ID";
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || "YOUR_CLIENT_SECRET";
const REDIRECT_URI = "http://localhost:3002/oauth2callback";
const SCOPES = ['https://www.googleapis.com/auth/drive'];

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

const TOKEN_PATH = path.join(getAppDataPath(), 'gdrive-token.json');

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Load existing token if available
if (fs.existsSync(TOKEN_PATH)) {
  try {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2Client.setCredentials(token);
  } catch (err) {
    console.error('Error reading token:', err);
  }
}

// ---------------------------------------------------------
// Express Server for OAuth Flow
// ---------------------------------------------------------
const app = express();
app.use(cors());

app.get('/auth/url', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.json({ url: authUrl });
});

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('No code provided');
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Successfully connected to Google Drive!</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background-color: #080A0F; font-family: 'Inter', sans-serif; }
          canvas { display: block; width: 100vw; height: 100vh; position: absolute; top: 0; left: 0; z-index: 1; opacity: 0.8; }
          .content {
            position: relative;
            z-index: 10;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            color: white;
            text-align: center;
            pointer-events: none;
          }
          .logo { width: 90px; height: 90px; margin-bottom: 24px; filter: drop-shadow(0px 4px 12px rgba(99, 54, 231, 0.4)); }
          h1 { font-size: 32px; font-weight: 700; margin: 0 0 12px 0; background: linear-gradient(to right, #ffffff, #e2e8f0); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          p { font-size: 16px; color: #94a3b8; max-width: 420px; line-height: 1.6; margin: 0; }
        </style>
      </head>
      <body>
        <div class="content">
          <img class="logo" src="http://localhost:5173/icon.png" alt="Quantix" onerror="this.style.display='none'" />
          <h1>Google Drive Connected</h1>
          <p>Authentication complete. You can safely close this browser tab and return to the app.</p>
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
            
            const posLoc = gl.getAttribLocation(program, 'position');
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
            
            const uTime = gl.getUniformLocation(program, 'uTime');
            const uRes = gl.getUniformLocation(program, 'uResolution');
            const uColor = gl.getUniformLocation(program, 'uBaseColor');
            const uAmp = gl.getUniformLocation(program, 'uAmplitude');
            const uFreqX = gl.getUniformLocation(program, 'uFrequencyX');
            const uFreqY = gl.getUniformLocation(program, 'uFrequencyY');
            const uMouse = gl.getUniformLocation(program, 'uMouse');
            
            gl.uniform3f(uColor, 0.03, 0.015, 0.06);
            gl.uniform1f(uAmp, 0.3);
            gl.uniform1f(uFreqX, 3.0);
            gl.uniform1f(uFreqY, 3.0);
            
            let mx = 0.5, my = 0.5;
            // Mouse interaction disabled per user request
            // window.addEventListener('mousemove', e => {
            //   mx = e.clientX / window.innerWidth;
            //   my = 1.0 - (e.clientY / window.innerHeight);
            // });
            
            function resize() {
              canvas.width = window.innerWidth;
              canvas.height = window.innerHeight;
              gl.viewport(0, 0, canvas.width, canvas.height);
              gl.uniform2f(uRes, canvas.width, canvas.height);
            }
            window.addEventListener('resize', resize);
            resize();
            
            function render(t) {
              requestAnimationFrame(render);
              gl.uniform1f(uTime, t * 0.001 * 0.2);
              gl.uniform2f(uMouse, mx, my);
              gl.drawArrays(gl.TRIANGLES, 0, 3);
            }
            requestAnimationFrame(render);
          }
          
          setTimeout(() => window.close(), 3000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error retrieving access token', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/auth/status', async (req, res) => {
  const isConnected = fs.existsSync(TOKEN_PATH);
  let emailAddress = null;

  if (isConnected) {
    try {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      if (tokens.emailAddress) {
        emailAddress = tokens.emailAddress;
      } else {
        // Fetch it once and save it
        oauth2Client.setCredentials(tokens);
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const about = await drive.about.get({ fields: 'user' });
        emailAddress = about.data.user.emailAddress;
        tokens.emailAddress = emailAddress;
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      }
    } catch (e) {
      console.error("Error fetching profile email:", e.message);
    }
  }

  res.json({ connected: isConnected, email: emailAddress });
});

app.post('/auth/disconnect', async (req, res) => {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      // Revoke the token with Google first
      try {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        if (token.access_token) {
          await oauth2Client.revokeToken(token.access_token);
        }
      } catch (revokeErr) {
        console.error('Token revoke failed (already expired?):', revokeErr.message);
      }
      fs.unlinkSync(TOKEN_PATH);
      oauth2Client.setCredentials({});
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const httpServer = app.listen(3002, () => {
  console.error("Google Drive OAuth Server listening on http://localhost:3002");
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Another instance of this server is already running on port 3002 — that's fine.
    console.error('[GDrive MCP] Port 3002 already in use — existing OAuth server will handle requests.');
  } else {
    console.error('[GDrive MCP] HTTP server error:', err);
  }
});

// ---------------------------------------------------------
// MCP Server Setup
// ---------------------------------------------------------
const server = new Server(
  {
    name: "gdrive-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_files",
        description: "List recent files from Google Drive",
        inputSchema: {
          type: "object",
          properties: {
            maxResults: { type: "number", description: "Maximum number of files to return (default 10)" },
          }
        }
      },
      {
        name: "search_files",
        description: "Search for files in Google Drive",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Drive search query (e.g. 'name contains \"report\"')" },
            maxResults: { type: "number", description: "Maximum number of files to return (default 10)" }
          },
          required: ["query"]
        }
      },
      {
        name: "read_file",
        description: "Read the text content of a specific file from Google Drive (supports normal text files and Google Docs)",
        inputSchema: {
          type: "object",
          properties: {
            fileId: { type: "string", description: "The ID of the file to read" }
          },
          required: ["fileId"]
        }
      },
      {
        name: "upload_file",
        description: "Upload a file to Google Drive. Requires local file path.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Absolute path of the local file to upload" },
            fileName: { type: "string", description: "Optional name for the file in Drive (defaults to local file name)" }
          },
          required: ["filePath"]
        }
      },
      {
        name: "delete_file",
        description: "Delete a file from Google Drive by its file ID.",
        inputSchema: {
          type: "object",
          properties: {
            fileId: { type: "string", description: "The ID of the file to delete" }
          },
          required: ["fileId"]
        }
      }
    ]
  };
});

// Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("Google Drive is not connected. Please connect via the UI first.");
  }
  
  // Always reload the token from disk right before making a request.
  // This guarantees we have the freshest token even if another instance handled the OAuth callback!
  try {
    const freshToken = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2Client.setCredentials(freshToken);
  } catch (err) {
    throw new Error(`Failed to read token: ${err.message}`);
  }
  
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  if (request.params.name === "list_files") {
    const maxResults = request.params.arguments?.maxResults || 10;
    try {
      const res = await drive.files.list({
        pageSize: maxResults,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
        orderBy: 'modifiedTime desc'
      });
      const files = res.data.files || [];
      const fileDetails = files.map(f => `ID: ${f.id}\nName: ${f.name}\nType: ${f.mimeType}\nModified: ${f.modifiedTime}\n---`);
      return {
        content: [{ type: "text", text: fileDetails.length ? fileDetails.join('\n') : "No files found." }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  if (request.params.name === "search_files") {
    const { query, maxResults = 10 } = request.params.arguments;
    try {
      const res = await drive.files.list({
        q: query,
        pageSize: maxResults,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)'
      });
      const files = res.data.files || [];
      const fileDetails = files.map(f => `ID: ${f.id}\nName: ${f.name}\nType: ${f.mimeType}\nModified: ${f.modifiedTime}\n---`);
      return {
        content: [{ type: "text", text: fileDetails.length ? fileDetails.join('\n') : "No matching files found." }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  if (request.params.name === "read_file") {
    const { fileId } = request.params.arguments;
    try {
      // First get metadata to check mimeType (useful if it's a Google Doc that needs exporting)
      const metaRes = await drive.files.get({ fileId, fields: 'mimeType, name' });
      const mimeType = metaRes.data.mimeType;
      let textContent = "";

      if (mimeType.startsWith('application/vnd.google-apps.document')) {
        // Export Google Doc as text
        const res = await drive.files.export({
          fileId: fileId,
          mimeType: 'text/plain'
        }, { responseType: 'text' });
        textContent = res.data;
      } else {
        // Normal file download
        const res = await drive.files.get(
          { fileId: fileId, alt: 'media' },
          { responseType: 'text' }
        );
        textContent = res.data;
      }

      return {
        content: [{ type: "text", text: `Name: ${metaRes.data.name}\n\n${textContent}` }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  if (request.params.name === "upload_file") {
    const { filePath, fileName } = request.params.arguments;
    try {
      if (!fs.existsSync(filePath)) {
        return { content: [{ type: "text", text: `Error: File not found at path ${filePath}` }], isError: true };
      }
      const parsed = path.parse(filePath);
      const nameToUse = fileName || parsed.base;
      const res = await drive.files.create({
        requestBody: { name: nameToUse },
        media: { body: fs.createReadStream(filePath) },
        fields: 'id, name, webViewLink'
      });
      return {
        content: [{ type: "text", text: `File uploaded successfully!\nID: ${res.data.id}\nName: ${res.data.name}\nLink: ${res.data.webViewLink}` }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  if (request.params.name === "delete_file") {
    const { fileId } = request.params.arguments;
    try {
      await drive.files.delete({ fileId });
      return {
        content: [{ type: "text", text: `File with ID ${fileId} successfully deleted.` }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  throw new Error("Tool not found");
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GDrive MCP Server running on stdio");

  // When the parent (Quantix) closes, stdin is closed. We must exit to avoid zombie processes 
  // keeping the Express port (3002) open in the background.
  process.stdin.on('close', () => {
    console.error("GDrive MCP Server stdio closed. Exiting...");
    process.exit(0);
  });
  process.stdin.on('end', () => {
    console.error("GDrive MCP Server stdio ended. Exiting...");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});





