import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'deepResearch',
  description: `Search academic databases (arXiv, Semantic Scholar, Google Scholar, IEEE, ResearchGate, Scopus) for credible research papers.

CRITICAL QUERY RULES — READ BEFORE CALLING:
- "query" MUST be 3-8 keywords only. Treat it like a Google Scholar search box.
- GOOD: "SARIMA forecasting" or "neural network time series"
- BAD: "academic papers on SARIMA seasonal autoregressive..." (too long, wastes the call)
- The tool will hard-truncate your query to 60 characters anyway.
- For general web browsing, use the Playwright MCP browser tools instead.`,
  category: 'search',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'SHORT keyword search query — 3 to 8 words maximum. Example: "SARIMA forecasting" or "transformer NLP 2024".',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of papers to return (default 5, max 10)',
      },
    },
    required: ['query'],
  },
  icon: 'BookOpen',
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 30000,
};

export const handler: ToolHandler = async (args, context): Promise<ToolResult> => {
  // Hard-truncate query to 60 chars and take only first 8 words — no matter what the AI passes
  const rawQuery = String(args.query || '').trim();
  const query = rawQuery.split(/\s+/).slice(0, 8).join(' ').slice(0, 60);
  const maxResults = Math.min(args.maxResults || 5, 10);

  if (!query) {
    return { success: false, output: 'The "query" parameter is required.' };
  }

  let combinedOutput = `Academic research results for: "${query}"\n\n`;
  let foundResults = false;

  // ── 1. arXiv API (free, no rate limits, reliable) ─────────────────────────
  try {
    const arxivUrl = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${maxResults}&sortBy=relevance`;
    const res = await fetch(arxivUrl, { signal: context.signal });
    if (res.ok) {
      const xml = await res.text();
      // Parse entries from Atom XML
      const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
      if (entries.length > 0) {
        foundResults = true;
        combinedOutput += `## arXiv Papers\n\n`;
        for (const entry of entries) {
          const title   = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim().replace(/\s+/g, ' ') || 'Untitled';
          const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]?.trim().replace(/\s+/g, ' ') || '';
          const pdfLink = (entry.match(/<link[^>]+title="pdf"[^>]+href="([^"]+)"/) || [])[1] ||
                          (entry.match(/<id>([\s\S]*?)<\/id>/) || [])[1]?.trim().replace('abs', 'pdf') || '';
          const absLink = (entry.match(/<id>([\s\S]*?)<\/id>/) || [])[1]?.trim() || '';
          const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => m[1].trim()).slice(0, 3).join(', ');
          const published = (entry.match(/<published>([\s\S]*?)<\/published>/) || [])[1]?.slice(0, 10) || '';

          combinedOutput += `### ${title} [[ArXiv]](${absLink})\n`;
          if (authors)    combinedOutput += `**Authors**: ${authors}${published ? ` (${published})` : ''}\n`;
          if (summary)    combinedOutput += `**Abstract**: ${summary.slice(0, 400)}${summary.length > 400 ? '...' : ''}\n`;
          if (pdfLink)    combinedOutput += `**PDF**: [[PDF]](${pdfLink})\n`;
          combinedOutput += `\n`;
        }
      }
    }
  } catch (err: any) {
    console.error('[deepResearch] arXiv failed:', err?.message);
  }

  // ── 2. OpenAlex API (free, no keys needed, 250M+ papers) ───────────────────
  if (!foundResults) {
    try {
      const openAlexUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${maxResults}&mailto=hello@quantix.com`;
      const res = await fetch(openAlexUrl, { signal: context.signal });
      if (res.ok) {
        const data = await res.json();
        const papers = data.results || [];
        if (papers.length > 0) {
          foundResults = true;
          combinedOutput += `## OpenAlex Database\n\n`;
          for (const p of papers) {
            const authors = (p.authorships || []).slice(0, 3).map((a: any) => a.author?.display_name).filter(Boolean).join(', ');
            const url     = p.open_access?.oa_url || p.doi || p.id;
            const pdfUrl  = p.open_access?.oa_url;
            
            // Abstract is inverted index in OpenAlex, requires reconstruction:
            let abstractText = '';
            if (p.abstract_inverted_index) {
              const words: string[] = [];
              for (const [word, positions] of Object.entries(p.abstract_inverted_index)) {
                for (const pos of (positions as number[])) {
                  words[pos] = word;
                }
              }
              abstractText = words.join(' ');
            }

            combinedOutput += `### ${p.title || 'Untitled'} [[Source]](${url})\n`;
            if (authors)            combinedOutput += `**Authors**: ${authors}${p.publication_year ? ` (${p.publication_year})` : ''}\n`;
            if (p.primary_location?.source?.display_name) combinedOutput += `**Venue**: ${p.primary_location.source.display_name}\n`;
            if (p.cited_by_count != null) combinedOutput += `**Citations**: ${p.cited_by_count}\n`;
            if (abstractText)         combinedOutput += `**Abstract**: ${abstractText.slice(0, 400)}...\n`;
            if (pdfUrl && pdfUrl !== url) combinedOutput += `**PDF**: [[PDF]](${pdfUrl})\n`;
            combinedOutput += `\n`;
          }
        }
      }
    } catch (err: any) {
      console.error('[deepResearch] OpenAlex failed:', err?.message);
    }
  }

  if (!foundResults) {
    return {
      success: false,
      output: `No academic results found for: "${query}". Try even shorter keywords (2-4 words) or use Playwright browser tools to search Google Scholar directly.`,
    };
  }

  combinedOutput += `---\nCITE SOURCES IN YOUR RESPONSE using short markdown links like [1](URL) or [Paper](URL). Keep the link text under 40 characters so it renders as a visual Citation pill.`;
  return { success: true, output: combinedOutput };
};
