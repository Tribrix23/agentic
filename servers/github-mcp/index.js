import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
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

const TOKEN_PATH = path.join(getAppDataPath(), 'github_token.txt');
let githubToken = '';
if (fs.existsSync(TOKEN_PATH)) {
  githubToken = fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
}

let mcpChild = null;

const startMcpServer = () => {
  if (!githubToken) return;
  
  process.env.GITHUB_PERSONAL_ACCESS_TOKEN = githubToken;
  
  // Directly import and start the server in the current process
  // This avoids Node.js interactive stdin buffering issues caused by child_process.spawn()
  import('@modelcontextprotocol/server-github/dist/index.js').then(() => {
    console.error('GitHub MCP Server running on stdio');
  }).catch((err) => {
    console.error('Failed to start GitHub MCP Server:', err);
  });
};

if (githubToken) {
  startMcpServer();
}

const getHtmlWrapper = (title, content, isSuccess = false) => `
<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    body {
      background-color: #080A0F;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      background: #1c1c21;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.1);
      width: 100%;
      max-width: 400px;
      text-align: center;
    }
    h2 {
      margin-top: 0;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }
    h2 img {
      width: 24px;
      height: 24px;
    }
    .form-group {
      margin: 24px 0;
      text-align: left;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      color: #a1a1aa;
    }
    input {
      width: 100%;
      padding: 10px 12px;
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus {
      border-color: #3b82f6;
    }
    button {
      background: #fff;
      color: #000;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      transition: background 0.2s;
    }
    button:hover {
      background: #e4e4e7;
    }
    .success {
      color: #10b981;
      margin-bottom: 20px;
    }
    .close-btn {
      background: transparent;
      color: #a1a1aa;
      border: 1px solid rgba(255,255,255,0.1);
      margin-top: 10px;
    }
    .close-btn:hover {
      background: rgba(255,255,255,0.05);
      color: #fff;
    }
  </style>
</head>
<body>
  <div class="container">
    ${content}
  </div>
  ${isSuccess ? '<script>setTimeout(() => window.close(), 2000);</script>' : ''}
</body>
</html>
`;

app.get('/auth/status', (req, res) => {
  res.json({ connected: !!githubToken });
});

app.get('/auth/url', (req, res) => {
  res.json({ url: 'http://localhost:3005/auth/connect' });
});

app.get('/auth/connect', (req, res) => {
  if (githubToken) {
    return res.redirect('/auth/clear-token');
  }

  res.send(getHtmlWrapper('Connect GitHub - Quantix', `
      <h2><img src="http://localhost:5173/github.png" onerror="this.style.display='none'" /> Connect GitHub</h2>
      <form method="POST" action="/auth/save">
        <div class="form-group">
          <label>Personal Access Token <br><small style="color: #94a3b8; line-height: 1.5; display: inline-block; margin-top: 4px;">Go to <a href="https://github.com/settings/tokens" target="_blank" style="color: #3b82f6;">GitHub Settings</a> &rarr; Developer settings &rarr; Personal access tokens to generate a new classic token.</small></label>
          <input type="password" name="token" placeholder="ghp_..." required />
        </div>
        <button type="submit">Connect GitHub</button>
      </form>
  `, false));
});

app.get('/auth/clear-token', (req, res) => {
  githubToken = '';
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
  if (mcpChild) {
    mcpChild.kill();
    mcpChild = null;
  }
  res.redirect('/auth/connect');
});

app.post('/auth/save', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send('Invalid input');

  githubToken = token;
  fs.writeFileSync(TOKEN_PATH, token, 'utf-8');
  startMcpServer();

  res.send(getHtmlWrapper('Connected - Quantix', `
      <h2><img src="http://localhost:5173/github.png" onerror="this.style.display='none'" /> Connected</h2>
      <div class="success">Successfully connected to GitHub!</div>
      <button onclick="window.close()">Close Window</button>
  `, true));
});

app.post('/auth/disconnect', (req, res) => {
  githubToken = '';
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
  if (mcpChild) {
    mcpChild.kill();
    mcpChild = null;
  }
  res.json({ success: true });
});

app.listen(3005, () => {
  console.error('GitHub MCP Auth server listening on port 3005');
});

process.stdin.on('close', () => {
  console.error('GitHub MCP wrapper stdin closed. Exiting.');
  if (mcpChild) mcpChild.kill();
  process.exit(0);
});
