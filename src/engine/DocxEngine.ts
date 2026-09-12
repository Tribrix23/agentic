import JSZip from 'jszip';

// EMU (English Metric Unit) to Pixel conversion (1 inch = 914400 EMUs = 96 pixels)
const EMU_TO_PX = 96 / 914400;

export interface LayoutRun {
  type: 'text';
  text: string;
  x: number;
  y: number;
  font: string;
  size: number;
  color: string;
  bold: boolean;
}

export interface LayoutImage {
  type: 'image';
  bitmap: ImageBitmap;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LayoutElement = LayoutRun | LayoutImage;

export interface LayoutPage {
  elements: LayoutElement[];
  width: number;
  height: number;
}

export class DocxEngine {
  pages: LayoutPage[] = [];
  private zip: JSZip | null = null;
  private rels: Record<string, string> = {};
  
  // A4 size by default
  PAGE_WIDTH = 816;
  PAGE_HEIGHT = 1056;
  MARGIN = 96; // 1 inch

  async load(buffer: ArrayBuffer) {
    this.zip = await JSZip.loadAsync(buffer);
    this.pages = [];
    
    // Parse relationships for images
    const relsXml = await this.zip.file('word/_rels/document.xml.rels')?.async('text');
    if (relsXml) {
      const parser = new DOMParser();
      const relsDoc = parser.parseFromString(relsXml, 'text/xml');
      relsDoc.querySelectorAll('Relationship').forEach(rel => {
        this.rels[rel.getAttribute('Id') || ''] = rel.getAttribute('Target') || '';
      });
    }

    const docXml = await this.zip.file('word/document.xml')?.async('text');
    if (!docXml) throw new Error('Not a valid DOCX');
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(docXml, 'text/xml');
    
    await this.calculateLayout(doc);
  }
  
  private async calculateLayout(doc: Document) {
    // We need an offscreen canvas to measure text
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    let currentPage: LayoutPage = { elements: [], width: this.PAGE_WIDTH, height: this.PAGE_HEIGHT };
    this.pages.push(currentPage);
    
    let cursorX = this.MARGIN;
    let cursorY = this.MARGIN;
    const lineHeight = 20;

    const body = doc.querySelector('body');
    if (!body) return;

    // A very naive parser that looks for paragraphs (w:p)
    const paragraphs = body.querySelectorAll('p');
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      
      // Handle page break before paragraph
      const pPr = p.querySelector('pPr');
      if (pPr && pPr.querySelector('pageBreakBefore')) {
         currentPage = { elements: [], width: this.PAGE_WIDTH, height: this.PAGE_HEIGHT };
         this.pages.push(currentPage);
         cursorX = this.MARGIN;
         cursorY = this.MARGIN;
      }

      const runs = p.querySelectorAll('r, drawing');
      
      for (let j = 0; j < runs.length; j++) {
        const run = runs[j];
        
        if (run.tagName === 'w:drawing' || run.tagName === 'drawing') {
          // Handle images! This is what the user wants.
          const anchor = run.querySelector('anchor');
          const inline = run.querySelector('inline');
          const graphic = run.querySelector('graphic');
          
          if (graphic) {
            const blip = graphic.querySelector('blip');
            const embedId = blip?.getAttribute('r:embed');
            if (embedId && this.rels[embedId]) {
               const targetPath = 'word/' + this.rels[embedId];
               const imgData = await this.zip?.file(targetPath)?.async('blob');
               if (imgData) {
                 const bitmap = await createImageBitmap(imgData);
                 
                 const ext = inline ? inline.querySelector('extent') : (anchor ? anchor.querySelector('extent') : null);
                 let w = bitmap.width;
                 let h = bitmap.height;
                 if (ext) {
                   w = parseInt(ext.getAttribute('cx') || '0') * EMU_TO_PX;
                   h = parseInt(ext.getAttribute('cy') || '0') * EMU_TO_PX;
                 }
                 
                 let imgX = cursorX;
                 let imgY = cursorY;

                 // EXACT X/Y positioning for anchored (floating) shapes
                 if (anchor) {
                    const posH = anchor.querySelector('positionH posOffset');
                    const posV = anchor.querySelector('positionV posOffset');
                    if (posH) imgX = parseInt(posH.textContent || '0') * EMU_TO_PX;
                    if (posV) imgY = parseInt(posV.textContent || '0') * EMU_TO_PX;
                    // Add margin offset since absolute positions in Word are often relative to page edges
                 }

                 currentPage.elements.push({
                   type: 'image', bitmap, x: imgX, y: imgY, w, h
                 });
                 
                 if (inline) {
                    // Inline images push the cursor down
                    cursorY += h;
                 }
               }
            }
          }
          continue;
        }

        // Handle text run
        const t = run.querySelector('t');
        if (!t) continue;
        
        const text = t.textContent || '';
        
        // Read styling
        const rPr = run.querySelector('rPr');
        const isBold = !!(rPr && rPr.querySelector('b'));
        const sz = rPr?.querySelector('sz')?.getAttribute('val');
        const fontSize = sz ? parseInt(sz) / 2 : 11; // Half-points
        const fontStr = (isBold ? 'bold ' : '') + fontSize + 'pt Arial';
        
        ctx.font = fontStr;
        
        // Simple word wrapping
        const words = text.split(' ');
        for (let w = 0; w < words.length; w++) {
          const word = words[w] + (w < words.length - 1 ? ' ' : '');
          const metrics = ctx.measureText(word);
          
          if (cursorX + metrics.width > this.PAGE_WIDTH - this.MARGIN) {
            cursorX = this.MARGIN;
            cursorY += lineHeight;
            if (cursorY > this.PAGE_HEIGHT - this.MARGIN) {
               // Auto-Pagination!
               currentPage = { elements: [], width: this.PAGE_WIDTH, height: this.PAGE_HEIGHT };
               this.pages.push(currentPage);
               cursorX = this.MARGIN;
               cursorY = this.MARGIN;
            }
          }
          
          currentPage.elements.push({
            type: 'text',
            text: word,
            x: cursorX,
            y: cursorY,
            font: fontStr,
            size: fontSize,
            color: '#000',
            bold: isBold
          });
          
          cursorX += metrics.width;
        }
      }
      
      // Paragraph break
      cursorX = this.MARGIN;
      cursorY += lineHeight;
      if (cursorY > this.PAGE_HEIGHT - this.MARGIN) {
         currentPage = { elements: [], width: this.PAGE_WIDTH, height: this.PAGE_HEIGHT };
         this.pages.push(currentPage);
         cursorX = this.MARGIN;
         cursorY = this.MARGIN;
      }
    }
  }
  
  render(ctx: CanvasRenderingContext2D, pageIndex: number) {
    if (pageIndex < 0 || pageIndex >= this.pages.length) return;
    
    const page = this.pages[pageIndex];
    ctx.clearRect(0, 0, page.width, page.height);
    
    // Draw white paper background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, page.width, page.height);
    
    // Draw elements
    ctx.textBaseline = 'top';
    for (const el of page.elements) {
      if (el.type === 'text') {
        ctx.font = el.font;
        ctx.fillStyle = el.color;
        ctx.fillText(el.text, el.x, el.y);
      } else if (el.type === 'image') {
        ctx.drawImage(el.bitmap, el.x, el.y, el.w, el.h);
      }
    }
  }
}

