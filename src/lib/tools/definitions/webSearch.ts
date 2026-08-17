import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'webSearch',
  description: 'Search the web for information using DuckDuckGo.',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      maxResults: { type: 'number', description: 'Maximum number of results (default: 10)' }
    },
    required: ['query']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 15000,
  icon: 'Globe'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { query, maxResults = 10 } = args;
    
    // Use DuckDuckGo's instant answer API (free, no API key needed)
    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=0`;
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    let output = `Web search results for: "${query}"\n\n`;
    
    // Add instant answer if available
    if (data.AbstractText) {
      output += `Instant Answer:\n${data.AbstractText}\n\n`;
    }
    
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      output += `Related Results:\n`;
      const count = Math.min(maxResults, data.RelatedTopics.length);
      for (let i = 0; i < count; i++) {
        const topic = data.RelatedTopics[i];
        if (topic.Text && topic.FirstURL) {
          const title = topic.Text.replace(/<[^>]*>/g, '').substring(0, 100);
          output += `\n${i + 1}. ${title}\n   ${topic.FirstURL}\n`;
        }
      }
    }
    
    if (data.AbstractURL) {
      output += `\nRead more: ${data.AbstractURL}\n`;
    }
    
    if (output === `Web search results for: "${query}"\n\n`) {
      return { success: false, output: 'No results found. Try a different search query.' };
    }
    
    return { success: true, output };
  } catch (error: any) {
    return { success: false, output: `Web search failed: ${error.message || String(error)}` };
  }
};
