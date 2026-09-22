import React, { useMemo } from 'react';
import { CasualEditor, FileSource, FileEntry, FontOption } from '@casualoffice/docs';
import '@casualoffice/docs/styles.css';

const customFonts: FontOption[] = [
  { name: 'Arial', fontFamily: 'Arial, sans-serif', category: 'sans-serif' },
  { name: 'Arial Black', fontFamily: '"Arial Black", sans-serif', category: 'sans-serif' },
  { name: 'Calibri', fontFamily: 'Calibri, sans-serif', category: 'sans-serif' },
  { name: 'Candara', fontFamily: 'Candara, sans-serif', category: 'sans-serif' },
  { name: 'Century Gothic', fontFamily: '"Century Gothic", sans-serif', category: 'sans-serif' },
  { name: 'Franklin Gothic Medium', fontFamily: '"Franklin Gothic Medium", sans-serif', category: 'sans-serif' },
  { name: 'Futura', fontFamily: 'Futura, sans-serif', category: 'sans-serif' },
  { name: 'Geneva', fontFamily: 'Geneva, sans-serif', category: 'sans-serif' },
  { name: 'Gill Sans', fontFamily: '"Gill Sans", sans-serif', category: 'sans-serif' },
  { name: 'Helvetica', fontFamily: 'Helvetica, sans-serif', category: 'sans-serif' },
  { name: 'Lucida Sans', fontFamily: '"Lucida Sans Unicode", sans-serif', category: 'sans-serif' },
  { name: 'Open Sans', fontFamily: '"Open Sans", sans-serif', category: 'sans-serif' },
  { name: 'Optima', fontFamily: 'Optima, sans-serif', category: 'sans-serif' },
  { name: 'Roboto', fontFamily: 'Roboto, sans-serif', category: 'sans-serif' },
  { name: 'Segoe UI', fontFamily: '"Segoe UI", sans-serif', category: 'sans-serif' },
  { name: 'Tahoma', fontFamily: 'Tahoma, sans-serif', category: 'sans-serif' },
  { name: 'Trebuchet MS', fontFamily: '"Trebuchet MS", sans-serif', category: 'sans-serif' },
  { name: 'Verdana', fontFamily: 'Verdana, sans-serif', category: 'sans-serif' },
  
  { name: 'Baskerville', fontFamily: 'Baskerville, serif', category: 'serif' },
  { name: 'Book Antiqua', fontFamily: '"Book Antiqua", serif', category: 'serif' },
  { name: 'Cambria', fontFamily: 'Cambria, serif', category: 'serif' },
  { name: 'Didot', fontFamily: 'Didot, serif', category: 'serif' },
  { name: 'Garamond', fontFamily: 'Garamond, serif', category: 'serif' },
  { name: 'Georgia', fontFamily: 'Georgia, serif', category: 'serif' },
  { name: 'Hoefler Text', fontFamily: '"Hoefler Text", serif', category: 'serif' },
  { name: 'Palatino Linotype', fontFamily: '"Palatino Linotype", serif', category: 'serif' },
  { name: 'Rockwell', fontFamily: 'Rockwell, serif', category: 'serif' },
  { name: 'Times New Roman', fontFamily: '"Times New Roman", serif', category: 'serif' },
  
  { name: 'Consolas', fontFamily: 'Consolas, monospace', category: 'monospace' },
  { name: 'Courier New', fontFamily: '"Courier New", monospace', category: 'monospace' },
  { name: 'Lucida Console', fontFamily: '"Lucida Console", monospace', category: 'monospace' },
  { name: 'Monaco', fontFamily: 'Monaco, monospace', category: 'monospace' },
  
  { name: 'Brush Script MT', fontFamily: '"Brush Script MT", cursive', category: 'other' },
  { name: 'Comic Sans MS', fontFamily: '"Comic Sans MS", cursive', category: 'other' },
  { name: 'Copperplate', fontFamily: 'Copperplate, fantasy', category: 'other' },
  { name: 'Impact', fontFamily: 'Impact, fantasy', category: 'other' },
  { name: 'Papyrus', fontFamily: 'Papyrus, fantasy', category: 'other' }
];

const EMPTY_DOCX_B64 = "UEsDBBQAAAAAAEWxNl0xFPcvrwEAAK8BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz4NCjxUeXBlcyB4bWxucz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3BhY2thZ2UvMjAwNi9jb250ZW50LXR5cGVzIj48RGVmYXVsdCBFeHRlbnNpb249InJlbHMiIENvbnRlbnRUeXBlPSJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtcGFja2FnZS5yZWxhdGlvbnNoaXBzK3htbCIvPjxEZWZhdWx0IEV4dGVuc2lvbj0ieG1sIiBDb250ZW50VHlwZT0iYXBwbGljYXRpb24veG1sIi8+PE92ZXJyaWRlIFBhcnROYW1lPSIvd29yZC9kb2N1bWVudC54bWwiIENvbnRlbnRUeXBlPSJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQud29yZHByb2Nlc3NpbmdtbC5kb2N1bWVudC5tYWluK3htbCIvPjwvVHlwZXM+UEsDBBQAAAAAAEWxNl2Vb45TKwEAACsBAAALAAAAX3JlbHMvLnJlbHM8P3htbCB2ZXJzaW9uPSIxLjAiIGVuY29kaW5nPSJVVEYtOCIgc3RhbmRhbG9uZT0ieWVzIj8+DQo8UmVsYXRpb25zaGlwcyB4bWxucz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3BhY2thZ2UvMjAwNi9yZWxhdGlvbnNoaXBzIj48UmVsYXRpb25zaGlwIElkPSJySWQxIiBUeXBlPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9yZWxhdGlvbnNoaXBzL29mZmljZURvY3VtZW50IiBUYXJnZXQ9IndvcmQvZG9jdW1lbnQueG1sIi8+PC9SZWxhdGlvbnNoaXBzPlBLAwQUAAAAAABFsTZdAArOpMsAAADLAAAAEQAAAHdvcmQvZG9jdW1lbnQueG1sPD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9InllcyI/Pg0KPHc6ZG9jdW1lbnQgeG1sbnM6dz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3dvcmRwcm9jZXNzaW5nbWwvMjAwNi9tYWluIj48dzpib2R5Pjx3OnA+PHc6cj48dzp0Pjwvdzp0PjwvdzpyPjwvdzpwPjwvdzpib2R5Pjwvdzpkb2N1bWVudD5QSwECFAAUAAAAAABFsTZdMRT3L68BAACvAQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAAAEWxNl2Vb45TKwEAACsBAAALAAAAAAAAAAAAAACAAeABAABfcmVscy8ucmVsc1BLAQIUABQAAAAAAEWxNl0ACs6kywAAAMsAAAARAAAAAAAAAAAAAACAATQDAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAAAuBAAAAAA=";

export const DocxViewer = ({ filePath }: { filePath: string }) => {
  const fileSource = useMemo<FileSource>(() => {
    return {
      kind: 'browser',
      label: 'Local File',
      list: async (): Promise<FileEntry[]> => [],
      open: async (id: string) => {
        try {
          let bytes;
          if (typeof window !== 'undefined' && (window as any).electron?.readDocxBuffer) {
             bytes = await (window as any).electron.readDocxBuffer(id);
          } else {
             const response = await fetch(`file:///${id.replace(/\\/g, '/').replace(/^\//, '')}`);
             bytes = await response.arrayBuffer();
          }
          if (bytes.byteLength === 0) {
            const binaryString = atob(EMPTY_DOCX_B64);
            const len = binaryString.length;
            const bytesArr = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytesArr[i] = binaryString.charCodeAt(i);
            }
            bytes = bytesArr.buffer;
          }
          return { bytes, name: id.split('/').pop() || id.split('\\').pop() || 'Document', readOnly: false };
        } catch (e) {
          console.error(e);
          throw e;
        }
      },
      save: async (id: string | null, bytes: ArrayBuffer, opts?: any) => {
        if (id && typeof window !== 'undefined' && (window as any).electron?.writeDocxBuffer) {
           await (window as any).electron.writeDocxBuffer(id, new Uint8Array(bytes));
        }
        return { id: id || 'doc', etag: Date.now().toString() };
      },
      rename: async (id: string, newName: string) => {},
      delete: async (id: string) => {},
      watchRecent: (cb: (files: FileEntry[]) => void) => {
        return () => {};
      },
      rememberLastOpened: async (id: string) => {},
      lastOpened: async (): Promise<string | null> => null
    };
  }, []);

  return (
    <div className="w-full h-full bg-white text-black relative flex flex-col">
      <CasualEditor 
        fileSource={fileSource} 
        docId={filePath}
        docxEditorProps={{ 
          fontFamilies: customFonts,
          onExportPdf: async (suggestedName: string) => {
            let isPrint = false;
            try {
              const evt = window.event as any;
              if (evt) {
                if (evt.type === 'keydown') {
                  if (evt.key.toLowerCase() === 'p' && (evt.ctrlKey || evt.metaKey)) isPrint = true;
                } else {
                  const target = evt.target as Element;
                  // Look at the whole menu item / button, not just the inner span that was clicked
                  const container = target.closest('[role="menuitem"], button, a, li') || target;
                  const text = (container.textContent || '').toLowerCase();
                  
                  // "Export as PDF" does not contain the word 'print'.
                  // The Print menu item text is "Print Ctrl+P"
                  if (text.includes('export as pdf')) {
                    isPrint = false;
                  } else if (text.includes('print') || target.closest('[aria-label*="rint"]') || target.closest('[title*="rint"]')) {
                    isPrint = true;
                  }
                }
              }
            } catch (e) {}

            if (isPrint) {
              // The user actually clicked Print or pressed Ctrl+P.
              // Returning false tells Casual Editor to fall back to window.print()!
              return false;
            }

            // Otherwise, they clicked Export as PDF. Do the silent native PDF export!
            if (window.electron && window.electron.printToPdf) {
              await window.electron.printToPdf(suggestedName);
              return true;
            }
            return false;
          }
        }}
      />
    </div>
  );
};
