/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { useEffect, useRef, useState } from 'react';
import type { Comment } from '@eigenpal/docx-core/types/content';
import { MaterialSymbol } from '../ui/Icons';
import { Tooltip } from '../ui/Tooltip';
import type { SidebarItemRenderProps } from '../../plugin-api/types';
import {
  getCommentText,
  formatDate,
  getInitials,
  avatarStyle,
  ICON_BUTTON_STYLE,
} from './cardUtils';
import { ReplyThread } from './ReplyThread';
import { ReplyInput } from './ReplyInput';
import { CARD_STYLE_COLLAPSED, CARD_STYLE_EXPANDED } from './cardStyles';
import { renderCommentText } from './mentionText';
import { useTranslation } from '../../i18n';

export interface CommentCardProps extends SidebarItemRenderProps {
  comment: Comment;
  replies: Comment[];
  onReply?: (commentId: number, text: string) => void;
  onResolve?: (commentId: number) => void;
  onUnresolve?: (commentId: number) => void;
  onDelete?: (commentId: number) => void;
  /** Authors that should be chipped when @-mentioned in comment text.
   *  Random `@something` strings stay plain. */
  knownAuthors?: readonly string[];
}

export function CommentCard({
  comment,
  replies,
  isExpanded,
  onToggleExpand,
  measureRef,
  onReply,
  onResolve,
  onUnresolve,
  onDelete,
  knownAuthors = [],
}: CommentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Two-step confirm for the destructive, non-undoable delete: the first click
  // arms it, the second (a distinct button) commits — so a comment thread can't
  // be lost to a stray click (audit: unconfirmed comment-thread delete).
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Close the menu on Escape + auto-focus the first menu item on open
  // so keyboard users can act without reaching for the mouse. Also
  // click-outside-to-close so opening the menu doesn't trap focus.
  useEffect(() => {
    // Re-arm the confirm each time the menu closes so it never re-opens
    // pre-confirmed.
    if (!menuOpen) {
      setConfirmingDelete(false);
      return;
    }
    // Auto-focus first menu item when the popup mounts.
    const first = menuRef.current?.querySelector('button');
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMenuOpen(false);
        // Return focus to the trigger — standard menu pattern.
        menuTriggerRef.current?.focus();
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (menuTriggerRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [menuOpen]);
  const { t } = useTranslation();

  return (
    <div
      ref={measureRef}
      data-comment-id={comment.id}
      className="docx-comment-card"
      onClick={onToggleExpand}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        ...(isExpanded ? CARD_STYLE_EXPANDED : CARD_STYLE_COLLAPSED),
      }}
    >
      {comment.done && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            marginBottom: 8,
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--doc-success)',
            backgroundColor: 'var(--doc-success-bg)',
            borderRadius: 10,
          }}
        >
          <MaterialSymbol name="check" size={12} />
          {t('comments.resolved')}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={avatarStyle(comment.author || 'U')}>{getInitials(comment.author || 'U')}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--doc-text-on-surface, #1f2937)' }}
          >
            {comment.author || t('comments.unknown')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--doc-text-muted)' }}>
            {formatDate(comment.date)}
          </div>
        </div>
        {isExpanded && (
          <div style={{ display: 'flex', gap: 4, marginTop: 2, position: 'relative' }}>
            <Tooltip content={comment.done ? t('comments.reopen') : t('comments.resolve')}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (comment.done) {
                    onUnresolve?.(comment.id);
                  } else {
                    onResolve?.(comment.id);
                  }
                }}
                aria-label={comment.done ? t('comments.reopen') : t('comments.resolve')}
                style={ICON_BUTTON_STYLE}
              >
                <MaterialSymbol name={comment.done ? 'undo' : 'check'} size={20} />
              </button>
            </Tooltip>
            <Tooltip content={t('comments.moreOptions')}>
              <button
                ref={menuTriggerRef}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                }}
                aria-label={t('comments.moreOptions')}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                style={ICON_BUTTON_STYLE}
              >
                <MaterialSymbol name="more_vert" size={20} />
              </button>
            </Tooltip>
            {menuOpen && (
              <div
                ref={menuRef}
                role="menu"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 0,
                  background: '#ffffff',
                  borderRadius: 8,
                  boxShadow: '0 2px 6px rgba(60,64,67,0.3), 0 1px 2px rgba(60,64,67,0.15)',
                  zIndex: 100,
                  minWidth: 120,
                  padding: '4px 0',
                }}
              >
                {!confirmingDelete ? (
                  <button
                    role="menuitem"
                    data-testid="comment-delete"
                    onClick={() => setConfirmingDelete(true)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '8px 16px',
                      border: 'none',
                      background: 'none',
                      textAlign: 'left',
                      fontSize: 14,
                      color: 'var(--doc-text-on-surface, #1f2937)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    onMouseOver={(e) => {
                      (e.target as HTMLElement).style.backgroundColor =
                        'var(--doc-bg-hover, #f1f3f4)';
                    }}
                    onMouseOut={(e) => {
                      (e.target as HTMLElement).style.backgroundColor = 'transparent';
                    }}
                  >
                    {t('common.delete')}
                  </button>
                ) : (
                  <div style={{ padding: '8px 12px' }} role="group" aria-label={t('common.delete')}>
                    <div
                      style={{
                        fontSize: 13,
                        marginBottom: 8,
                        color: 'var(--doc-text-on-surface, #1f2937)',
                      }}
                    >
                      {t('comments.confirmDelete')}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        role="menuitem"
                        data-testid="comment-delete-confirm"
                        onClick={() => {
                          setMenuOpen(false);
                          onDelete?.(comment.id);
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          border: 'none',
                          borderRadius: 6,
                          background: 'var(--doc-danger, #d93025)',
                          color: '#fff',
                          fontSize: 13,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {t('common.delete')}
                      </button>
                      <button
                        role="menuitem"
                        data-testid="comment-delete-cancel"
                        onClick={() => setConfirmingDelete(false)}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          border: '1px solid var(--doc-border, #dadce0)',
                          borderRadius: 6,
                          background: 'none',
                          color: 'var(--doc-text-on-surface, #1f2937)',
                          fontSize: 13,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: 13,
          color: 'var(--doc-text-on-surface, #1f2937)',
          lineHeight: '20px',
          marginTop: 6,
        }}
      >
        {renderCommentText(getCommentText(comment.content), knownAuthors)}
      </div>

      <ReplyThread replies={replies} isExpanded={isExpanded} />

      {isExpanded && !comment.done && (
        <ReplyInput onSubmit={(text) => onReply?.(comment.id, text)} />
      )}
    </div>
  );
}
