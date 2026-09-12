import JSZip from 'jszip';
import fs from 'fs';

export interface ExtractedImage {
  b64: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DocxPositions {
  header: ExtractedImage[];
  footer: ExtractedImage[];
  headerText?: string;
}

function getPos(xmlBlock: string, tag: string): { offset: number, relativeFrom: string } {
  const regex = new RegExp(`<wp:${tag}[^>]*relativeFrom="([^"]+)"[^>]*>([\\s\\S]*?)<\/wp:${tag}>`);
  const match = xmlBlock.match(regex);
  if (match) {
    const innerXml = match[2];
    const offsetMatch = innerXml.match(/<wp:posOffset>(-?\d+)<\/wp:posOffset>/);
    const alignMatch = innerXml.match(/<wp:align>([^<]+)<\/wp:align>/);
    
    if (offsetMatch) {
      return { offset: parseInt(offsetMatch[1], 10), relativeFrom: match[1] };
    }
    if (alignMatch) {
      return { offset: 0, relativeFrom: 'align:' + alignMatch[1] };
    }
  }
  
  // Fallback if missing relativeFrom attribute
  const fallbackRegex = new RegExp(`<wp:${tag}[^>]*>([\\s\\S]*?)<\/wp:${tag}>`);
  const fbMatch = xmlBlock.match(fallbackRegex);
  if (fbMatch) {
    const innerXml = fbMatch[1];
    const offsetMatch = innerXml.match(/<wp:posOffset>(-?\d+)<\/wp:posOffset>/);
    if (offsetMatch) {
      return { offset: parseInt(offsetMatch[1], 10), relativeFrom: 'margin' };
    }
  }
  
  return { offset: 0, relativeFrom: 'margin' };
}

async function extractImagesFromXml(zip: JSZip, xml: string, relsXml: string | undefined): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  
  // Find rels mapping: rId -> Target
  const relsMap: Record<string, string> = {};
  if (relsXml) {
    const relsRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g;
    let rMatch;
    while ((rMatch = relsRegex.exec(relsXml)) !== null) {
      relsMap[rMatch[1]] = rMatch[2];
    }
  }

  // Find all DrawingML blocks (anchor or inline)
  const drawingRegex = /<(wp:anchor|wp:inline)[\s\S]*?<\/\1>/g;
  let drawMatch;

  while ((drawMatch = drawingRegex.exec(xml)) !== null) {
    const drawXml = drawMatch[0];

    // Get Embed ID
    const embedMatch = drawXml.match(/<a:blip[^>]+r:embed="([^"]+)"/);
    if (!embedMatch) continue;
    const rId = embedMatch[1];
    
    // Get Target path
    let target = relsMap[rId];
    if (!target) continue;
    if (target.startsWith('/')) target = target.substring(1);
    else target = 'word/' + target;

    // Get Image Data
    const file = zip.file(target);
    if (!file) continue;
    const b64 = await file.async('base64');
    
    // Get Dimensions
    const extMatch = drawXml.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
    let w = 100, h = 100;
    if (extMatch) {
      w = Math.round(parseInt(extMatch[1], 10) / 9525);
      h = Math.round(parseInt(extMatch[2], 10) / 9525);
    }

    // Get Positioning (Anchors only)
    let x = 0, y = 0;
    if (drawMatch[1] === 'wp:anchor') {
      const posH = getPos(drawXml, 'positionH');
      const posV = getPos(drawXml, 'positionV');
      x = Math.round(posH.offset / 9525);
      y = Math.round(posV.offset / 9525);
      
      // If relative to margin, add standard 1 inch (96px) offset
      if (['margin', 'leftMargin', 'rightMargin', 'column'].includes(posH.relativeFrom)) {
        x += 96;
      }
      if (['margin', 'topMargin', 'bottomMargin'].includes(posV.relativeFrom)) {
        y += 96;
      }
      
      // Handle <wp:align> fallbacks
      if (posH.relativeFrom.startsWith('align:')) {
        const align = posH.relativeFrom.split(':')[1];
        if (align === 'center') x = 408 - (w / 2); // Center of 8.5" page
        else if (align === 'right') x = 816 - w - 96; // Right margin edge
        else if (align === 'left') x = 96; // Left margin edge
      }
    }

    images.push({ b64, x, y, w, h });
  }

  return images;
}

export async function extractHeaderFooterPositions(filePath: string): Promise<DocxPositions> {
  const result: DocxPositions = { header: [], footer: [] };
  try {
    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);

    const headerFiles = Object.keys(zip.files).filter(k => k.startsWith('word/header') && k.endsWith('.xml'));
    let combinedHeaderText = '';
    for (const file of headerFiles) {
      const xml = await zip.file(file)?.async('string');
      const relsFile = file.replace('word/', 'word/_rels/') + '.rels';
      const relsXml = await zip.file(relsFile)?.async('string');
      if (xml) {
        result.header.push(...await extractImagesFromXml(zip, xml, relsXml));
        
        // Extract missing text strings. Since docx-preview drops the paragraph containing the drawings,
        // we must manually extract all text from the header.
        const textMatches = xml.match(/<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>/g);
        if (textMatches) {
          const rawText = textMatches.map(t => t.replace(/<w:t[^>]*>/g, '').replace(/<\/w:t>/g, '')).join('\n');
          combinedHeaderText += rawText + '\n';
        }
      }
    }
    result.headerText = combinedHeaderText.trim();

    const footerFiles = Object.keys(zip.files).filter(k => k.startsWith('word/footer') && k.endsWith('.xml'));
    for (const file of footerFiles) {
      const xml = await zip.file(file)?.async('string');
      const relsFile = file.replace('word/', 'word/_rels/') + '.rels';
      const relsXml = await zip.file(relsFile)?.async('string');
      if (xml) {
        result.footer.push(...await extractImagesFromXml(zip, xml, relsXml));
      }
    }
  } catch (err) {
    console.error('[docxParser] Failed:', err);
  }
  return result;
}

export async function cleanDocxBuffer(filePath: string): Promise<Buffer> {
  const buffer = fs.readFileSync(filePath);
  try {
    const zip = await JSZip.loadAsync(buffer);
    let modified = false;
    
    // Remove drawing tags from all headers so docx-preview doesn't crash on them
    const headerFiles = Object.keys(zip.files).filter(k => k.startsWith('word/header') && k.endsWith('.xml'));
    for (const file of headerFiles) {
      let xml = await zip.file(file)?.async('string');
      if (xml && xml.includes('<w:drawing>')) {
        // Remove all drawing elements entirely
        xml = xml.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, '');
        zip.file(file, xml);
        modified = true;
      }
    }
    
    if (modified) {
      return await zip.generateAsync({ type: 'nodebuffer' });
    }
  } catch (err) {
    console.error('[docxParser] Failed to clean buffer:', err);
  }
  return buffer;
}
