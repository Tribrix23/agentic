/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Table Properties Dialog
 *
 * Modal for editing table-level settings:
 * - Preferred width (twips or percentage)
 * - Alignment (left, center, right)
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from '../../i18n';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

// ============================================================================
// TYPES
// ============================================================================

export interface TableProperties {
  width?: number | null;
  widthType?: string | null;
  justification?: 'left' | 'center' | 'right' | null;
  /** Banded rows = inverse of OOXML `w:noHBand` on `w:tblLook`. */
  bandedRows?: boolean;
  /** Banded columns = inverse of OOXML `w:noVBand` on `w:tblLook`. */
  bandedColumns?: boolean;
}

export interface TablePropertiesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (props: TableProperties) => void;
  currentProps?: {
    width?: number;
    widthType?: string;
    justification?: string;
    look?: {
      firstRow?: boolean;
      lastRow?: boolean;
      firstColumn?: boolean;
      lastColumn?: boolean;
      noHBand?: boolean;
      noVBand?: boolean;
    } | null;
  };
}

// ============================================================================
// STYLES
// ============================================================================

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
  width: 80,
  fontSize: 13,
  color: 'var(--doc-text-muted)',
};

const inputStyle: CSSProperties = {
  background: '#ffffff',
  color: 'var(--doc-text-on-surface)',
  flex: 1,
  padding: '6px 8px',
  border: '1px solid var(--doc-border)',
  borderRadius: 4,
  fontSize: 13,
};

const selectStyle: CSSProperties = {
  ...inputStyle,
};

// ============================================================================
// COMPONENT
// ============================================================================

export function TablePropertiesDialog({
  isOpen,
  onClose,
  onApply,
  currentProps,
}: TablePropertiesDialogProps): React.ReactElement | null {
  const { t } = useTranslation();
  const [width, setWidth] = useState<number>(currentProps?.width || 0);
  const [widthType, setWidthType] = useState<string>(currentProps?.widthType || 'auto');
  const [justification, setJustification] = useState<string>(currentProps?.justification || 'left');
  // Banded rows / columns are stored inverted on the table look attr
  // (noHBand=true means NO horizontal banding). Read with the inverse
  // so the checkbox sense is positive ("yes, alternate row shading").
  const [bandedRows, setBandedRows] = useState<boolean>(!currentProps?.look?.noHBand);
  const [bandedColumns, setBandedColumns] = useState<boolean>(!currentProps?.look?.noVBand);

  useEffect(() => {
    if (isOpen) {
      setWidth(currentProps?.width || 0);
      setWidthType(currentProps?.widthType || 'auto');
      setJustification(currentProps?.justification || 'left');
      setBandedRows(!currentProps?.look?.noHBand);
      setBandedColumns(!currentProps?.look?.noVBand);
    }
  }, [isOpen, currentProps]);

  const handleApply = useCallback(() => {
    const props: TableProperties = {};
    if (widthType === 'auto') {
      props.width = null;
      props.widthType = 'auto';
    } else {
      props.width = width;
      props.widthType = widthType;
    }
    props.justification = justification as 'left' | 'center' | 'right';
    props.bandedRows = bandedRows;
    props.bandedColumns = bandedColumns;
    onApply(props);
    onClose();
  }, [width, widthType, justification, bandedRows, bandedColumns, onApply, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Escape dismissal is owned by the <Dialog> shell.
      if (e.key === 'Enter') handleApply();
    },
    [handleApply]
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('dialogs.tableProperties.title')}
      width={440}
      testId="table-properties-dialog"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant="default" size="sm" onClick={handleApply}>
            {t('common.apply')}
          </Button>
        </>
      }
    >
      <div style={bodyStyle} onKeyDown={handleKeyDown}>
        {/* Width type */}
        <div style={rowStyle}>
          <label htmlFor="table-props-width-type" style={labelStyle}>
            {t('dialogs.tableProperties.widthType')}
          </label>
          <select
            id="table-props-width-type"
            style={selectStyle}
            value={widthType}
            onChange={(e) => setWidthType(e.target.value)}
          >
            <option value="auto">{t('dialogs.tableProperties.widthTypes.auto')}</option>
            <option value="dxa">{t('dialogs.tableProperties.widthTypes.fixed')}</option>
            <option value="pct">{t('dialogs.tableProperties.widthTypes.percentage')}</option>
          </select>
        </div>

        {/* Width value */}
        {widthType !== 'auto' && (
          <div style={rowStyle}>
            <label htmlFor="table-props-width" style={labelStyle}>
              {t('dialogs.tableProperties.widthLabel')}
            </label>
            <input
              id="table-props-width"
              type="number"
              style={inputStyle}
              min={0}
              step={widthType === 'pct' ? 5 : 100}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value) || 0)}
            />
            <span style={{ fontSize: 11, color: 'var(--doc-text-muted)' }}>
              {widthType === 'pct'
                ? t('dialogs.tableProperties.units.fiftiethsPercent')
                : t('dialogs.tableProperties.units.twips')}
            </span>
          </div>
        )}

        {/* Alignment */}
        <div style={rowStyle}>
          <label htmlFor="table-props-alignment" style={labelStyle}>
            {t('dialogs.tableProperties.alignmentLabel')}
          </label>
          <select
            id="table-props-alignment"
            style={selectStyle}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          >
            <option value="left">{t('dialogs.tableProperties.alignOptions.left')}</option>
            <option value="center">{t('dialogs.tableProperties.alignOptions.center')}</option>
            <option value="right">{t('dialogs.tableProperties.alignOptions.right')}</option>
          </select>
        </div>

        {/* Banded rows / columns — inverted senses of OOXML
                noHBand / noVBand. Renders as plain checkboxes since
                the values are independent booleans (matches Word's
                Table Design "Banded Rows" / "Banded Columns" check
                marks). */}
        <div style={rowStyle}>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              data-testid="table-props-banded-rows"
              checked={bandedRows}
              onChange={(e) => setBandedRows(e.target.checked)}
            />
            {t('dialogs.tableProperties.bandedRows')}
          </label>
        </div>
        <div style={rowStyle}>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              data-testid="table-props-banded-columns"
              checked={bandedColumns}
              onChange={(e) => setBandedColumns(e.target.checked)}
            />
            {t('dialogs.tableProperties.bandedColumns')}
          </label>
        </div>
      </div>
    </Dialog>
  );
}
