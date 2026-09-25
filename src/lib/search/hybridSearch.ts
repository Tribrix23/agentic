import { getAIConfig } from '../aiConfig';
import { searchEmbeddings } from '../semanticSearch';
import { ASTIndexer, CodeChunk } from './astIndexer';

export interface SearchResult {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
  rank: number;
  source: 'vector' | 'bm25' | 'hybrid';
}

export class HybridSearch {
  private astIndexer: ASTIndexer;

  constructor() {
    this.astIndexer = new ASTIndexer();
  }

  async init() {
    await this.astIndexer.init();
  }

  /**
   * Reciprocal Rank Fusion (RRF) algorithm to combine multiple ranked lists.
   */
  private computeRRF(vectorResults: SearchResult[], bm25Results: SearchResult[], k = 60): SearchResult[] {
    const fusionScores = new Map<string, { item: SearchResult, rrfScore: number }>();

    // Process Vector Results
    vectorResults.forEach((item, index) => {
      const rank = index + 1;
      const score = 1 / (k + rank);
      fusionScores.set(item.id, { item, rrfScore: score });
    });

    // Process BM25 Results
    bm25Results.forEach((item, index) => {
      const rank = index + 1;
      const score = 1 / (k + rank);
      
      if (fusionScores.has(item.id)) {
        const existing = fusionScores.get(item.id)!;
        existing.rrfScore += score;
        existing.item.source = 'hybrid';
      } else {
        fusionScores.set(item.id, { item, rrfScore: score });
      }
    });

    // Sort by RRF score descending
    const sorted = Array.from(fusionScores.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .map((entry, index) => ({
        ...entry.item,
        score: entry.rrfScore,
        rank: index + 1
      }));

    return sorted;
  }

  /**
   * Mock Vector Search using Voyage-code-2 or similar embedding model.
   * In a real implementation, this would chunk files using ASTIndexer, 
   * embed them, and query a local vector DB (e.g. SQLite VSS or LanceDB).
   */
  private async performVectorSearch(query: string, projectRoot: string): Promise<SearchResult[]> {
    console.log(`[HybridSearch] Querying vector space for: ${query}`);
    try {
      const vectorHits = await searchEmbeddings(projectRoot, query, 5);
      return vectorHits.map((hit, index) => ({
        id: `${hit.filePath}#vector`,
        filePath: hit.filePath,
        startLine: 1,
        endLine: hit.content.split('\n').length,
        content: hit.content,
        score: hit.score,
        rank: index + 1,
        source: 'vector' as const
      }));
    } catch (e) {
      console.error('[HybridSearch] Vector search failed:', e);
      return [];
    }
  }

  /**
   * BM25 Search using Ripgrep (rg)
   */
  private async performBM25Search(query: string, projectRoot: string): Promise<SearchResult[]> {
    try {
      const escapedQuery = query.replace(/"/g, '\\\\"');
      // Ripgrep with context lines for basic chunking fallback
      const cmd = `rg -n -C 2 -i "${escapedQuery}" .`;
      const res = await (window as any).electron.runCommandCapture(cmd, projectRoot);
      
      if (!res.success) return [];

      const lines = res.output.split('\\n');
      const results: SearchResult[] = [];
      let currentFile = '';
      
      // Basic parse of rg output to construct BM25 ranked hits
      lines.forEach((line: string, index: number) => {
        const match = line.match(/^([^:]+):(\\d+):(.*)$/);
        if (match) {
          const [, filePath, lineNumStr, content] = match;
          const lineNum = parseInt(lineNumStr, 10);
          
          results.push({
            id: `${filePath}#L${lineNum}`,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            content,
            score: 1.0 / (index + 1), // Naive BM25 rank mock
            rank: index + 1,
            source: 'bm25'
          });
        }
      });
      
      return results.slice(0, 50); // Top 50 BM25 hits
    } catch (e) {
      console.error('[HybridSearch] BM25 Search failed:', e);
      return [];
    }
  }

  public async search(query: string, projectRoot: string): Promise<SearchResult[]> {
    const [vectorResults, bm25Results] = await Promise.all([
      this.performVectorSearch(query, projectRoot),
      this.performBM25Search(query, projectRoot)
    ]);

    const hybridResults = this.computeRRF(vectorResults, bm25Results);
    return hybridResults;
  }
}

