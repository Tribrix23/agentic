/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from '../../i18n';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

export interface SplitCellDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (rows: number, cols: number) => void;
  initialRows?: number;
  initialCols?: number;
  minRows?: number;
  minCols?: number;
}

// Body / form styles only — backdrop, header, close-X, footer chrome and
// motion are owned by the shared <Dialog> shell.
const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const labelStyle: CSSProperties = {
  width: 88,
  fontSize: 13,
  color: 'var(--doc-text-muted)',
};

const inputStyle: CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  border: '1px solid var(--doc-border)',
  borderRadius: 4,
  fontSize: 13,
};

const helperStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--doc-text-muted)',
  lineHeight: 1.5,
};

const errorStyle: CSSProperties = {
  ...helperStyle,
  color: 'var(--doc-error)',
};

export function SplitCellDialog({
  isOpen,
  onClose,
  onApply,
  initialRows = 1,
  initialCols = 1,
  minRows = 1,
  minCols = 1,
}: SplitCellDialogProps): React.ReactElement {
  const { t } = useTranslation();
  const [rows, setRows] = useState(initialRows);
  const [cols, setCols] = useState(initialCols);

  useEffect(() => {
    if (isOpen) {
      setRows(initialRows);
      setCols(initialCols);
    }
  }, [initialCols, initialRows, isOpen]);

  const validationError = useMemo(() => {
    if (rows < minRows || cols < minCols) {
      return t('dialogs.splitCell.minValue', { rows: minRows, cols: minCols });
    }
    if (rows === 1 && cols === 1) {
      return t('dialogs.splitCell.notOneByOne');
    }
    return null;
  }, [cols, minCols, minRows, rows, t]);

  const handleApply = useCallback(() => {
    if (validationError) return;
    onApply(rows, cols);
    onClose();
  }, [cols, onApply, onClose, rows, validationError]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') handleApply();
    },
    [handleApply]
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('dialogs.splitCell.title')}
      width={440}
      testId="split-cell-dialog"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!!validationError}
            onClick={handleApply}
          >
            {t('common.apply')}
          </Button>
        </>
      }
    >
      {/* Enter-to-apply handled here; Esc dismissal owned by the shell. */}
      <div style={bodyStyle} onKeyDown={handleKeyDown}>
        <div style={helperStyle}>{t('dialogs.splitCell.description')}</div>

        <div style={rowStyle}>
          <label style={labelStyle}>{t('dialogs.splitCell.rowsLabel')}</label>
          <input
            type="number"
            style={inputStyle}
            min={minRows}
            step={1}
            value={rows}
            onChange={(event) => setRows(Math.max(0, Number(event.target.value) || 0))}
          />
        </div>

        <div style={rowStyle}>
          <label style={labelStyle}>{t('dialogs.splitCell.columnsLabel')}</label>
          <input
            type="number"
            style={inputStyle}
            min={minCols}
            step={1}
            value={cols}
            onChange={(event) => setCols(Math.max(0, Number(event.target.value) || 0))}
          />
        </div>

        <div style={validationError ? errorStyle : helperStyle}>
          {validationError ??
            t('dialogs.splitCell.currentMinimum', { rows: minRows, cols: minCols })}
        </div>
      </div>
    </Dialog>
  );
}

export default SplitCellDialog;
