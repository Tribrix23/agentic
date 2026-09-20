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
let CLIENT_ID = process.env.GMAIL_CLIENT_ID || "YOUR_CLIENT_ID";
let CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || "YOUR_CLIENT_SECRET";
const REDIRECT_URI = "http://localhost:3001/oauth2callback";
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];

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

const TOKEN_PATH = path.join(getAppDataPath(), 'gmail-token.json');

let oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

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


app.post('/set-credentials', express.json(), (req, res) => {
  if (req.body.clientId && req.body.clientSecret) {
    CLIENT_ID = req.body.clientId;
    CLIENT_SECRET = req.body.clientSecret;
    oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    
    // Reload token if it exists so we don't lose it on secret change
    if (fs.existsSync(TOKEN_PATH)) {
      try {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        oauth2Client.setCredentials(token);
      } catch (err) {}
    }
  }
  res.json({ success: true });
});

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
        <title>Successfully connected to GMail!</title>
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
          <h1>Gmail Connected</h1>
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
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const profile = await gmail.users.getProfile({ userId: 'me' });
        emailAddress = profile.data.emailAddress;
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

const httpServer = app.listen(3001, '127.0.0.1', () => {
  console.error("GMail OAuth Server listening on http://localhost:3001");
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Another instance of this server is already running on port 3001 — that's fine.
    console.error('[GMail MCP] Port 3001 already in use — existing OAuth server will handle requests.');
  } else {
    console.error('[GMail MCP] HTTP server error:', err);
  }
});

// ---------------------------------------------------------
// MCP Server Setup
// ---------------------------------------------------------
const server = new Server(
  {
    name: "gmail-mcp-server",
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
        name: "list_emails",
        description: "List recent emails from GMail",
        inputSchema: {
          type: "object",
          properties: {
            maxResults: { type: "number", description: "Maximum number of emails to return" },
            query: { type: "string", description: "GMail search query (e.g. 'is:unread')" }
          }
        }
      },
      {
        name: "read_email",
        description: "Read the full text body of a specific email",
        inputSchema: {
          type: "object",
          properties: {
            messageId: { type: "string", description: "The ID of the email to read" }
          },
          required: ["messageId"]
        }
      },
      {
        name: "send_email",
        description: "Send an email using GMail",
        inputSchema: {
          type: "object",
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
            body: { type: "string" }
          },
          required: ["to", "subject", "body"]
        }
      }
    ]
  };
});

// Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("GMail is not connected. Please connect via the UI first.");
  }
  
  // Always reload the token from disk right before making a request.
  // This guarantees we have the freshest token even if another instance handled the OAuth callback!
  try {
    const freshToken = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2Client.setCredentials(freshToken);
  } catch (err) {
    throw new Error(`Failed to read token: ${err.message}`);
  }
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  if (request.params.name === "list_emails") {
    const maxResults = request.params.arguments?.maxResults || 10;
    const q = request.params.arguments?.query || "";
    
    try {
      const res = await gmail.users.messages.list({ userId: 'me', maxResults, q });
      const messages = res.data.messages || [];
      
      const emailDetails = await Promise.all(messages.map(async (msg) => {
        const msgRes = await gmail.users.messages.get({ userId: 'me', id: msg.id });
        const headers = msgRes.data.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value;
        const from = headers.find(h => h.name === 'From')?.value;
        return `ID: ${msg.id}\nFrom: ${from}\nSubject: ${subject}\nSnippet: ${msgRes.data.snippet}\n---`;
      }));
      
      return {
        content: [{ type: "text", text: emailDetails.length ? emailDetails.join('\n') : "No emails found." }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  if (request.params.name === "read_email") {
    const { messageId } = request.params.arguments;
    try {
      const msgRes = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
      const headers = msgRes.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value;
      const from = headers.find(h => h.name === 'From')?.value;
      
      let bodyText = "";
      
      function getPlaintextPart(parts) {
        for (let i = 0; i < parts.length; i++) {
          if (!parts[i].parts) {
            if (parts[i].mimeType === 'text/plain') {
              return parts[i].body?.data || '';
            } else if (parts[i].mimeType === 'text/html' && !bodyText) {
              bodyText = parts[i].body?.data || ''; // fallback
            }
          } else {
            const found = getPlaintextPart(parts[i].parts);
            if (found && parts[i].mimeType !== 'multipart/alternative') return found; // keep looking if it's alternative, preferring plain
            if (found) return found;
          }
        }
        return bodyText;
      }

      if (msgRes.data.payload.parts) {
        bodyText = getPlaintextPart(msgRes.data.payload.parts);
      } else {
        bodyText = msgRes.data.payload.body?.data || '';
      }

      if (bodyText) {
        bodyText = Buffer.from(bodyText.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      }

      return {
        content: [{ type: "text", text: `From: ${from}\nSubject: ${subject}\n\n${bodyText}` }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  if (request.params.name === "send_email") {
    const { to, subject, body } = request.params.arguments;
    try {
      const encodedSubject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
      const hasHtmlTags = /<[a-z][\s\S]*>/i.test(body);
      const finalBody = hasHtmlTags ? body : body.replace(/\n/g, '<br>\n');
      
      const messageParts = [
        `To: ${to}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${encodedSubject}`,
        '',
        finalBody
      ];
      const message = messageParts.join('\r\n');
      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
        
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedMessage }
      });
      return { content: [{ type: "text", text: "Email sent successfully." }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  throw new Error("Tool not found");
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GMail MCP Server running on stdio");

  // When the parent (Quantix) closes, stdin is closed. We must exit to avoid zombie processes 
  // keeping the Express port (3001) open in the background.
  process.stdin.on('close', () => {
    console.error("GMail MCP Server stdio closed. Exiting...");
    process.exit(0);
  });
  process.stdin.on('end', () => {
    console.error("GMail MCP Server stdio ended. Exiting...");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
