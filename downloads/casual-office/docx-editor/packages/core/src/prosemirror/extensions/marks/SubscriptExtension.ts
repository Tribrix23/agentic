/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Subscript Mark Extension
 */

import { createMarkExtension } from '../create';
import { toggleMark } from './markUtils';
import type { ExtensionContext, ExtensionRuntime } from '../types';

export const SubscriptExtension = createMarkExtension({
  name: 'subscript',
  schemaMarkName: 'subscript',
  markSpec: {
    excludes: 'superscript',
    parseDOM: [{ tag: 'sub' }],
    toDOM() {
      return ['sub', 0];
    },
  },
  onSchemaReady(ctx: ExtensionContext): ExtensionRuntime {
    return {
      commands: {
        toggleSubscript: () => toggleMark(ctx.schema.marks.subscript),
      },
      keyboardShortcuts: {
        // Google Docs: Ctrl+, for subscript
        'Mod-,': toggleMark(ctx.schema.marks.subscript),
      },
    };
  },
});
