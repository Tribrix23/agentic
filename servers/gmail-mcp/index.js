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
const REDIRECT_URI = "http://localhost:3001/oauth2callback";
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];

const getAppDataPath = () => {
  const appName = 'AgenticCoder';
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
      <html><body>
        <h1>Successfully connected to GMail!</h1>
        <p>You can close this window and return to Agentic Coder.</p>
        <script>window.close();</script>
      </body></html>
    `);
  } catch (error) {
    console.error('Error retrieving access token', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/auth/status', (req, res) => {
  const isConnected = fs.existsSync(TOKEN_PATH);
  res.json({ connected: isConnected });
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

const httpServer = app.listen(3001, () => {
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
        return `From: ${from}\nSubject: ${subject}\nSnippet: ${msgRes.data.snippet}\n---`;
      }));
      
      return {
        content: [{ type: "text", text: emailDetails.length ? emailDetails.join('\n') : "No emails found." }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  if (request.params.name === "send_email") {
    const { to, subject, body } = request.params.arguments;
    try {
      const messageParts = [
        `To: ${to}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${subject}`,
        '',
        body
      ];
      const message = messageParts.join('\n');
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
