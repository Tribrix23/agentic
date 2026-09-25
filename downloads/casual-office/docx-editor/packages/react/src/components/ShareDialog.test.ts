/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Unit coverage for the pure role→URL mapping behind ShareDialog. The DOM
 * dialog itself is exercised by the app-level e2e suite; here we pin the
 * contract the copy button depends on.
 */
import { describe, expect, it } from 'bun:test';

import { buildShareUrl } from './ShareDialog';

describe('buildShareUrl', () => {
  const base = 'https://docs.example.com/r/abc123';

  it('omits the role param for edit (the room default is editable)', () => {
    expect(buildShareUrl(base, 'edit')).toBe(base);
  });

  it('sets role=view for a view-only link', () => {
    expect(buildShareUrl(base, 'view')).toBe(`${base}?role=view`);
  });

  it('sets role=comment for a comment link', () => {
    expect(buildShareUrl(base, 'comment')).toBe(`${base}?role=comment`);
  });

  it('replaces an existing role param rather than appending a second one', () => {
    expect(buildShareUrl(`${base}?role=view`, 'comment')).toBe(`${base}?role=comment`);
    expect(buildShareUrl(`${base}?role=view`, 'edit')).toBe(base);
  });

  it('preserves unrelated query params', () => {
    const url = buildShareUrl(`${base}?theme=dark`, 'view');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('theme')).toBe('dark');
    expect(parsed.searchParams.get('role')).toBe('view');
  });
});
