import React from 'react';
import { ChevronLeft, ChevronRight, Menu, Search, HelpCircle, Settings, Plus } from 'lucide-react';
import { format, startOfWeek, addDays, isSameDay, getHours, getMinutes, differenceInMinutes, isToday } from 'date-fns';
import { cn } from '../../App';

interface CalendarEventsPreviewProps {
  content: string;
}

interface CalEvent {
  summary: string;
  start: Date;
  end: Date;
  link?: string;
}

export function CalendarEventsPreview({ content }: CalendarEventsPreviewProps) {
  // Parse events from content
  const events: CalEvent[] = [];
  const blocks = content.split('---');
  
  for (const block of blocks) {
    if (!block.trim()) continue;
    
    const summaryMatch = block.match(/Event:\s*(.+)/i);
    const startMatch = block.match(/Starts?:\s*(.+)/i);
    const endMatch = block.match(/Ends?:\s*(.+)/i);
    const linkMatch = block.match(/Link:\s*(.+)/i);
    
    if (summaryMatch && startMatch && endMatch) {
      try {
        events.push({
          summary: summaryMatch[1].trim(),
          start: new Date(startMatch[1].trim()),
          end: new Date(endMatch[1].trim()),
          link: linkMatch ? linkMatch[1].trim() : undefined
        });
      } catch (e) {
        console.error("Failed to parse event dates", e);
      }
    }
  }

  // Determine the week to show. If events exist, use the first event's week. Otherwise current week.
  const baseDate = events.length > 0 ? events[0].start : new Date();
  const startDate = startOfWeek(baseDate, { weekStartsOn: 0 }); // Sunday
  
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));
  const hours = Array.from({ length: 24 }).map((_, i) => i);

  return (
    <div className="w-full max-w-[1000px] bg-[#1e1e1e] text-[#e8eaed] rounded-xl shadow-xl overflow-hidden font-sans border border-white/10 flex flex-col h-[450px]">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#202124]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white/5 rounded-full">
            <Menu size={20} className="text-[#9aa0a6]" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded text-white flex items-center justify-center font-bold text-lg">
              31
            </div>
            <span className="text-[20px] font-medium tracking-wide">Calendar</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <button className="px-4 py-1.5 border border-[#5f6368] rounded text-[14px] font-medium hover:bg-[#28292c] transition-colors">
              Today
            </button>
            <div className="flex items-center text-[#9aa0a6]">
              <button className="p-1.5 hover:bg-white/5 rounded-full transition-colors"><ChevronLeft size={20} /></button>
              <button className="p-1.5 hover:bg-white/5 rounded-full transition-colors"><ChevronRight size={20} /></button>
            </div>
            <span className="text-[20px] font-normal min-w-[180px]">
              {format(startDate, 'MMMM yyyy')}
            </span>
          </div>

        </div>
      </div>

      <div className="flex flex-1 overflow-x-auto overflow-y-hidden bg-[#202124] custom-scrollbar">
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r border-white/10 flex flex-col p-4 overflow-y-auto hidden md:flex">
          <button className="flex items-center justify-center gap-2 bg-[#fff] text-[#3c4043] font-medium rounded-full py-2.5 px-6 shadow-sm hover:shadow-md transition-shadow w-fit mt-2 mb-6">
            <Plus size={20} className="text-red-500" />
            <span className="text-sm">Create</span>
          </button>
          
          <div className="text-[12px] text-[#9aa0a6] font-medium mb-4 flex items-center justify-between">
            {format(startDate, 'MMMM yyyy')}
            <div className="flex">
              <ChevronLeft size={16} />
              <ChevronRight size={16} />
            </div>
          </div>
          
          {/* Mini Calendar placeholder */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[#9aa0a6] mb-8">
            {['S','M','T','W','T','F','S'].map((d, i) => <div key={i}>{d}</div>)}
            {Array.from({length: 31}).map((_, i) => (
              <div key={i} className={cn("w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 cursor-pointer text-[#e8eaed]", i+1 === baseDate.getDate() && "bg-blue-500 text-white")}>
                {i+1}
              </div>
            ))}
          </div>
        </div>

        {/* Main Grid Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-[500px]">
          {/* Days Header */}
          <div className="flex border-b border-white/10 pr-4">
            <div className="w-16 shrink-0 border-r border-white/10"></div>
            <div className="flex-1 grid grid-cols-7">
              {weekDays.map((day, i) => (
                <div key={i} className="flex flex-col items-center py-2 border-r border-white/10 last:border-r-0">
                  <span className="text-[11px] font-medium text-[#9aa0a6] tracking-wider uppercase mb-1">
                    {format(day, 'EEE')}
                  </span>
                  <div className={cn("w-10 h-10 flex items-center justify-center rounded-full text-[20px]", 
                    isToday(day) ? "bg-blue-500 text-white font-medium" : "text-[#e8eaed]"
                  )}>
                    {format(day, 'd')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Time Grid (Scrollable) */}
          <div className="flex-1 overflow-y-auto relative">
            <div className="flex">
              {/* Time Column */}
              <div className="w-16 shrink-0 relative bg-[#202124] z-10 border-r border-white/10">
                {hours.map((hour) => (
                  <div key={hour} className="h-14 relative">
                    <span className="absolute -top-2.5 right-2 text-[10px] text-[#9aa0a6]">
                      {hour === 0 ? '' : (hour < 12 ? `${hour} AM` : (hour === 12 ? '12 PM' : `${hour - 12} PM`))}
                    </span>
                  </div>
                ))}
              </div>

              {/* Grid Content */}
              <div className="flex-1 relative">
                {/* Horizontal grid lines */}
                {hours.map((hour) => (
                  <div key={hour} className="h-14 border-b border-white/5 w-full absolute" style={{ top: `${hour * 56}px` }}></div>
                ))}
                
                {/* Vertical grid lines */}
                <div className="absolute inset-0 grid grid-cols-7 h-[1344px]">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="border-r border-white/10 h-full relative">
                      {/* Events for this day */}
                      {events
                        .filter(e => isSameDay(e.start, weekDays[i]))
                        .map((event, eventIdx) => {
                          const startHour = getHours(event.start) + getMinutes(event.start) / 60;
                          const durationMinutes = differenceInMinutes(event.end, event.start);
                          const durationHours = durationMinutes / 60;
                          const top = startHour * 56;
                          const height = durationHours * 56;
                          
                          return (
                            <a 
                              key={eventIdx}
                              href={event.link || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="absolute left-1 right-1 bg-[#1e8e3e] text-white rounded-[4px] px-2 py-1 text-[12px] leading-tight overflow-hidden hover:bg-[#1a7d36] transition-colors shadow-sm"
                              style={{ 
                                top: `${top}px`, 
                                height: `${Math.max(20, height)}px`,
                                zIndex: 10 + eventIdx 
                              }}
                            >
                              <div className="font-medium truncate">{event.summary}</div>
                              {height > 30 && (
                                <div className="text-white/80 text-[10px]">
                                  {format(event.start, 'h:mm a')} - {format(event.end, 'h:mm a')}
                                </div>
                              )}
                            </a>
                          );
                        })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
