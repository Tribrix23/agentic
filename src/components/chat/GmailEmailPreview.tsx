import React from 'react';
import { ArrowLeft, Archive, AlertOctagon, Trash2, ChevronLeft, ChevronRight, Printer, ExternalLink, Reply, Forward, MoreVertical, Star, ChevronDown, X } from 'lucide-react';

interface GmailEmailPreviewProps {
  content: string;
}

export function GmailEmailPreview({ content }: GmailEmailPreviewProps) {
  // Try to parse basic email structure from the content string
  let fromName = 'Unknown Sender';
  let fromEmail = 'unknown@example.com';
  let subject = 'No Subject';
  let body = content;
  let dateStr = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  let isSent = false;
  let recipientName = '';
  let recipientEmail = '';

  try {
    // Basic cleanup of markdown blockquote markers if they exist
    let cleanedContent = content.replace(/^>\s?/gm, '');
    const lines = cleanedContent.split('\n');
    
    // Find the first line that looks like a header
    const headerLineIdx = lines.findIndex(l => l.includes('From:') || l.includes('To:'));
    
    if (headerLineIdx !== -1) {
      const headerLine = lines[headerLineIdx];
      // Parse From:/To: and Subject:
      const headerMatch = headerLine.match(/\*?(From|To):\*?\s*(.*?)(?:<([^>]+)>)?\s*(?:\*?Subject:\*?\s*(.+))?$/i);
      if (headerMatch) {
        const type = headerMatch[1].toLowerCase();
        fromName = headerMatch[2]?.trim().replace(/\*+/g, '') || fromName;
        if (fromName.toLowerCase().endsWith('subject:')) {
          fromName = fromName.replace(/(?:\*?Subject:\*?)/i, '').trim();
        }
        
        if (!headerMatch[3] && fromName.includes('@')) {
          fromEmail = fromName;
          fromName = fromName.split('@')[0];
        } else {
          fromEmail = headerMatch[3]?.trim() || fromEmail;
        }
        
        if (type === 'to') {
          isSent = true;
          recipientName = fromName;
          recipientEmail = fromEmail;
          fromName = 'Me';
          fromEmail = '';
        }

        if (headerMatch[4]) {
          subject = headerMatch[4].trim().replace(/\*+/g, '');
        } else {
          // Check next line for subject just in case
          const nextLine = lines[headerLineIdx + 1];
          if (nextLine && nextLine.includes('Subject:')) {
            const subjMatch = nextLine.match(/\*?Subject:\*?\s*(.+)/i);
            if (subjMatch) {
              subject = subjMatch[1].trim().replace(/\*+/g, '');
              lines.splice(headerLineIdx + 1, 1);
            }
          }
        }
        
        // Remove header from body
        body = lines.slice(headerLineIdx + 1).join('\n').trim();
      }
    }
  } catch (e) {
    console.error("Failed to parse email", e);
  }

  const letterMatch = fromName.match(/[a-zA-Z]/);
  const avatarLetter = letterMatch ? letterMatch[0].toUpperCase() : fromName.charAt(0).toUpperCase();
  const avatarColor = '#10a37f';

  return (
    <div className="w-full max-w-[800px] bg-white rounded-xl shadow-md overflow-hidden text-[#202124] font-sans my-4 border border-gray-200">
      {/* Top action bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <div className="flex items-center gap-4 text-[#444746]">
          <button className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ArrowLeft size={18} /></button>
          <button className="p-2 hover:bg-gray-100 rounded-full transition-colors"><Archive size={18} /></button>
          <button className="p-2 hover:bg-gray-100 rounded-full transition-colors"><AlertOctagon size={18} /></button>
          <button className="p-2 hover:bg-gray-100 rounded-full transition-colors"><Trash2 size={18} /></button>
        </div>
        <div className="flex items-center gap-3 text-[#444746] text-xs">
          <span>1 of 2,534</span>
          <button className="p-1 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft size={20} /></button>
          <button className="p-1 hover:bg-gray-100 rounded-full transition-colors"><ChevronRight size={20} /></button>
        </div>
      </div>

      {/* Subject Line */}
      <div className="px-4 py-4 sm:px-6 flex items-start sm:items-center justify-between gap-4">
        <div className="flex items-center flex-wrap gap-3">
          <h2 className="text-[22px] text-[#1f1f1f] leading-snug">{subject}</h2>
          <span className="flex items-center text-[12px] bg-[#eeeeee] text-[#444746] px-2 py-0.5 rounded border border-[#e0e0e0]">
            Inbox <X size={12} className="ml-1 cursor-pointer" />
          </span>
        </div>
        <div className="flex gap-2 text-[#444746] shrink-0">
          <button className="p-2 hover:bg-gray-100 rounded-full transition-colors"><Printer size={18} /></button>
          <button className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ExternalLink size={18} /></button>
        </div>
      </div>

      {/* Sender Info */}
      <div className="px-4 sm:px-6 flex items-start gap-3 sm:gap-4 mb-4">
        <div 
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xl shrink-0"
          style={{ backgroundColor: avatarColor }}
        >
          {avatarLetter}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4">
            <div className="flex items-baseline gap-2 truncate">
              <span className="font-bold text-[14px] text-[#202124] truncate">{fromName}</span>
              <span className="text-[12px] text-[#5f6368] truncate">&lt;{fromEmail}&gt;</span>
            </div>
            <div className="flex items-center gap-3 text-[#5f6368] shrink-0">
              <span className="text-[12px]">{dateStr}</span>
              <div className="flex items-center gap-1">
                <button className="p-1 hover:bg-gray-100 rounded-full"><Star size={16} /></button>
                <button className="p-1 hover:bg-gray-100 rounded-full"><Reply size={16} /></button>
                <button className="p-1 hover:bg-gray-100 rounded-full"><MoreVertical size={16} /></button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[12px] text-[#5f6368] cursor-pointer hover:underline w-fit mt-0.5">
            {isSent ? `to ${recipientName || recipientEmail}` : 'to me'} <ChevronDown size={14} />
          </div>
        </div>
      </div>

      {/* Email Body */}
      <div className="px-4 sm:px-6 pb-6 ml-0 sm:ml-14">
        <div 
          onClick={(e) => {
            const target = e.target as HTMLElement;
            // Traverse up to find an anchor tag in case they clicked inside it
            const anchor = target.closest('a');
            if (anchor && anchor.tagName === 'A') {
              e.preventDefault();
              const url = anchor.getAttribute('href');
              if (url && (window as any).electron?.openExternal) {
                (window as any).electron.openExternal(url);
              }
            }
          }}
          className="text-[14px] text-[#222222] whitespace-pre-wrap leading-relaxed font-sans"
          dangerouslySetInnerHTML={{
            __html: body
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              // 1. Angle-bracket wrapped URLs
              .replace(/&lt;(https?:\/\/[\s\S]*?)&gt;/gi, (match, url) => {
                const cleanUrl = url.replace(/\s+/g, '');
                return `<a href="${cleanUrl}" target="_blank" class="text-blue-600 hover:underline break-all">${url}</a>`;
              })
              // 2. Markdown Bold & Italic (since AI likes to add them)
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/(?<!\w)\*(.*?)\*(?!\w)/g, '<em>$1</em>')
              // 3. Fake link placeholders [link to ...]
              .replace(/\[(link to [^\]]+)\]/gi, '<span class="text-blue-500 italic">[$1]</span>')
              // 4. Naked URLs (that aren't already part of an href="")
              .replace(/(?<!=["'])(https?:\/\/[^\s<]+)/gi, (match, url) => {
                return `<a href="${url}" target="_blank" class="text-blue-600 hover:underline break-all">${url}</a>`;
              })
              // 5. Image placeholders
              .replace(/\[image:\s*(.*?)\]/gi, '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-xs border border-gray-200 my-1 mx-1 align-middle" title="Image"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> $1</span>')
          }}
        />
        
        {/* Quick Action Buttons */}
        <div className="flex gap-3 mt-8">
          <button className="flex items-center gap-2 px-4 py-2 border border-[#747775] rounded-full text-[#444746] text-[14px] font-medium hover:bg-[#f8f9fa] transition-colors">
            <Reply size={18} /> Reply
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-[#747775] rounded-full text-[#444746] text-[14px] font-medium hover:bg-[#f8f9fa] transition-colors">
            <Forward size={18} /> Forward
          </button>
        </div>
      </div>
    </div>
  );
}
