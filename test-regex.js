const regex = /```(?:json)?\s*\n?\s*(\{[\s\S]*?"tool_call"[\s\S]*?\})\s*\n?\s*```/gi;
const str = `\`\`\`json
{
  "tool_call": {
    "name": "listDirectory",
    "arguments": { "path": "." }
  }
}
\`\`\``;
console.log(regex.exec(str));
