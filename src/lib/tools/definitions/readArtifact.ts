import { artifactStore } from '../artifactStore';
import type { ToolDefinition, ToolHandler } from '../types';

export const definition: ToolDefinition = {
  name: 'readArtifact',
  description: 'Read a page from a large tool-output artifact by artifact ID.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      artifactId: { type: 'string', description: 'Artifact ID returned by a prior tool result.' },
      offset: { type: 'number', minimum: 0, description: 'Character offset to start from.' },
      limit: { type: 'number', minimum: 1, maximum: 256000, description: 'Maximum characters to return.' },
    },
    required: ['artifactId'],
    additionalProperties: false,
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 5_000,
  icon: 'FileText',
  capabilities: { sideEffect: 'none', permission: 'none', concurrencyKeys: [] },
};

export const handler: ToolHandler = async args => {
  const page = artifactStore.read(args.artifactId, args.offset, args.limit);
  if (!page) return { success: false, output: `Artifact not found: ${args.artifactId}` };
  const continuation = page.hasMore ? `\n\n[Continue with artifactId=${args.artifactId}, offset=${page.nextOffset}]` : '';
  return {
    success: true,
    output: page.content + continuation,
    artifactRef: page.artifact,
    truncated: page.hasMore,
    truncation: {
      truncated: page.hasMore,
      originalBytes: page.artifact.byteLength,
      includedBytes: new TextEncoder().encode(page.content).byteLength,
      continuation: page.hasMore ? `readArtifact({ artifactId: "${args.artifactId}", offset: ${page.nextOffset} })` : undefined,
    },
  };
};
