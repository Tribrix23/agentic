/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import type { DocOpsTool } from './types';

/**
 * Phase 0 tool catalog — 5 read tools + 2 write tools.
 * Sent verbatim to the Anthropic messages API as the `tools` array.
 */
export const DOCOPS_CATALOG: DocOpsTool[] = [
  {
    name: 'get_outline',
    description:
      'Returns the document heading tree. Call this first to orient yourself before making structural changes.',
    input_schema: {
      type: 'object',
      properties: {
        maxDepth: {
          type: 'number',
          description: 'Maximum heading depth to include (1–9). Defaults to 6.',
        },
      },
    },
  },
  {
    name: 'get_selection',
    description:
      'Returns information about the current editor selection: text content, block IDs, and character count.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_doc_stats',
    description:
      'Returns document statistics: word count, paragraph count, table count, image count, heading levels, and a short text preview. To summarize or answer questions about the content, use search_document — do NOT rely on the preview alone.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'search_document',
    description:
      'Retrieve the passages of the document most relevant to a natural-language query (top-k chunks with their heading path and block IDs). Use this — NOT get_doc_stats — to summarize, answer questions, or locate content to edit in anything longer than a couple of paragraphs. Edit via the returned blockIds.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to look for, in natural language.',
        },
        k: {
          type: 'number',
          description: 'Max passages to return (1–8). Defaults to 5.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_workspace',
    description:
      "Retrieve relevant passages from the user's OTHER local files (the open folder/workspace), not just the current document. Returns passages each tagged with their source file so you can cite them. Use when the question spans multiple documents ('what did we say about X across my files'). Only available when a workspace folder is open.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to look for across the workspace, in natural language.',
        },
        k: {
          type: 'number',
          description: 'Max passages to return (1–8). Defaults to 6.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_styles',
    description: 'Lists paragraph styles and fonts used in the document, sorted by frequency.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'find_text',
    description:
      'Search for text in the document. Returns matching block IDs and surrounding snippets.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The text to search for (case-insensitive).',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return. Defaults to 10.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'convert_range_to_table',
    description:
      'Converts the current editor selection (tab- or comma-delimited paragraphs) into a table. The user must have the relevant text selected first.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'insert_toc',
    description:
      "Inserts a Table of Contents at the cursor position, built from the document's heading structure.",
    input_schema: {
      type: 'object',
      properties: {},
    },
  },

  // ── Phase 1: mutation tools (suggestion / tracked-change path) ────────────
  {
    name: 'suggest_text_change',
    description:
      "Suggest a text change in a paragraph as a tracked change — the user sees a diff in the sidebar and can Accept or Reject it. Pass search='' to insert text at the end of the paragraph; pass replaceWith='' to delete the matched text.",
    input_schema: {
      type: 'object',
      properties: {
        paraId: {
          type: 'string',
          description: 'Stable block ID of the paragraph (from get_outline or find_text).',
        },
        search: {
          type: 'string',
          description:
            "Exact text to replace (case-sensitive). Use '' to append to the paragraph end.",
        },
        replaceWith: {
          type: 'string',
          description: "Replacement text. Use '' to delete the matched text.",
        },
      },
      required: ['paraId', 'search', 'replaceWith'],
    },
  },
  {
    name: 'set_paragraph_style',
    description:
      "Apply a paragraph style to a block. Use this to set heading levels, list styles, etc. Common styleIds: 'Heading1'–'Heading6', 'Normal', 'ListParagraph', 'Quote'. Call list_styles first to see styles actually present in this document.",
    input_schema: {
      type: 'object',
      properties: {
        paraId: {
          type: 'string',
          description: 'Stable block ID of the paragraph.',
        },
        styleId: {
          type: 'string',
          description:
            "Paragraph style ID. Examples: 'Heading1', 'Heading2', 'Normal', 'ListParagraph'.",
        },
      },
      required: ['paraId', 'styleId'],
    },
  },
  {
    name: 'add_comment',
    description:
      'Add a review comment anchored to a paragraph (optionally to a specific phrase within it). The comment appears in the comments sidebar.',
    input_schema: {
      type: 'object',
      properties: {
        paraId: {
          type: 'string',
          description: 'Stable block ID of the paragraph.',
        },
        text: {
          type: 'string',
          description: 'The comment text.',
        },
        search: {
          type: 'string',
          description:
            'Optional: a unique phrase in the paragraph to anchor the comment to. Omit to anchor to the whole paragraph.',
        },
      },
      required: ['paraId', 'text'],
    },
  },
  // ── Phase 3: composite tools ──────────────────────────────────────────────
  {
    name: 'get_block',
    description:
      'Return detailed information about a single paragraph block: full text, ' +
      'per-run formatting (bold, italic, underline, font, size), and paragraph attrs ' +
      '(styleId, alignment, outlineLevel). ' +
      'Use when suggest_text_change needs an exact phrase and find_text snippets are truncated.',
    input_schema: {
      type: 'object',
      properties: {
        blockId: {
          type: 'string',
          description: 'Stable block ID of the paragraph (from get_outline or find_text).',
        },
      },
      required: ['blockId'],
    },
  },
  {
    name: 'harmonize_styles',
    description:
      'Apply bulk style corrections in one undoable edit. ' +
      'Call list_styles first to identify inconsistencies, then call this with explicit targets. ' +
      'headingRemap: map old heading styleId → new styleId to close non-sequential gaps ' +
      '(e.g. {"Heading4":"Heading3"}). ' +
      'unifyFont: font family to apply to all body-text runs that currently use a different font. ' +
      'Changes are applied directly (not as tracked changes); the user can Undo the whole batch.',
    input_schema: {
      type: 'object',
      properties: {
        headingRemap: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description:
            'Map of old heading styleId to new. Example: {"Heading4":"Heading3"} to close a gap.',
        },
        unifyFont: {
          type: 'string',
          description:
            'Font family to apply to all body-text runs that currently use a different font.',
        },
      },
    },
  },
  {
    name: 'rewrite_selection',
    description:
      'Rewrite the current editor selection with new text as a tracked change. ' +
      'Always call get_selection first to confirm there is a selection and read ' +
      'the text you are replacing. The user sees the old text struck through and ' +
      'the new text highlighted in the sidebar.',
    input_schema: {
      type: 'object',
      properties: {
        new_text: {
          type: 'string',
          description: 'The replacement text for the selected content.',
        },
      },
      required: ['new_text'],
    },
  },
  {
    name: 'delete_paragraphs',
    description:
      'Mark one or more paragraphs for deletion as tracked changes. ' +
      'The user can Accept to confirm or Reject to restore them. ' +
      'Pass the paraIds from get_outline or find_text.',
    input_schema: {
      type: 'object',
      properties: {
        paraIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Block IDs of the paragraphs to delete.',
        },
      },
      required: ['paraIds'],
    },
  },
  {
    name: 'insert_paragraph_after',
    description:
      'Insert a new paragraph after an existing block as a tracked change. ' +
      'Use for adding new content: summaries, conclusions, introductions, ' +
      'section starters. The user reviews and accepts from the sidebar.',
    input_schema: {
      type: 'object',
      properties: {
        paraId: {
          type: 'string',
          description: 'Block ID of the paragraph after which to insert.',
        },
        text: {
          type: 'string',
          description: 'The text content of the new paragraph.',
        },
        styleId: {
          type: 'string',
          description: "Optional paragraph style. Defaults to 'Normal'.",
        },
      },
      required: ['paraId', 'text'],
    },
  },
  {
    name: 'insert_report_from_data',
    description:
      'Insert a formatted report section — a heading and a table — built from structured data. ' +
      'Use when the user provides data (e.g. a list of items, metrics, or comparisons) and wants ' +
      'it formatted as a document table. Columns become the header row; each row becomes a data row. ' +
      'Pass afterParaId to control placement; omit to append at the end of the document.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Heading for the report section (inserted as Heading 2 above the table).',
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Column header labels (left to right).',
        },
        rows: {
          type: 'array',
          items: { type: 'array', items: { type: 'string' } },
          description:
            'Data rows. Each inner array must have the same number of entries as columns.',
        },
        afterParaId: {
          type: 'string',
          description:
            'Block ID of the paragraph after which to insert. Omit to append at the end of the document.',
        },
      },
      required: ['title', 'columns', 'rows'],
    },
  },
  {
    name: 'create_document',
    description:
      'Replace the entire document content with a new document built from a structured spec. ' +
      'DESTRUCTIVE — this is a direct edit, not a tracked change. ' +
      'Always call get_doc_stats first and confirm wordCount === 0 before using this tool. ' +
      'Use only when the user explicitly asks to create a new document from scratch.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Document title (inserted as Heading 1).',
        },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: {
                type: 'string',
                description: 'Section heading text.',
              },
              level: {
                type: 'number',
                description: 'Heading level: 2 or 3. Defaults to 2.',
              },
              paragraphs: {
                type: 'array',
                items: { type: 'string' },
                description: 'Body paragraphs for this section, in order.',
              },
            },
            required: ['heading'],
          },
          description: 'Document sections in order.',
        },
      },
      required: ['title', 'sections'],
    },
  },
];
