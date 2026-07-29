import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { setupFileSystemTools } from "./tools/filesystem.js";
import { setupShellTools } from "./tools/shell.js";
import { setupGitTools } from "./tools/git.js";
const server = new Server({
    name: "agentic-mcp-server",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// We will collect tools from different modules
const toolsList = [];
const toolHandlers = {};
export function registerTool(def, handler) {
    toolsList.push(def);
    toolHandlers[def.name] = handler;
}
// Setup specific tool modules
setupFileSystemTools(registerTool);
setupShellTools(registerTool);
setupGitTools(registerTool);
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toolsList };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = toolHandlers[name];
    if (!handler) {
        throw new Error(`Unknown tool: ${name}`);
    }
    try {
        const result = await handler(args);
        return {
            content: [{ type: "text", text: typeof result === 'string' ? result : JSON.stringify(result) }]
        };
    }
    catch (error) {
        return {
            isError: true,
            content: [{ type: "text", text: `Error: ${error.message}` }]
        };
    }
});
async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Agentic MCP Server running on stdio");
}
run().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
