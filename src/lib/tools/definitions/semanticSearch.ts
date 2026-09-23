import { ToolDefinition, ToolHandler } from '../types';
import { HybridSearch } from '../../search/hybridSearch';

export const definition: ToolDefinition = {
  name: 'semanticSearch',
  description: 'Production-grade RAG semantic search over the codebase. Uses Hybrid Search (Vector Embeddings + BM25) and AST-aware chunking to find exact and conceptual matches for code symbols, logic, and patterns.',
  category: 'search',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language or code query to search for' },
    },
    required: ['query']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  icon: 'Sparkles',
  timeout: 10000
};

const searchEngine = new HybridSearch();
let searchEngineInit = false;

export const handler: ToolHandler = async (args, context) => {
  try {
    const { query } = args;
    
    if (!searchEngineInit) {
      await searchEngine.init();
      searchEngineInit = true;
    }

    const results = await searchEngine.search(query, context.projectRoot);

    if (results.length === 0) {
      return { success: true, output: 'No results found for query.' };
    }

    let output = `Found ${results.length} results using Hybrid RAG:\\n\\n`;
    results.slice(0, 10).forEach((res, i) => {
      output += `[Result ${i + 1}] ${res.filePath}:${res.startLine}-${res.endLine} (Score: ${res.score.toFixed(4)} | Source: ${res.source})\\n`;
      output += `${res.content}\\n\\n`;
    });

    return {
      success: true,
      output,
      data: results
    };
  } catch (error: any) {
    return { success: false, output: `Semantic Search failed: ${error.message}` };
  }
};
