import { decodeXmlEntities } from './agent/xmlCodec';

export interface StreamingFileToolCall {
  id: string;
  name: string;
  path: string;
  content: string;
  complete: boolean;
}

const FILE_TOOLS = new Set([
  'writeFile',
  'createFile',
  'write_to_file',
  'editFile',
  'replace_file_content',
  'multi_replace_file_content',
]);

const CONTENT_NAMES = 'content|CodeContent|ReplacementContent|file_content|replace|replacement';
const PATH_NAMES = 'path|TargetFile|file';

function readElement(source: string, names: string): string | undefined {
  const direct = source.match(new RegExp(`<(?:${names})>\\s*([\\s\\S]*?)<\\/(?:${names})>`, 'i'));
  if (direct) return decodeXmlEntities(direct[1].trim());

  const parameter = source.match(new RegExp(`<parameter=(?:${names})>\\s*([\\s\\S]*?)<\\/parameter>`, 'i'));
  return parameter ? decodeXmlEntities(parameter[1].trim()) : undefined;
}

function trimPartialClosingTag(value: string, closingTag: string): string {
  const lowerTag = closingTag.toLowerCase();
  const max = Math.min(value.length, closingTag.length - 1);
  for (let length = max; length > 0; length--) {
    if (value.slice(-length).toLowerCase() === lowerTag.slice(0, length)) {
      return value.slice(0, -length);
    }
  }
  return value;
}

function readStreamingContent(source: string): string | undefined {
  const direct = source.match(new RegExp(`<(?:${CONTENT_NAMES})>`, 'i'));
  const parameter = source.match(new RegExp(`<parameter=(?:${CONTENT_NAMES})>`, 'i'));
  const match = direct && parameter
    ? (direct.index! < parameter.index! ? direct : parameter)
    : (direct || parameter);

  if (!match || match.index === undefined) return undefined;

  const isParameter = match[0].toLowerCase().startsWith('<parameter=');
  const closingTag = isParameter ? '</parameter>' : `</${match[0].slice(1, -1)}>`;
  let content = source.slice(match.index + match[0].length);
  const closeIndex = content.toLowerCase().indexOf(closingTag.toLowerCase());
  content = closeIndex >= 0
    ? content.slice(0, closeIndex)
    : trimPartialClosingTag(content, closingTag);

  return decodeXmlEntities(content.replace(/^\r?\n/, ''));
}

/** Reconstructs XML-like tool calls even when chunks split any tag. */
export class IncrementalToolCallParser {
  private buffer = '';
  private emitted = new Map<string, string>();

  feed(chunk: string): StreamingFileToolCall[] {
    this.buffer += chunk;
    const updates: StreamingFileToolCall[] = [];
    const starts = Array.from(this.buffer.matchAll(/<tool_call>/gi));

    starts.forEach((start, index) => {
      if (start.index === undefined) return;
      const nextStart = starts[index + 1]?.index ?? this.buffer.length;
      const segment = this.buffer.slice(start.index, nextStart);
      const functionMatch = segment.match(/<function=([a-zA-Z0-9_-]+)>/i);
      if (!functionMatch || !FILE_TOOLS.has(functionMatch[1])) return;

      const path = readElement(segment, PATH_NAMES);
      if (!path) return;

      const call: StreamingFileToolCall = {
        id: `stream_tool_${start.index}`,
        name: functionMatch[1],
        path,
        content: readStreamingContent(segment) ?? '',
        complete: /<\/tool_call>/i.test(segment),
      };
      const signature = `${call.name}\0${call.path}\0${call.content}\0${call.complete}`;
      if (this.emitted.get(call.id) !== signature) {
        this.emitted.set(call.id, signature);
        updates.push(call);
      }
    });

    return updates;
  }
}

function toLines(content: string): string[] {
  return content ? content.replace(/\r\n/g, '\n').split('\n') : [];
}

/** Returns additions/removals using a line-level LCS diff. */
export function calculateLineChanges(original: string, updated: string): { added: number; removed: number } {
  const before = toLines(original);
  const after = toLines(updated);
  const row = new Array(after.length + 1).fill(0);

  for (let i = 1; i <= before.length; i++) {
    let diagonal = 0;
    for (let j = 1; j <= after.length; j++) {
      const above = row[j];
      row[j] = before[i - 1] === after[j - 1]
        ? diagonal + 1
        : Math.max(row[j], row[j - 1]);
      diagonal = above;
    }
  }

  const common = row[after.length];
  return { added: after.length - common, removed: before.length - common };
}
