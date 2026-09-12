import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { GraduationCap, ShieldCheck, Globe, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';

interface CitationProps {
  href: string;
  title?: string;
  text: string;
}

// ── Trusted domain registry ────────────────────────────────────────────────
const TRUSTED_ACADEMIC_DOMAINS = new Set([
  'arxiv.org', 'pubmed.ncbi.nlm.nih.gov', 'scholar.google.com',
  'sciencedirect.com', 'nature.com', 'science.org', 'cell.com',
  'pnas.org', 'springer.com', 'wiley.com', 'jstor.org', 'semanticscholar.org',
  'openalex.org', 'researchgate.net', 'academia.edu', 'biorxiv.org',
  'medrxiv.org', 'ncbi.nlm.nih.gov', 'easychair.org', 'ieee.org',
  'acm.org', 'aps.org', 'oup.com',
]);

const TRUSTED_REFERENCE_DOMAINS = new Set([
  'britannica.com', 'wikipedia.org', 'biography.com', 'history.com',
  'nationalgeographic.com', 'smithsonianmag.com', 'pbs.org', 'bbc.com',
  'reuters.com', 'apnews.com', 'nytimes.com', 'theguardian.com', 'npr.org',
  'who.int', 'cdc.gov', 'nih.gov', 'nasa.gov', 'un.org',
]);

function getDomain(href: string): string {
  try { return new URL(href).hostname.replace(/^www\./, ''); }
  catch { return href; }
}

function getFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
}

function isTrustedDomain(domain: string): boolean {
  return (
    TRUSTED_ACADEMIC_DOMAINS.has(domain) ||
    TRUSTED_REFERENCE_DOMAINS.has(domain) ||
    domain.endsWith('.edu') ||
    domain.endsWith('.gov') ||
    domain.endsWith('.org')
  );
}

function isAcademicDomain(domain: string): boolean {
  return (
    TRUSTED_ACADEMIC_DOMAINS.has(domain) ||
    domain.endsWith('.edu') ||
    domain.includes('arxiv') ||
    domain.includes('pubmed') ||
    domain.includes('ncbi')
  );
}

function getTrustLabel(domain: string): string | null {
  if (TRUSTED_ACADEMIC_DOMAINS.has(domain)) return `${domain} is a peer-reviewed academic source`;
  if (domain.endsWith('.gov')) return `${domain} is an official government source`;
  if (domain.endsWith('.edu')) return `${domain} is an educational institution`;
  if (TRUSTED_REFERENCE_DOMAINS.has(domain)) return `${domain} is a trusted reference source`;
  if (domain.endsWith('.org')) return `${domain} is a non-profit organization`;
  return null;
}

// ── Citation pill + hover card ─────────────────────────────────────────────
export function Citation({ href, title, text }: CitationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [faviconError, setFaviconError] = useState(false);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number; placement: 'below' | 'above' }>({ top: 0, left: 0, placement: 'below' });

  const domain = getDomain(href);
  const trusted = isTrustedDomain(domain);
  const academic = isAcademicDomain(domain);
  const trustLabel = getTrustLabel(domain);
  const faviconUrl = getFaviconUrl(domain);

  // Derive display title and excerpt from the `title` prop
  // deepResearch formats titles as "Title - excerpt" or just "Title"
  const rawTitle = title || text;
  const dashIdx = rawTitle.indexOf(' - ');
  const displayTitle = dashIdx > -1 ? rawTitle.slice(0, dashIdx) : rawTitle;
  const excerpt = dashIdx > -1 ? rawTitle.slice(dashIdx + 3) : `Referenced source on ${domain}`;

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const cardWidth = 320;
    const cardHeight = 220; // approximate
    const margin = 12;
    const viewH = window.innerHeight;
    const viewW = window.innerWidth;

    let left = rect.left + rect.width / 2 - cardWidth / 2;
    left = Math.max(margin, Math.min(left, viewW - cardWidth - margin));

    const spaceBelow = viewH - rect.bottom;
    const placement: 'below' | 'above' = spaceBelow >= cardHeight + margin ? 'below' : 'above';
    const top = placement === 'below' ? rect.bottom + 8 : rect.top - cardHeight - 8;

    setCardPos({ top, left, placement });
  }, []);

  const handleMouseEnter = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    showTimer.current = setTimeout(() => {
      computePosition();
      setIsVisible(true);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    hideTimer.current = setTimeout(() => setIsVisible(false), 200);
  };

  const handleCardEnter = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  const handleCardLeave = () => {
    hideTimer.current = setTimeout(() => setIsVisible(false), 150);
  };

  useEffect(() => () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  return (
    <>
      {/* ── Pill trigger ── */}
      <a
        ref={triggerRef}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex items-center gap-1 px-1.5 py-0 rounded bg-white/5 border border-white/10 text-[11px] font-medium text-[#a8a8b1] hover:bg-white/10 hover:text-white transition-colors cursor-pointer no-underline relative top-[-1px] mx-0.5"
      >
        {!faviconError ? (
          <img
            src={faviconUrl}
            alt=""
            width={10}
            height={10}
            onError={() => setFaviconError(true)}
            className="rounded-sm flex-shrink-0"
          />
        ) : (
          academic
            ? <GraduationCap size={10} className="text-blue-400 flex-shrink-0" />
            : <Globe size={10} className="text-gray-400 flex-shrink-0" />
        )}
        {text}
      </a>

      {/* ── Hover card portal ── */}
      <AnimatePresence>
        {isVisible && createPortal(
          <div
            ref={cardRef}
            className="fixed z-[99999] pointer-events-auto"
            style={{ top: cardPos.top, left: cardPos.left, width: 320 }}
            onMouseEnter={handleCardEnter}
            onMouseLeave={handleCardLeave}
          >
            <motion.div
              initial={{ opacity: 0, y: cardPos.placement === 'below' ? 6 : -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: cardPos.placement === 'below' ? 4 : -4, scale: 0.96 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              className="w-full bg-white rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.18)] border border-gray-200 overflow-hidden dark:bg-[#1c1c1e] dark:border-white/[0.08]"
            >
              {/* ── Header row ── */}
              <div className="px-4 pt-3.5 pb-2 flex items-center gap-2.5">
                {/* Favicon */}
                <div className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center bg-gray-100 dark:bg-white/5">
                  {!faviconError ? (
                    <img
                      src={faviconUrl}
                      alt=""
                      width={16}
                      height={16}
                      onError={() => setFaviconError(true)}
                      className="rounded-sm"
                    />
                  ) : academic ? (
                    <GraduationCap size={14} className="text-blue-500" />
                  ) : (
                    <Globe size={14} className="text-gray-400" />
                  )}
                </div>

                {/* Domain */}
                <span className="text-[12px] font-semibold text-gray-500 dark:text-[#9a9aa8] leading-none truncate">
                  {domain}
                </span>

                {/* Open link */}
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink size={13} />
                </a>
              </div>

              {/* ── Title ── */}
              <div className="px-4 pb-1">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 hover:underline decoration-1 no-underline"
                >
                  {displayTitle}
                </a>
              </div>

              {/* ── Excerpt ── */}
              <div className="px-4 pb-3">
                <p className="text-[12px] text-gray-500 dark:text-[#86868b] leading-relaxed line-clamp-3 m-0">
                  {excerpt}
                </p>
              </div>

              {/* ── Trusted badge footer ── */}
              {trusted && trustLabel && (
                <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 dark:bg-white/[0.03] dark:border-white/[0.06] flex items-start gap-2">
                  <ShieldCheck
                    size={14}
                    className={`flex-shrink-0 mt-0.5 ${academic ? 'text-blue-500' : 'text-emerald-500'}`}
                  />
                  <div className="min-w-0">
                    <span className={`text-[11px] font-semibold ${academic ? 'text-blue-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      Trusted
                    </span>
                    <p className="text-[11px] text-gray-500 dark:text-[#86868b] m-0 leading-snug mt-0.5">
                      {trustLabel}
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>
    </>
  );
}
