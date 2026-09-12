/**
 * DocxEditor – Quantix DOCX WYSIWYG editor
 *
 * Fully redesigned Ribbon to match WPS/Word exact layout and groupings.
 * Implements an experimental auto-paginator to split pages dynamically.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link as LinkIcon, Table as TableIcon,
  Save, ZoomIn, ZoomOut, Printer, ChevronDown, Image as ImageIcon,
  Layout, FileText, Settings, Columns, Palette, Type, PaintBucket,
  Highlighter, Undo2, Redo2, Scissors, Copy, ClipboardPaste
} from 'lucide-react';
import { cn } from '../../App';

/* ─────────────── Helpers ────────────────────────────────── */
function b64ToBuffer(b64: string): ArrayBuffer {
  const bstr = atob(b64);
  const bytes = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) bytes[i] = bstr.charCodeAt(i);
  return bytes.buffer;
}

function queryFmt(cmd: string): boolean {
  try { return document.queryCommandState(cmd); } catch { return false; }
}

/* ─────────────── CSS injected once for docx-preview pages ── */
const PREVIEW_OVERRIDES = `
  /* Use docx-preview's built-in wrapper for proper page separation and header positioning */
  .docx-wrapper {
    background: #e1e1e1 !important; /* Lighter grey for better contrast */
    padding: 28px 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 24px !important;
  }
  .docx-wrapper > section.docx {
    background: #fff !important;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2) !important;
    margin-bottom: 32px !important;
    outline: none;
    cursor: text;
    position: relative;
  }
  .docx-wrapper > section.docx * {
    cursor: text;
  }
  /* Selection color */
  ::selection {
    background: rgba(43,87,154,0.25);
  }
  
  /* Paged.js Container */
  .pagedjs_pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #e1e1e1;
    padding: 28px 0;
    width: 100%;
  }
  .pagedjs_page {
    background: white;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    margin-bottom: 32px;
  }
  .pagedjs_sheet {
    background: white;
  }

  /* WPS-Style Header/Footer Boundaries */
  header {
    min-height: 50px;
    cursor: text;
    border-bottom: 1px dashed transparent; 
    background: transparent;
    position: relative;
    margin-bottom: 20px;
    z-index: 40 !important;
    transition: border 0.2s ease;
  }
  
  footer {
    min-height: 50px;
    cursor: text;
    border-top: 1px dashed transparent; 
    background: transparent;
    position: absolute;
    z-index: 40 !important;
    transition: border 0.2s ease;
  }

  header:focus-within {
    border-bottom-color: #d2d2d2;
  }
  
  footer:focus-within {
    border-top-color: #d2d2d2;
  }

  /* WPS-Style "Header" Tab */
  header:focus-within::after {
    content: "Header";
    position: absolute;
    bottom: -21px;
    left: 0px;
    font-size: 11px;
    color: #888;
    background: #fff;
    padding: 2px 6px;
    border: 1px dashed #d2d2d2;
    border-top: none;
    pointer-events: none;
  }

  /* WPS-Style "Footer" Tab */
  footer:focus-within::before {
    content: "Footer";
    position: absolute;
    top: -21px;
    left: 0px;
    font-size: 11px;
    color: #888;
    background: #fff;
    padding: 2px 6px;
    border: 1px dashed #d2d2d2;
    border-bottom: none;
    pointer-events: none;
  }

  .inner-text-box {
    border: 1px dashed transparent;
    transition: border 0.2s ease;
  }

  header:focus-within .inner-text-box, footer:focus-within .inner-text-box {
    border: 1px dashed #999 !important; /* Make lines more noticeable */
    background: transparent !important;
  }

  .docx-image-container {
    cursor: default;
  }

  .docx-image-container:focus {
    outline: 1px solid #a0a0a0;
  }

  /* Physical resize handles */
  .docx-image-container:focus .docx-resize-handle {
    display: block;
  }
  
  .docx-resize-handle {
    display: none;
    position: absolute;
    width: 8px; 
    height: 8px;
    background: white;
    border: 1px solid #7c7c7c;
    border-radius: 50%;
    z-index: 60;
  }
  
  .nw { top: -4px; left: -4px; cursor: nwse-resize; }
  .n { top: -4px; left: calc(50% - 4px); cursor: ns-resize; }
  .ne { top: -4px; right: -4px; cursor: nesw-resize; }
  .e { top: calc(50% - 4px); right: -4px; cursor: ew-resize; }
  .se { bottom: -4px; right: -4px; cursor: nwse-resize; }
  .s { bottom: -4px; left: calc(50% - 4px); cursor: ns-resize; }
  .sw { bottom: -4px; left: -4px; cursor: nesw-resize; }
  .w { top: calc(50% - 4px); left: -4px; cursor: ew-resize; }

  .inner-text-box:focus {
    outline: none !important;
  }

  /* Fix massive white gaps in document body by forcing flowcharts inline. 
     We specifically use > article to ensure we DO NOT break header/footer logos! */
  .docx-wrapper > section.docx > article .docx-drawing {
    position: static !important;
    display: block !important;
    margin: 16px auto !important;
    text-align: center !important;
    clear: both !important;
  }

  /* Ensure images don't break layout and are always visible */
  img {
    max-width: 100%;
    display: inline-block;
    z-index: 50 !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  /* Force headers to show overflowing images if they were clipped */
  header {
    overflow: visible !important;
    z-index: 40 !important;
  }
  /* VISUAL PAGE BREAK HACK */
  /* Make hard page breaks look like the gap between physical pages */
  br[style*="page-break"], 
  br[style*="break-after: page"], 
  br[style*="break-before: page"],
  .page-break {
    display: block !important;
    height: 24px !important;
    background-color: #e1e1e1 !important; /* Match wrapper background */
    margin: 24px -100px !important; /* Bleed out past the white paper */
    width: calc(100% + 200px) !important;
    border-top: 1px solid #d2d2d2;
    border-bottom: 1px solid #d2d2d2;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
    user-select: none;
    pointer-events: none;
  }
`;

/* ─────────────── Ribbon UI Components ────────────────────── */
import { DocxEngine } from '../../engine/DocxEngine';

/* ─────────────── Ribbon UI Components ────────────────────── */
// ... (Ribbon stays the same)
const RibbonGroup = ({ title, children }: { title?: string, children: React.ReactNode }) => (
  <div className="flex flex-col justify-between h-full border-r border-[#d2d2d2] px-2 py-1 min-w-[40px]">
    <div className="flex items-start gap-1 flex-1">{children}</div>
    {title && <div className="text-[10px] text-[#666] text-center w-full mt-1 font-medium">{title}</div>}
  </div>
);

const BigBtn = ({ icon: Icon, label, onClick, active }: any) => (
  <button onMouseDown={e => { e.preventDefault(); onClick?.(); }}
    className={cn("flex flex-col items-center justify-center p-1 w-12 h-14 rounded transition-colors border border-transparent hover:bg-[#e8e8e8] hover:border-[#d2d2d2]", active && "bg-[#d0e1f9] border-[#a0c0e8]")}>
    <Icon size={20} className={active ? "text-[#2b579a]" : "text-[#444]"} strokeWidth={1.5} />
    <span className="text-[10px] text-[#444] mt-1 leading-none text-center leading-tight">{label}</span>
  </button>
);

const SmallBtn = ({ icon: Icon, label, cmd, val, isActive, onClick, hasDropdown }: any) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onClick) onClick();
    // Commands won't work on Canvas yet
  };
  return (
    <button onMouseDown={handleMouseDown} title={label}
      className={cn("flex items-center justify-center p-1 rounded transition-colors border border-transparent hover:bg-[#e8e8e8] hover:border-[#d2d2d2] h-6",
        isActive && "bg-[#d0e1f9] border-[#a0c0e8]", hasDropdown ? "px-1.5 gap-0.5" : "w-6")}>
      <Icon size={14} className={isActive ? "text-[#2b579a]" : "text-[#444]"} strokeWidth={2} />
      {hasDropdown && <ChevronDown size={10} className="text-[#666]" />}
    </button>
  );
};

const Sep = () => <div className="w-[1px] h-4 bg-[#d2d2d2] mx-0.5 self-center" />;

const FONTS = ['Times New Roman', 'Arial', 'Calibri', 'Georgia', 'Courier New', 'Tahoma', 'Verdana', 'Helvetica', 'Comic Sans MS'];
const SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72'];
const PAGE_SIZES = [
  { label: 'A3', dim: '11.69 inch x 16.54 inch', w: 1123, h: 1588 },
  { label: 'A4', dim: '8.27 inch x 11.69 inch', w: 794, h: 1123 },
  { label: 'A5', dim: '5.83 inch x 8.27 inch', w: 560, h: 794 },
  { label: 'SuperB', dim: '13 inch x 19 inch', w: 1248, h: 1824 },
  { label: '324x458mm', dim: '12.76 inch x 18.03 inch', w: 1225, h: 1731 },
  { label: 'Envelope C4', dim: '9.02 inch x 12.76 inch', w: 866, h: 1225 },
  { label: 'Envelope C5', dim: '6.38 inch x 9.02 inch', w: 612, h: 866 },
  { label: 'Letter', dim: '8.5 inch x 11 inch', w: 816, h: 1056 },
  { label: 'Tabloid', dim: '11 inch x 17 inch', w: 1056, h: 1632 },
  { label: 'Legal', dim: '8.5 inch x 14 inch', w: 816, h: 1344 },
  { label: 'Statement', dim: '5.5 inch x 8.5 inch', w: 528, h: 816 },
  { label: 'Executive', dim: '7.25 inch x 10.5 inch', w: 696, h: 1008 },
  { label: 'B4 (JIS)', dim: '10.12 inch x 14.33 inch', w: 971, h: 1375 },
];

const CustomSizeDropdown = ({ value, onChange }: { value: string, onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative flex flex-col items-center justify-center p-1 rounded hover:bg-[#e8e8e8] w-12 h-14 cursor-pointer"
      onMouseDown={e => { e.preventDefault(); setOpen(!open); }}>
      <FileText size={20} className="text-[#444]" strokeWidth={1.5} />
      <span className="text-[10px] text-[#444] mt-1 flex items-center gap-0.5">Size <ChevronDown size={8} /></span>

      {open && (
        <div className="absolute top-[100%] left-0 bg-white border border-[#c0c0c0] shadow-lg rounded-sm py-1 w-64 z-[999] max-h-96 overflow-y-auto">
          {PAGE_SIZES.map(s => (
            <div key={s.label} className={cn("flex items-start px-3 py-1.5 hover:bg-[#f0f0f0]", value === s.label && "bg-[#e0eaf6]")}
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onChange(s.label); setOpen(false); }}>
              <FileText size={16} className="text-[#666] mt-0.5 mr-3 shrink-0" strokeWidth={1} />
              <div className="flex flex-col">
                <span className="text-xs text-[#333] font-medium leading-none">{s.label}</span>
                <span className="text-[10px] text-[#666] mt-1 leading-none">{s.dim}</span>
              </div>
            </div>
          ))}
          <div className="border-t border-[#e0e0e0] mt-1 pt-1 px-3 py-1.5 hover:bg-[#f0f0f0] cursor-pointer">
            <span className="text-xs text-[#333]">More Paper Sizes...</span>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─────────────── Main component ─────────────────────────── */
interface DocxEditorProps {
  filePath: string;
  onSave: (html: string) => void;
  isDirty?: boolean;
  setIsDirty?: (d: boolean) => void;
}

type RibbonTab = 'Home' | 'Insert' | 'Page Layout' | 'References' | 'Review' | 'View' | 'Tools' | 'Premium';

export const DocxEditor: React.FC<DocxEditorProps> = ({ filePath, onSave, setIsDirty }) => {
  const docRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<RibbonTab>('Home');
  const [zoom, setZoom] = useState(1.0);
  const [pageSize, setPageSize] = useState('auto');
  const [words, setWords] = useState(0);
  const [fmt, setFmt] = useState<Record<string, boolean>>({});
  const loadedRef = useRef('');
  const styleInjected = useRef(false);

  useEffect(() => {
    if (!styleInjected.current) {
      const style = document.createElement('style');
      style.textContent = PREVIEW_OVERRIDES;
      document.head.appendChild(style);
      styleInjected.current = true;
    }

    // Custom Resize Handler for Images
    let isResizing = false;
    let currentHandle = '';
    let targetContainer: HTMLElement | null = null;
    let startX = 0, startY = 0;
    let startW = 0, startH = 0, startL = 0, startT = 0;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList && target.classList.contains('docx-resize-handle')) {
        isResizing = true;
        currentHandle = target.classList[1];
        targetContainer = target.parentElement;
        if (!targetContainer) return;
        
        startX = e.clientX;
        startY = e.clientY;
        startW = targetContainer.offsetWidth;
        startH = targetContainer.offsetHeight;
        startL = parseInt(targetContainer.style.left || '0', 10);
        startT = parseInt(targetContainer.style.top || '0', 10);
        e.preventDefault();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing || !targetContainer) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (currentHandle.includes('e')) {
        targetContainer.style.width = `${Math.max(20, startW + dx)}px`;
      }
      if (currentHandle.includes('w')) {
        const newW = Math.max(20, startW - dx);
        targetContainer.style.width = `${newW}px`;
        targetContainer.style.left = `${startL + (startW - newW)}px`;
      }
      if (currentHandle.includes('s')) {
        targetContainer.style.height = `${Math.max(20, startH + dy)}px`;
      }
      if (currentHandle.includes('n')) {
        const newH = Math.max(20, startH - dy);
        targetContainer.style.height = `${newH}px`;
        targetContainer.style.top = `${startT + (startH - newH)}px`;
      }
    };

    const onMouseUp = () => {
      if (isResizing) {
        isResizing = false;
        targetContainer = null;
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const syncFmt = useCallback(() => {
    try {
      setFmt({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strike: document.queryCommandState('strikeThrough'),
        alignLeft: document.queryCommandState('justifyLeft'),
        alignCenter: document.queryCommandState('justifyCenter'),
        alignRight: document.queryCommandState('justifyRight'),
        alignJustify: document.queryCommandState('justifyFull'),
        bulletList: document.queryCommandState('insertUnorderedList'),
        orderedList: document.queryCommandState('insertOrderedList'),
      });
    } catch (e) { }
    setIsDirty?.(true);
  }, [setIsDirty]);

  const handleApplyFont = (f: string) => document.execCommand('fontName', false, f);
  const handleApplySize = (s: string) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    document.execCommand('fontSize', false, '7');
    const fonts = document.getElementsByTagName('font');
    for (let i = 0; i < fonts.length; i++) {
      if (fonts[i].size === '7') {
        fonts[i].removeAttribute('size');
        fonts[i].style.fontSize = s + 'pt';
      }
    }
    syncFmt();
  };


  const loadDoc = useCallback(async (path: string) => {
    if (loadedRef.current === path) return;
    setLoading(true);
    setError(null);
    try {
      const { renderAsync } = await import('docx-preview');
      const b64: string = await (window as any).electron.readDocxBuffer(path);
      const buf = b64ToBuffer(b64);

      if (!docRef.current) return;
      docRef.current.innerHTML = '';

      await renderAsync(buf, docRef.current, undefined, {
        className: 'docx',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        useBase64URL: false,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
      });

      // Set independent editable zones to prevent cursor bleeding
      const finalPages = docRef.current.querySelectorAll<HTMLElement>('section.docx');
      finalPages.forEach(page => {
        page.contentEditable = 'false'; // The page wrapper itself is NOT editable
        page.style.pointerEvents = 'auto';

        // 1. Make the main body editable
        page.querySelectorAll<HTMLElement>('article').forEach(el => {
          el.contentEditable = 'true';
          el.style.outline = 'none';
          el.style.minHeight = '600px';

          // --- ROBUST PAGINATION ENGINE ---
          const handlePagination = function (this: HTMLElement) {
            const currentSection = this.closest('section.docx');
            if (!currentSection || !currentSection.parentElement) return;

            let nextSection = currentSection.nextElementSibling;
            let nextArticle = nextSection ? nextSection.querySelector('article') : null;

            // Save cursor position
            const selection = window.getSelection();
            const cursorNode = selection?.anchorNode;
            const cursorOffset = selection?.anchorOffset || 0;

            let DOMModified = false;

            // 1. PULL content from next page if we have space
            if (nextArticle) {
              while (nextArticle.firstElementChild) {
                // Temporarily move the first child to this page
                const childToPull = nextArticle.firstElementChild;
                this.appendChild(childToPull);
                
                // If pulling it caused us to overflow, push it back and stop pulling!
                if (this.scrollHeight > 850) {
                  nextArticle.insertBefore(childToPull, nextArticle.firstChild);
                  break;
                }
                DOMModified = true;
              }
              
              // If next page is now empty, delete it
              if (nextArticle.children.length === 0) {
                nextSection!.remove();
                nextSection = null;
                nextArticle = null;
              }
            }

            // 2. PUSH content to next page if we are overflowing
            while (this.scrollHeight > 850 && this.children.length > 1) {
              if (!nextSection || nextSection.tagName.toLowerCase() !== 'section') {
                nextSection = currentSection.cloneNode(true) as HTMLElement;
                nextArticle = (nextSection as HTMLElement).querySelector('article');
                if (nextArticle) {
                  nextArticle.innerHTML = '';
                  nextArticle.addEventListener('input', handlePagination);
                  nextArticle.addEventListener('keydown', handleBackspace as any);
                }
                currentSection.parentElement.insertBefore(nextSection, currentSection.nextSibling);
              } else if (!nextArticle) {
                nextArticle = nextSection.querySelector('article');
              }

              const lastChild = this.lastElementChild;
              if (!lastChild || !nextArticle) break;
              
              nextArticle.insertBefore(lastChild, nextArticle.firstChild);
              DOMModified = true;
            }

            // Restore cursor focus if we modified the DOM and the cursor node still exists
            if (DOMModified && cursorNode && document.body.contains(cursorNode)) {
               // Use a slight timeout to let the browser paint the new DOM structure
               setTimeout(() => {
                 const sel = window.getSelection();
                 const range = document.createRange();
                 try {
                   range.setStart(cursorNode, cursorOffset);
                   range.collapse(true);
                   sel?.removeAllRanges();
                   sel?.addRange(range);
                   
                   // Use instant scrolling to prevent the "scroll to top then smooth scroll back" glitch
                   const focusEl = cursorNode.nodeType === Node.TEXT_NODE ? cursorNode.parentElement : (cursorNode as HTMLElement);
                   if (focusEl && focusEl.scrollIntoView) {
                     focusEl.scrollIntoView({ behavior: 'instant', block: 'nearest' });
                   }
                 } catch (err) {}
               }, 0);
            }

            // Cascade pagination to the next page if we pushed content to it
            if (DOMModified && nextArticle) {
              setTimeout(() => {
                handlePagination.call(nextArticle);
              }, 10);
            }
          };

          const handleBackspace = function (this: HTMLElement, e: KeyboardEvent) {
            if (e.key === 'Backspace' || e.key === 'Delete') {
              // We let the browser do the actual deletion, then we immediately trigger pagination
              // to pull content from the next page if space was freed!
              setTimeout(() => {
                handlePagination.call(this);
              }, 10);
            }
            
            // Special case: Backspace at the absolute beginning of a page
            if (e.key === 'Backspace') {
              const selection = window.getSelection();
              if (!selection || !selection.isCollapsed) return;

              const firstChild = this.firstElementChild;
              let isAtStart = false;
              
              if (firstChild && selection.anchorNode) {
                if (selection.anchorOffset === 0 && (firstChild === selection.anchorNode || firstChild.contains(selection.anchorNode))) {
                  const range = selection.getRangeAt(0);
                  const preCaretRange = range.cloneRange();
                  preCaretRange.selectNodeContents(this);
                  preCaretRange.setEnd(range.endContainer, range.endOffset);
                  if (preCaretRange.toString().length === 0) {
                    isAtStart = true;
                  }
                }
              } else if (!firstChild) {
                 isAtStart = true;
              }

              if (isAtStart) {
                const currentSection = this.closest('section.docx');
                const previousSection = currentSection?.previousElementSibling;
                
                if (previousSection && previousSection.tagName.toLowerCase() === 'section') {
                  e.preventDefault();
                  const previousArticle = previousSection.querySelector('article');
                  if (previousArticle) {
                    // Move cursor to the end of the previous page FIRST
                    const lastPrevChild = previousArticle.lastElementChild || previousArticle;
                    const newRange = document.createRange();
                    newRange.selectNodeContents(lastPrevChild);
                    newRange.collapse(false);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                    
                    if ((lastPrevChild as HTMLElement).scrollIntoView) {
                       (lastPrevChild as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'nearest' });
                    }

                    // Pull all content up
                    while(this.firstChild) {
                      previousArticle.appendChild(this.firstChild);
                    }
                    currentSection?.remove();
                    
                    // Trigger reflow on the previous page to push overflowing content back down to a new page
                    setTimeout(() => {
                        handlePagination.call(previousArticle);
                    }, 10);
                  }
                }
              }
            }
          };

          el.addEventListener('input', handlePagination);
          el.addEventListener('keydown', handleBackspace as any);
          
          // Trigger strict pagination immediately to split massive documents!
          setTimeout(() => {
            handlePagination.call(el);
          }, 500);
        });

        // 2. Guarantee Header exists
        let header = page.querySelector<HTMLElement>('header');
        if (!header) {
          header = document.createElement('header');
          page.insertBefore(header, page.firstChild);
        }

        // 3. Guarantee Footer exists
        let footer = page.querySelector<HTMLElement>('footer');
        if (!footer) {
          footer = document.createElement('footer');
          page.appendChild(footer);
        }

        // 4. Create internal text boxes and isolate contentEditable
        page.querySelectorAll<HTMLElement>('header, footer').forEach(el => {
          el.contentEditable = 'false'; // Outer container is NOT editable
          el.style.outline = 'none';

          let textBox = el.querySelector<HTMLElement>('.inner-text-box');
          if (!textBox) {
            textBox = document.createElement('div');
            textBox.className = 'inner-text-box';
            textBox.contentEditable = 'true';
            textBox.style.position = 'absolute';
            textBox.style.zIndex = '100'; // On top so they can click and type

            // "in center and is attaching on the edge of the header"
            textBox.style.bottom = '0px'; // Attached to the bottom edge
            textBox.style.left = '50%'; // Centered horizontally
            textBox.style.transform = 'translateX(-50%)';

            textBox.style.width = '65%'; // Wide enough for typing
            textBox.style.height = '110px'; // Strict height so it stops at the red line!
            textBox.style.overflow = 'hidden'; 
            textBox.style.outline = 'none';
            textBox.style.background = 'transparent'; 
            
            // Provide a strictly clean, normal-sized, unbolded paragraph for them to type in
            textBox.innerHTML = '<p style="font-size: 11pt; font-weight: normal; text-align: center; margin: 0; padding: 0; white-space: pre-wrap; word-break: normal; display: block; width: 100%;"><br></p>';
            
            // DESTROY the invisible garbage <p> tags left behind by the Word image parser
            // so the cursor doesn't accidentally fall into a bold/broken formatting node!
            Array.from(el.childNodes).forEach(child => {
              if (child !== textBox && (child.nodeType === Node.TEXT_NODE || (child as HTMLElement).tagName === 'P')) {
                child.remove();
              }
            });
            
            el.appendChild(textBox);
          }
        });
      });

      // --- NEW CUSTOM PARSER LOGIC ---
      try {
        const positions = await (window as any).electron.getDocxPositions(path);
        
        // --- WORD LAYOUT ENGINE (Multi-Page Support) ---
        const sections = Array.from(docRef.current.querySelectorAll<HTMLElement>('section.docx'));
        const defaultMargin = 96;

        sections.forEach(section => {
          section.style.position = 'relative'; // Ensure absolute children anchor to the page
          
          // CRITICAL: Clear any previously injected images to prevent infinite overlaying on React re-renders!
          const existingImages = section.querySelectorAll('.docx-image-container');
          existingImages.forEach(el => el.remove());

          const docMarginLeft = parseInt(section.style.paddingLeft, 10) || defaultMargin;
          const docMarginRight = parseInt(section.style.paddingRight, 10) || defaultMargin;
          const docMarginTop = parseInt(section.style.paddingTop, 10) || defaultMargin;
          const docMarginBottom = parseInt(section.style.paddingBottom, 10) || defaultMargin;

          // 1. Process Header          // Force inject missing images from header and footer directly into the page section
          let headerEl = section.querySelector<HTMLElement>('header');
          if (!headerEl && positions.headerText) {
             // docx-preview completely crashed rendering the header (likely due to w:drawing)
             headerEl = document.createElement('header');
             section.appendChild(headerEl);
          }

          if (headerEl) {
            headerEl.style.position = 'absolute';
            // header is absolute relative to padding box, so we subtract margin
            headerEl.style.top = `${48 - docMarginTop}px`; 
            headerEl.style.left = `0px`;
            headerEl.style.right = `0px`;
            headerEl.style.margin = '0';
            headerEl.style.padding = '0';
            headerEl.style.zIndex = '40';

            // Clear previously injected text containers to prevent infinite stacking on re-renders!
            const existingText = headerEl.querySelectorAll('.docx-injected-text');
            existingText.forEach(el => el.remove());

            // Inject rescued header text manually since docx-preview stubbornly refuses
            if (positions.headerText && positions.headerText.trim() !== '') {
              const textContainer = document.createElement('div');
              textContainer.className = 'docx-injected-text';
              textContainer.style.textAlign = 'center';
              textContainer.style.width = '100%';
              textContainer.style.marginTop = '10px';
              
              const lines = positions.headerText.split('\n').filter((l: string) => l.trim() !== '');
              let html = '';
              lines.forEach((line: string, index: number) => {
                if (index === 1 || index === 3) {
                  html += `<div style="font-size: 14px; font-weight: bold; margin-bottom: 2px;">${line}</div>`;
                } else if (index === 2) {
                  html += `<div style="font-size: 12px; margin-top: 10px;">${line}</div>`; // add gap
                } else {
                  html += `<div style="font-size: 12px;">${line}</div>`;
                }
              });
              
              textContainer.innerHTML = html;
              headerEl.appendChild(textContainer);
            }

            // Dynamic Body Push
            // Calculate this AFTER everything is in the header, in a setTimeout to allow reflow
            setTimeout(() => {
                const headerBottomEdge = 48 + headerEl!.offsetHeight;
                // Add a 20px safety margin below the header
                if (headerBottomEdge + 20 > docMarginTop) {
                  section.style.paddingTop = `${headerBottomEdge + 20}px`;
                }
            }, 50);

            // Inject header images directly into the section
            if (positions.header) {
              positions.header.forEach((imgData: any) => {
                const container = document.createElement('div');
                container.className = 'docx-image-container';
                container.style.position = 'absolute';
                let finalY = imgData.y;
                if (finalY < 48) finalY = 48; // Force to 0.5-inch minimum
                
                // Absolute coordinates from parser are relative to physical paper edge.
                // Our absolute container is relative to the *padding edge* (inside the margins).
                // So we must subtract the margins to place them accurately on the physical paper.
                container.style.left = `${imgData.x - docMarginLeft}px`;
                container.style.top = `${finalY - docMarginTop}px`; 
                container.style.width = `${imgData.w}px`;
                container.style.height = `${imgData.h}px`;
                container.style.zIndex = '50';
                container.tabIndex = 0;

                const img = document.createElement('img');
                img.src = `data:image/png;base64,${imgData.b64}`;
                img.style.width = '100%';
                img.style.height = '100%';
                
                container.appendChild(img);
                
                const handlePositions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
                handlePositions.forEach(pos => {
                  const handle = document.createElement('div');
                  handle.className = `docx-resize-handle ${pos}`;
                  container.appendChild(handle);
                });
                
                section.appendChild(container);
              });
            }
          }

          // 2. Process Footer
          const footerEl = section.querySelector<HTMLElement>('footer');
          if (footerEl) {
            footerEl.style.position = 'absolute';
            footerEl.style.bottom = '48px'; // Standard Word footer offset
            footerEl.style.left = `${docMarginLeft}px`;
            footerEl.style.right = `${docMarginRight}px`;
            footerEl.style.margin = '0';
            footerEl.style.padding = '0';
            
            // Dynamic Body Push for footer
            const footerTopEdge = 48 + footerEl.offsetHeight;
            if (footerTopEdge > docMarginBottom) {
              section.style.paddingBottom = `${footerTopEdge}px`;
            }

            // Inject footer images
            if (positions.footer) {
              positions.footer.forEach((imgData: any) => {
                const container = document.createElement('div');
                container.className = 'docx-image-container';
                container.style.position = 'absolute';
                let finalY = imgData.y;
                if (finalY <= 0) finalY += docMarginTop;
                
                container.style.left = `${imgData.x - docMarginLeft}px`;
                container.style.top = `${finalY - docMarginTop}px`; 
                container.style.width = `${imgData.w}px`;
                container.style.height = `${imgData.h}px`;
                container.style.zIndex = '50';
                container.tabIndex = 0;

                const img = document.createElement('img');
                img.src = `data:image/png;base64,${imgData.b64}`;
                img.style.width = '100%';
                img.style.height = '100%';
                
                container.appendChild(img);
                
                const handlePositions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
                handlePositions.forEach(pos => {
                  const handle = document.createElement('div');
                  handle.className = `docx-resize-handle ${pos}`;
                  container.appendChild(handle);
                });
                
                section.appendChild(container);
              });
            }
          }
        });
      } catch (err) {
        console.warn('Failed to parse custom coordinates', err);
      }
      // -------------------------------

      const textStr = docRef.current.innerText || '';
      const wordsMatch = textStr.match(/\b\w+\b/g);
      setWords(wordsMatch ? wordsMatch.length : 0);

      loadedRef.current = path;
      setLoading(false);
    } catch (e: any) {
      console.error('DocxEditor load error:', e);
      setError(e.message || 'Failed to load document.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadedRef.current = '';
    loadDoc(filePath);
  }, [filePath, loadDoc]);

  const TABS: RibbonTab[] = ['Home', 'Insert', 'Page Layout', 'References', 'Review', 'View', 'Tools', 'Premium'];

  return (
    <div className="flex flex-col h-full w-full bg-[#f3f3f3] overflow-hidden text-[#333] font-sans">

      {/* ── WPS-Style Light Ribbon ── */}
      <div className="shrink-0 bg-[#fbfbfb] border-b border-[#d2d2d2] flex flex-col shadow-sm relative z-[9999]">

        {/* Top bar (Title & Quick Access) */}
        <div className="flex items-center px-2 py-1 gap-2 border-b border-[#e5e5e5]">
          <button className="flex items-center gap-1 text-[11px] text-white bg-[#2b579a] hover:bg-[#1f3f70] px-3 py-1 rounded">
            File <ChevronDown size={12} />
          </button>
          <div className="flex items-center gap-1">
            <SmallBtn icon={Save} label="Save" onClick={() => { if (docRef.current) { onSave(docRef.current.innerHTML); if (setIsDirty) setIsDirty(false); } }} />
            <SmallBtn icon={Undo2} label="Undo" cmd="undo" />
            <SmallBtn icon={Redo2} label="Redo" cmd="redo" />
          </div>
        </div>

        {/* Tab strip */}
        <div className="flex items-center px-2 pt-1 gap-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('px-4 py-1 text-[11px] rounded-t transition-colors border-b-2',
                tab === t ? 'text-[#2b579a] border-[#2b579a] bg-white font-medium' : 'text-[#444] border-transparent hover:bg-[#e8e8e8]'
              )}>{t}</button>
          ))}
        </div>

        {/* Ribbon Content Panels */}
        <div className="h-[76px] bg-white flex items-center px-1">

          {tab === 'Page Layout' && (
            <>
              <RibbonGroup title="Page Setup">
                <div className="flex items-center gap-1">
                  <BigBtn icon={Layout} label="Margins" />
                  <div className="flex flex-col gap-0.5 justify-center mr-1">
                    <button className="flex items-center text-[10px] text-[#444] hover:bg-[#e8e8e8] px-1 rounded h-5">Top: 0.5 in <ChevronDown size={10} className="ml-1" /></button>
                    <button className="flex items-center text-[10px] text-[#444] hover:bg-[#e8e8e8] px-1 rounded h-5">Left: 0.5 in <ChevronDown size={10} className="ml-1" /></button>
                  </div>
                  <div className="flex flex-col gap-0.5 justify-center">
                    <button className="flex items-center text-[10px] text-[#444] hover:bg-[#e8e8e8] px-1 rounded h-5">Bottom: 0.5 in <ChevronDown size={10} className="ml-1" /></button>
                    <button className="flex items-center text-[10px] text-[#444] hover:bg-[#e8e8e8] px-1 rounded h-5">Right: 0.5 in <ChevronDown size={10} className="ml-1" /></button>
                  </div>
                  <BigBtn icon={FileText} label="Orientation" />

                  <CustomSizeDropdown value={pageSize} onChange={setPageSize} />

                  <BigBtn icon={Columns} label="Columns" />
                  <BigBtn icon={Type} label="Text Direction" />
                </div>
              </RibbonGroup>

              <RibbonGroup title="Page Background">
                <div className="flex items-center gap-1">
                  <BigBtn icon={Palette} label="Themes" />
                  <BigBtn icon={FileText} label="Cover Page" />
                  <BigBtn icon={Layout} label="Page Borders" />
                  <BigBtn icon={PaintBucket} label="Page Color" />
                  <BigBtn icon={Type} label="Watermark" />
                  <BigBtn icon={FileText} label="Genko Setting" />
                  <BigBtn icon={ListOrdered} label="Line Numbers" />
                </div>
              </RibbonGroup>

              <RibbonGroup title="Page Setup">
                <div className="flex items-center gap-1">
                  <BigBtn icon={FileText} label="Blank Page" />
                  <BigBtn icon={Scissors} label="Breaks" onClick={() => document.execCommand('insertHTML', false, '<br style="page-break-after: always; break-after: page;">')} />
                  <BigBtn icon={Layout} label="Section Pane" />
                  <BigBtn icon={FileText} label="Delete Section" />
                  <BigBtn icon={Layout} label="Header & Footer" />
                  <BigBtn icon={FileText} label="Page Number" />
                </div>
              </RibbonGroup>
            </>
          )}

          {tab === 'Home' && (
            <>
              <RibbonGroup title="Clipboard">
                <div className="flex items-center gap-1">
                  <BigBtn icon={ClipboardPaste} label="Paste" onClick={() => document.execCommand('paste')} />
                  <div className="flex flex-col gap-0.5">
                    <SmallBtn icon={Scissors} label="Cut" cmd="cut" />
                    <SmallBtn icon={Copy} label="Copy" cmd="copy" />
                    <SmallBtn icon={PaintBucket} label="Format Painter" />
                  </div>
                </div>
              </RibbonGroup>
              <RibbonGroup title="Font">
                <div className="flex flex-col gap-1 px-1">
                  <div className="flex items-center gap-1">
                    <input list="fonts" defaultValue="Times New Roman" onMouseDown={e => e.stopPropagation()} onChange={e => handleApplyFont(e.target.value)}
                      className="border border-[#c0c0c0] rounded px-1 h-5 text-[11px] w-28 focus:outline-none focus:border-[#2b579a]" />
                    <datalist id="fonts">{FONTS.map(f => <option key={f} value={f} />)}</datalist>
                    <select defaultValue="12" onMouseDown={e => e.stopPropagation()} onChange={e => handleApplySize(e.target.value)}
                      className="border border-[#c0c0c0] rounded px-1 h-5 text-[11px] w-12 focus:outline-none focus:border-[#2b579a]">
                      {SIZES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <SmallBtn icon={Bold} cmd="bold" isActive={fmt.bold} />
                    <SmallBtn icon={Italic} cmd="italic" isActive={fmt.italic} />
                    <SmallBtn icon={UnderlineIcon} cmd="underline" isActive={fmt.underline} />
                    <SmallBtn icon={Strikethrough} cmd="strikeThrough" isActive={fmt.strike} />
                    <Sep />
                    <SmallBtn icon={Highlighter} hasDropdown />
                    <SmallBtn icon={Type} hasDropdown />
                  </div>
                </div>
              </RibbonGroup>
              <RibbonGroup title="Paragraph">
                <div className="flex flex-col gap-1 px-1">
                  <div className="flex items-center gap-0.5">
                    <SmallBtn icon={List} cmd="insertUnorderedList" isActive={fmt.bulletList} hasDropdown />
                    <SmallBtn icon={ListOrdered} cmd="insertOrderedList" isActive={fmt.orderedList} hasDropdown />
                  </div>
                  <div className="flex items-center gap-0.5">
                    <SmallBtn icon={AlignLeft} cmd="justifyLeft" isActive={fmt.alignLeft} />
                    <SmallBtn icon={AlignCenter} cmd="justifyCenter" isActive={fmt.alignCenter} />
                    <SmallBtn icon={AlignRight} cmd="justifyRight" isActive={fmt.alignRight} />
                    <SmallBtn icon={AlignJustify} cmd="justifyFull" isActive={fmt.alignJustify} />
                  </div>
                </div>
              </RibbonGroup>
            </>
          )}

        </div>
      </div>

      {/* ── Document canvas ─────────────────────────────────── */}
      <div
        ref={canvasRef}
        className="flex-1 overflow-y-auto docx-preview-host bg-[#e1e1e1]"
        onMouseUp={syncFmt}
        onKeyUp={syncFmt}
      >
        {/* Inject custom page size CSS if not auto */}
        {pageSize !== 'auto' && (
          <style>{`
            .docx-wrapper > section.docx {
              width: ${PAGE_SIZES.find(s => s.label === pageSize)?.w}px !important;
              min-height: ${PAGE_SIZES.find(s => s.label === pageSize)?.h}px !important;
            }
          `}</style>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-2 border-[#2b579a] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#666] text-sm">Loading document...</span>
          </div>
        )}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-center px-8">
            <span className="text-red-500 text-sm font-medium">Failed to load document</span>
            <span className="text-[#666] text-xs max-w-md">{error}</span>
            <button onClick={() => { loadedRef.current = ''; loadDoc(filePath); }}
              className="mt-3 px-4 py-1.5 text-xs text-white bg-[#2b579a] rounded hover:bg-[#1f3f70]">
              Retry
            </button>
          </div>
        )}

        <div
          ref={docRef}
          style={{
            transform: zoom !== 1 ? `scale(${zoom})` : undefined,
            transformOrigin: 'top center',
            width: zoom !== 1 ? `${(100 / zoom)}%` : undefined,
          }}
        />
      </div>

      {/* ── Status bar (WPS Light Grey style) ─────────────── */}
      <div className="h-6 shrink-0 bg-[#f3f3f3] border-t border-[#d2d2d2] flex items-center px-4 text-[10px] text-[#444] justify-between select-none">
        <div className="flex items-center gap-4">
          <span>Page: 1/1</span>
          <span>Words: {words.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <FileText size={12} />
            <Layout size={12} className="text-[#2b579a]" />
          </div>
          <div className="flex items-center gap-1">
            <button onMouseDown={e => { e.preventDefault(); setZoom(z => Math.max(0.4, z - 0.1)); }} className="hover:bg-[#e8e8e8] rounded px-1.5 py-0.5 border border-[#d2d2d2] bg-white">−</button>
            <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onMouseDown={e => { e.preventDefault(); setZoom(z => Math.min(2.5, z + 0.1)); }} className="hover:bg-[#e8e8e8] rounded px-1.5 py-0.5 border border-[#d2d2d2] bg-white">+</button>
          </div>
        </div>
      </div>
    </div>
  );
};
