import { ToolDefinition, ToolHandler, ToolResult } from '../types';


export const definition: ToolDefinition = {
  name: 'deepResearch',
  description: 'Search the web using Playwright MCP, navigate to the top results, scroll the page to trigger lazy loading, and extract the content for deep research. Returns citation-friendly summaries.',
  category: 'search',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query to research.' },
      maxUrls: { type: 'number', description: 'Maximum number of pages to read (default 2)' },
    },
    required: ['query'],
  },
  icon: 'Globe',
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 60000,
};

export const handler: ToolHandler = async (args, context): Promise<ToolResult> => {
  const query = args.query;
  const maxUrls = args.maxUrls || 2;

  try {
    // 1. Get search results via public SearXNG API
    const searchUrl = `https://searx.be/search?q=${encodeURIComponent(query)}&format=json`;
    let urls: { url: string, title: string, snippet: string }[] = [];
    
    try {
      const res = await fetch(searchUrl, { signal: context.signal });
      if (res.ok) {
        const data = await res.json();
        urls = (data.results || []).slice(0, maxUrls).map((r: any) => ({ url: r.url, title: r.title, snippet: r.content }));
      }
    } catch (err) {
      console.error('SearXNG fetch failed', err);
    }

    if (urls.length === 0) {
      return { success: false, output: `No search results found for query: ${query}` };
    }

    let combinedOutput = `Found ${urls.length} relevant sources for "${query}".\n\n`;

    // 2. Use Playwright to visit and extract content
    for (const item of urls) {
      try {
        await (window as any).electron.mcp.callTool('playwright', 'browser_navigate', { url: item.url });
        
        // Wait 1.5 seconds for initial load
        await new Promise(r => setTimeout(r, 1500));

        // Scroll to bottom to trigger lazy load
        await (window as any).electron.mcp.callTool('playwright', 'browser_evaluate', { 
          function: "window.scrollTo(0, document.body.scrollHeight || 5000);" 
        });

        // Wait for lazy loaded content
        await new Promise(r => setTimeout(r, 1500));

        // Extract content using Readability logic (simplified via JS)
        const extractRes = await (window as any).electron.mcp.callTool('playwright', 'browser_evaluate', {
          function: `(() => {
            const bodyClone = document.body.cloneNode(true);
            const scripts = bodyClone.querySelectorAll('script, style, nav, footer, iframe, noscript');
            scripts.forEach(s => s.remove());
            return bodyClone.innerText.replace(/\\s+/g, ' ').slice(0, 5000);
          })()`
        }, context.signal);

        let content = extractRes?.output || "Could not extract text";
        if (typeof extractRes.data === 'object' && extractRes.data && 'content' in extractRes.data) {
           const c = (extractRes.data as any).content;
           if (Array.isArray(c) && c.length > 0 && c[0].text) {
              content = c[0].text;
           }
        }
        
        // Try parsing JSON if playwright returns serialized eval output
        try {
           const parsed = JSON.parse(content);
           if (typeof parsed === 'string') content = parsed;
        } catch(e) {}

        combinedOutput += `Source: [${item.title}](${item.url})\n`;
        combinedOutput += `Snippet: ${item.snippet}\n`;
        combinedOutput += `Content:\n${content.trim().slice(0, 3000)}...\n`;
        combinedOutput += `---\n`;
        
      } catch (pageErr: any) {
        combinedOutput += `Source: [${item.title}](${item.url})\n`;
        combinedOutput += `Failed to read page: ${pageErr?.message || String(pageErr)}\n---\n`;
      }
    }

    combinedOutput += `\nINSTRUCTIONS: When generating your final response based on this research, you MUST use inline citations pointing to the URLs like this: [Domain Name](${urls[0]?.url}) so the UI can render them via the Citation component!`;

    return { success: true, output: combinedOutput };
  } catch (err: any) {
    return { success: false, output: `Deep research failed: ${err.message || String(err)}` };
  }
};
