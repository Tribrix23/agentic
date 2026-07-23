const text = `I can read files in this folder! Let me first check what's available by listing the directory structure.

Let me start by listing the root directory to see what's available:

{
"tool_call": {
"name": "listDirectory",
"arguments": {}
}
}
`;

function extractJSONBlocks(text) {
  const blocks = [];
  let startIndex = text.indexOf('{');
  while (startIndex !== -1) {
    let braceCount = 0;
    let endIndex = -1;
    for (let i = startIndex; i < text.length; i++) {
      if (text[i] === '{') braceCount++;
      else if (text[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIndex = i;
          break;
        }
      }
    }
    if (endIndex !== -1) {
      try {
        const str = text.substring(startIndex, endIndex + 1);
        const parsed = JSON.parse(str);
        if (parsed.tool_call || parsed.name) {
          blocks.push(parsed);
        }
      } catch(e) {}
    }
    startIndex = text.indexOf('{', startIndex + 1);
  }
  return blocks;
}

console.log(extractJSONBlocks(text));
