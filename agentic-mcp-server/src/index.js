"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTool = registerTool;
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const filesystem_js_1 = require("./tools/filesystem.js");
const server = new index_js_1.Server({
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
function registerTool(def, handler) {
    toolsList.push(def);
    toolHandlers[def.name] = handler;
}
// Setup specific tool modules
(0, filesystem_js_1.setupFileSystemTools)(registerTool);
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    return { tools: toolsList };
});
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
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
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("Agentic MCP Server running on stdio");
}
run().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map