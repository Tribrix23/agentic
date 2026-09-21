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
let CLIENT_ID = process.env.CALENDAR_CLIENT_ID || process.env.GMAIL_CLIENT_ID || "YOUR_CLIENT_ID";
let CLIENT_SECRET = process.env.CALENDAR_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET || "YOUR_CLIENT_SECRET";
const REDIRECT_URI = "http://localhost:3002/oauth2callback";
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'];

const TOKEN_PATH = path.join(os.homedir(), '.agentic_calendar_token.json');

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const app = express();
app.use(cors());

app.get('/auth/url', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.json({ url: url });
});

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.send('Error: No code provided');
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.send('<html><body><h1>Authentication successful!</h1><p>You can close this tab and return to Quantix.</p><script>window.close();</script></body></html>');
  } catch (error) {
    res.send('Error retrieving access token: ' + error.message);
  }
});

app.get('/auth/status', async (req, res) => {
  let isConnected = false;
  let emailAddress = null;

  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      oauth2Client.setCredentials(token);
      
      const oauth2 = google.oauth2({
        auth: oauth2Client,
        version: 'v2'
      });
      const userInfo = await oauth2.userinfo.get();
      emailAddress = userInfo.data.email;
      isConnected = true;
    } catch (e) {
      console.error("Error fetching profile email:", e.message);
    }
  }

  res.json({ connected: isConnected, email: emailAddress });
});

app.post('/auth/disconnect', async (req, res) => {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
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

const httpServer = app.listen(3002, '127.0.0.1', () => {
  console.error("Calendar OAuth Server listening on http://localhost:3002");
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('[Calendar MCP] Port 3002 already in use - existing OAuth server will handle requests.');
  } else {
    console.error('[Calendar MCP] HTTP server error:', err);
  }
});

const server = new Server(
  {
    name: "calendar-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_events",
        description: "List upcoming events from Google Calendar",
        inputSchema: {
          type: "object",
          properties: {
            maxResults: { type: "number", description: "Maximum number of events to return" },
            timeMin: { type: "string", description: "Lower bound (inclusive) for an event's end time to filter by, formatted as RFC3339 (e.g. 2026-09-21T00:00:00Z)." }
          }
        }
      },
      {
        name: "create_event",
        description: "Create a new event in Google Calendar",
        inputSchema: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Title of the event" },
            description: { type: "string", description: "Description of the event" },
            startTime: { type: "string", description: "Start time formatted as RFC3339 (e.g. 2026-09-21T10:00:00Z)" },
            endTime: { type: "string", description: "End time formatted as RFC3339 (e.g. 2026-09-21T11:00:00Z)" },
            attendees: { type: "array", items: { type: "string" }, description: "Array of email addresses to invite" }
          },
          required: ["summary", "startTime", "endTime"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("Calendar is not connected. Please connect via the UI first.");
  }
  
  try {
    const freshToken = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2Client.setCredentials(freshToken);
  } catch (err) {
    throw new Error(`Failed to read token: ${err.message}`);
  }
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  if (request.params.name === "list_events") {
    const maxResults = request.params.arguments?.maxResults || 10;
    const timeMin = request.params.arguments?.timeMin || (new Date()).toISOString();
    
    try {
      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin,
        maxResults: maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });
      
      const events = res.data.items || [];
      if (events.length === 0) {
        return { content: [{ type: "text", text: "No upcoming events found." }] };
      }
      
      const eventDetails = events.map((event) => {
        const start = event.start.dateTime || event.start.date;
        const end = event.end.dateTime || event.end.date;
        return `Event: ${event.summary}\nStarts: ${start}\nEnds: ${end}\nLink: ${event.htmlLink}\n---`;
      });
      
      return { content: [{ type: "text", text: eventDetails.join('\n') }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  if (request.params.name === "create_event") {
    const { summary, description, startTime, endTime, attendees } = request.params.arguments;
    try {
      const event = {
        summary: summary,
        description: description || '',
        start: { dateTime: startTime },
        end: { dateTime: endTime },
        attendees: attendees ? attendees.map(email => ({ email })) : [],
      };
      
      const res = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        sendUpdates: attendees && attendees.length > 0 ? 'all' : 'none'
      });
      
      return { content: [{ type: "text", text: `Event created successfully: ${res.data.htmlLink}` }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  throw new Error("Tool not found");
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Calendar MCP Server running on stdio");

  process.stdin.on('close', () => {
    console.error("Calendar MCP Server stdio closed. Exiting...");
    process.exit(0);
  });
  process.stdin.on('end', () => {
    console.error("Calendar MCP Server stdio ended. Exiting...");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
