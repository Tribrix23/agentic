/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * ShareDialog — the editor's built-in "share this live document" surface.
 *
 * Mounted by CasualEditor and wired to PresenceCluster's Share button; it
 * only appears when collab is active (a `backendUrl` is set), so standalone
 * docs never see it.
 *
 * MVP scope (matches the sister sheet app's anonymous-room links): the doc is
 * ALREADY in a live room — the room id is the `docId` the editor is connected
 * to — so sharing is just handing out the current room URL with a role query
 * param. `edit` links carry no param (the room's default is editable); `view`
 * and `comment` links append `?role=…`, which the collab server's anonymous
 * join path honours (view/comment → read-only; see collab's
 * `auth/join-role.ts`).
 *
 * TODO(share-token): server-ENFORCED secure links (a minted `?share=<token>`
 * whose role can't be changed by editing the URL) live behind the collab
 * server's `/files/:id/shares` routes and need a saved server file id. That is
 * a follow-up; the `?role=` param here is a client-side hint only.
 */

import { useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import { Dialog } from './ui/Dialog';
import { MaterialSymbol } from './ui/Icons';
import { useTranslation } from '../i18n';

/** The three roles a share link can grant. Mirrors the collab server's
 *  `view | comment | edit` share roles. */
export type ShareRole = 'view' | 'comment' | 'edit';

export interface ShareDialogProps {
  /** Show / hide anchor so the host can render unconditionally. */
  isOpen: boolean;
  /** Invoked on close (X / Esc / backdrop / Done). */
  onClose: () => void;
  /**
   * Room the editor is connected to (the collab `docId`). Reserved for the
   * token-mint path (see file header TODO); today the link is derived from
   * the current location so it points at whatever route loaded this room.
   */
  roomId: string;
  /**
   * Base URL the share link is built from. Defaults to the current
   * `window.location.href`. Injectable so the pure builder is testable and
   * hosts embedding under a custom route can override it.
   */
  baseHref?: string;
}

/**
 * Build a shareable room URL for `role` from `baseHref`. Pure + exported so
 * the role→URL mapping is unit-testable without a DOM. `edit` clears the
 * `role` param (the room default is editable); `view`/`comment` set it.
 */
export function buildShareUrl(baseHref: string, role: ShareRole): string {
  const url = new URL(baseHref);
  if (role === 'edit') {
    url.searchParams.delete('role');
  } else {
    url.searchParams.set('role', role);
  }
  return url.toString();
}

const ROLE_ORDER: ShareRole[] = ['edit', 'comment', 'view'];

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 16,
};

const labelStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 500,
  color: 'var(--doc-text-muted)',
};

const selectStyle: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--doc-border)',
  background: '#ffffff',
  color: 'var(--doc-text)',
  fontSize: 14,
  cursor: 'pointer',
};

const linkRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'stretch',
};

const linkInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--doc-border)',
  background: 'var(--doc-surface-muted)',
  color: 'var(--doc-text)',
  fontSize: 13,
  fontFamily: 'var(--doc-font-mono, ui-monospace, monospace)',
};

const copyBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--doc-border)',
  background: '#ffffff',
  color: 'var(--doc-text)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const noteStyle: CSSProperties = {
  margin: '4px 0 0',
  fontSize: 12,
  lineHeight: 1.45,
  color: 'var(--doc-text-muted)',
};

const doneBtnStyle: CSSProperties = {
  padding: '7px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--doc-accent, #2563eb)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

export function ShareDialog({
  isOpen,
  onClose,
  roomId,
  baseHref,
}: ShareDialogProps): ReactElement | null {
  const { t } = useTranslation();
  const [role, setRole] = useState<ShareRole>('edit');
  const [copied, setCopied] = useState(false);

  // `roomId` isn't used to build the URL yet (see file header TODO) — reference
  // it so the reserved prop doesn't read as dead to lint / reviewers.
  void roomId;

  const href = baseHref ?? (typeof window !== 'undefined' ? window.location.href : 'about:blank');
  const shareUrl = useMemo(() => buildShareUrl(href, role), [href, role]);

  const roleLabel: Record<ShareRole, string> = {
    view: t('share.roleView'),
    comment: t('share.roleComment'),
    edit: t('share.roleEdit'),
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the field is still selectable */
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('share.title')}
      icon={<MaterialSymbol name="share" size={18} />}
      width={460}
      testId="share-dialog"
      footer={
        <button
          type="button"
          onClick={onClose}
          style={doneBtnStyle}
          data-testid="share-dialog-done"
        >
          {t('share.done')}
        </button>
      }
    >
      <p style={{ margin: '0 0 16px', color: 'var(--doc-text-muted)', fontSize: 13 }}>
        {t('share.description')}
      </p>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="share-dialog-role">
          {t('share.roleLabel')}
        </label>
        <select
          id="share-dialog-role"
          style={selectStyle}
          value={role}
          data-testid="share-dialog-role"
          onChange={(e) => setRole(e.target.value as ShareRole)}
        >
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>
              {roleLabel[r]}
            </option>
          ))}
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="share-dialog-link">
          {t('share.linkLabel')}
        </label>
        <div style={linkRowStyle}>
          <input
            id="share-dialog-link"
            type="text"
            readOnly
            style={linkInputStyle}
            value={shareUrl}
            data-testid="share-dialog-link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            style={copyBtnStyle}
            onClick={() => void copy()}
            data-testid="share-dialog-copy"
          >
            <MaterialSymbol name={copied ? 'check' : 'content_copy'} size={16} />
            {copied ? t('share.copied') : t('share.copy')}
          </button>
        </div>
      </div>

      <p style={noteStyle}>{t('share.secureNote')}</p>
    </Dialog>
  );
}

export default ShareDialog;
