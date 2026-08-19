import fs from 'node:fs';
import readline from 'node:readline';

export interface FileLineRange {
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  totalBytes: number;
  hasMore: boolean;
  nextStartLine?: number;
}

export async function readFileLineRange(filePath: string, startLine = 1, endLine = startLine + 499): Promise<FileLineRange> {
  const safeStart = Math.max(1, Math.floor(startLine));
  const safeEnd = Math.max(safeStart, Math.floor(endLine));
  const stat = await fs.promises.stat(filePath);
  const selected: string[] = [];
  let totalLines = 0;

  const input = fs.createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    totalLines += 1;
    if (totalLines >= safeStart && totalLines <= safeEnd) selected.push(line);
  }

  const actualEnd = selected.length ? safeStart + selected.length - 1 : Math.min(safeEnd, totalLines);
  const hasMore = actualEnd < totalLines;
  return {
    content: selected.join('\n'),
    startLine: safeStart,
    endLine: actualEnd,
    totalLines,
    totalBytes: stat.size,
    hasMore,
    nextStartLine: hasMore ? actualEnd + 1 : undefined,
  };
}
