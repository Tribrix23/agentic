/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Character Spacing Dialog (Phase 1.5 U1).
 *
 * Matches Word's Format > Font > Advanced tab — Scale, Spacing
 * (expanded/condensed by N pt), Position (raised/lowered by N pt),
 * and Kerning threshold. Backed by the `characterSpacing` mark whose
 * OOXML round-trip (w:w / w:spacing / w:position / w:kern) was already
 * wired in the run parser/serializer.
 */
import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from '../../i18n';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

export interface CharacterSpacingValue {
  /** Horizontal text scale, percent (w:w). null = default 100%. */
  scale: number | null;
  /** Letter-spacing in twips (w:spacing). null/0 = normal. */
  spacing: number | null;
  /** Baseline shift in half-points (w:position). null/0 = normal. */
  position: number | null;
  /** Kerning threshold in half-points (w:kern). null = off. */
  kerning: number | null;
}

export interface CharacterSpacingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialValue: CharacterSpacingValue;
  onSubmit: (value: CharacterSpacingValue) => void;
}

type SpacingMode = 'normal' | 'expanded' | 'condensed';
type PositionMode = 'normal' | 'raised' | 'lowered';

const SCALE_OPTIONS = [200, 150, 100, 90, 80, 66, 50, 33];

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '110px 1fr 92px',
  alignItems: 'center',
  gap: 10,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--doc-text-on-surface)',
};

const inputStyle: CSSProperties = {
  padding: '4px 8px',
  border: '1px solid var(--doc-border)',
  borderRadius: 4,
  fontSize: 13,
  background: '#ffffff',
  color: 'var(--doc-text-on-surface)',
  boxSizing: 'border-box',
  width: '100%',
};

/** twips → pt (20 twips per pt). */
function twipsToPt(twips: number | null): number {
  if (twips == null) return 0;
  return twips / 20;
}
/** pt → twips. */
function ptToTwips(pt: number): number {
  return Math.round(pt * 20);
}
/** half-points → pt. */
function halfPtToPt(hp: number | null): number {
  if (hp == null) return 0;
  return hp / 2;
}
/** pt → half-points. */
function ptToHalfPt(pt: number): number {
  return Math.round(pt * 2);
}

function modeFromSpacing(spacing: number | null): SpacingMode {
  if (!spacing) return 'normal';
  return spacing > 0 ? 'expanded' : 'condensed';
}
function modeFromPosition(position: number | null): PositionMode {
  if (!position) return 'normal';
  return position > 0 ? 'raised' : 'lowered';
}

export function CharacterSpacingDialog({
  isOpen,
  onClose,
  initialValue,
  onSubmit,
}: CharacterSpacingDialogProps): React.ReactElement | null {
  const { t } = useTranslation();

  const [scale, setScale] = useState<number>(initialValue.scale ?? 100);
  const [spacingMode, setSpacingMode] = useState<SpacingMode>(
    modeFromSpacing(initialValue.spacing)
  );
  const [spacingByPt, setSpacingByPt] = useState<number>(Math.abs(twipsToPt(initialValue.spacing)));
  const [positionMode, setPositionMode] = useState<PositionMode>(
    modeFromPosition(initialValue.position)
  );
  const [positionByPt, setPositionByPt] = useState<number>(
    Math.abs(halfPtToPt(initialValue.position))
  );
  const [kerningEnabled, setKerningEnabled] = useState<boolean>(initialValue.kerning != null);
  const [kerningPt, setKerningPt] = useState<number>(halfPtToPt(initialValue.kerning) || 12);

  useEffect(() => {
    if (!isOpen) return;
    setScale(initialValue.scale ?? 100);
    setSpacingMode(modeFromSpacing(initialValue.spacing));
    setSpacingByPt(Math.abs(twipsToPt(initialValue.spacing)));
    setPositionMode(modeFromPosition(initialValue.position));
    setPositionByPt(Math.abs(halfPtToPt(initialValue.position)));
    setKerningEnabled(initialValue.kerning != null);
    setKerningPt(halfPtToPt(initialValue.kerning) || 12);
  }, [isOpen, initialValue]);

  const submit = () => {
    const next: CharacterSpacingValue = {
      scale: scale === 100 ? null : scale,
      spacing:
        spacingMode === 'normal' || spacingByPt === 0
          ? null
          : ptToTwips(spacingByPt) * (spacingMode === 'condensed' ? -1 : 1),
      position:
        positionMode === 'normal' || positionByPt === 0
          ? null
          : ptToHalfPt(positionByPt) * (positionMode === 'lowered' ? -1 : 1),
      kerning: kerningEnabled ? ptToHalfPt(kerningPt) : null,
    };
    onSubmit(next);
    onClose();
  };

  const previewStyle = useMemo<CSSProperties>(() => {
    const s: CSSProperties = {
      padding: '10px 12px',
      border: '1px dashed var(--doc-border)',
      borderRadius: 4,
      fontSize: 14,
      lineHeight: 1.4,
      color: 'var(--doc-text-on-surface)',
      background: 'var(--doc-surface-muted, #fafafa)',
      minHeight: 40,
    };
    if (scale !== 100) s.transform = `scaleX(${scale / 100})`;
    if (spacingMode !== 'normal' && spacingByPt > 0) {
      const px = (spacingByPt * 96) / 72;
      s.letterSpacing = `${spacingMode === 'condensed' ? -px : px}px`;
    }
    return s;
  }, [scale, spacingMode, spacingByPt]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('dialogs.characterSpacing.title')}
      width={520}
      testId="character-spacing-dialog"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={submit}
            data-testid="character-spacing-ok"
          >
            {t('common.ok')}
          </Button>
        </>
      }
    >
      <div
        style={bodyStyle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') submit();
        }}
      >
        <div style={rowStyle}>
          <label style={labelStyle} htmlFor="cs-scale">
            {t('dialogs.characterSpacing.scale')}
          </label>
          <select
            id="cs-scale"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            style={inputStyle}
            data-testid="character-spacing-scale"
          >
            {SCALE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}%
              </option>
            ))}
          </select>
          <span />
        </div>

        <div style={rowStyle}>
          <label style={labelStyle} htmlFor="cs-spacing">
            {t('dialogs.characterSpacing.spacing')}
          </label>
          <select
            id="cs-spacing"
            value={spacingMode}
            onChange={(e) => setSpacingMode(e.target.value as SpacingMode)}
            style={inputStyle}
            data-testid="character-spacing-spacing"
          >
            <option value="normal">{t('dialogs.characterSpacing.normal')}</option>
            <option value="expanded">{t('dialogs.characterSpacing.expanded')}</option>
            <option value="condensed">{t('dialogs.characterSpacing.condensed')}</option>
          </select>
          <input
            type="number"
            min={0}
            step={0.1}
            value={spacingByPt}
            disabled={spacingMode === 'normal'}
            onChange={(e) => setSpacingByPt(Number(e.target.value))}
            style={inputStyle}
            aria-label={t('dialogs.characterSpacing.spacingBy')}
            data-testid="character-spacing-spacing-by"
          />
        </div>

        <div style={rowStyle}>
          <label style={labelStyle} htmlFor="cs-position">
            {t('dialogs.characterSpacing.position')}
          </label>
          <select
            id="cs-position"
            value={positionMode}
            onChange={(e) => setPositionMode(e.target.value as PositionMode)}
            style={inputStyle}
            data-testid="character-spacing-position"
          >
            <option value="normal">{t('dialogs.characterSpacing.normal')}</option>
            <option value="raised">{t('dialogs.characterSpacing.raised')}</option>
            <option value="lowered">{t('dialogs.characterSpacing.lowered')}</option>
          </select>
          <input
            type="number"
            min={0}
            step={0.5}
            value={positionByPt}
            disabled={positionMode === 'normal'}
            onChange={(e) => setPositionByPt(Number(e.target.value))}
            style={inputStyle}
            aria-label={t('dialogs.characterSpacing.positionBy')}
            data-testid="character-spacing-position-by"
          />
        </div>

        <div style={rowStyle}>
          <label style={labelStyle}>
            <input
              type="checkbox"
              checked={kerningEnabled}
              onChange={(e) => setKerningEnabled(e.target.checked)}
              style={{ marginRight: 6, verticalAlign: 'middle' }}
              data-testid="character-spacing-kerning"
            />
            {t('dialogs.characterSpacing.kerning')}
          </label>
          <span style={{ fontSize: 12, color: 'var(--doc-text-muted)' }}>
            {t('dialogs.characterSpacing.kerningHint')}
          </span>
          <input
            type="number"
            min={1}
            step={0.5}
            value={kerningPt}
            disabled={!kerningEnabled}
            onChange={(e) => setKerningPt(Number(e.target.value))}
            style={inputStyle}
            aria-label={t('dialogs.characterSpacing.kerningThreshold')}
            data-testid="character-spacing-kerning-pt"
          />
        </div>

        <div style={{ marginTop: 4 }}>
          <div
            style={{
              fontSize: 12,
              color: 'var(--doc-text-muted)',
              marginBottom: 4,
            }}
          >
            {t('dialogs.characterSpacing.preview')}
          </div>
          <div style={previewStyle}>{t('dialogs.characterSpacing.previewSample')}</div>
        </div>
      </div>
    </Dialog>
  );
}

export default CharacterSpacingDialog;
