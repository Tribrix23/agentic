const text = `I can read files in this folder! Let me first check what's available by listing the directory structure.

Let me start by listing the root directory to see what's available:

{
"tool_call": {
"name": "listDirectory",
"arguments": {}
}
}
`;

// Make backticks optional
const jsonBlockRegex = /(?:```(?:json)?\s*\n?\s*)?(\{[\s\S]*?"tool_call"[\s\S]*?\})(?:\s*\n?\s*```)?/gi;

let match;
while ((match = jsonBlockRegex.exec(text)) !== null) {
  try {
    const parsed = JSON.parse(match[1].trim());
    console.log("Parsed successfully:", parsed);
  } catch (e) {
    console.log("Parse failed for match:", match[1]);
  }
}

// Another regex idea: just match the JSON structure directly
const pureJsonRegex = /\{[^{}]*"tool_call"[\s\S]*?\}/gi; // not good for nested
