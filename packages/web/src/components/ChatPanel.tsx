import { useEffect, useRef, useCallback } from 'react';
import { Message, Branch } from '@variantree/core';

interface ChatPanelProps {
  context: Message[];
  activeBranch: Branch | null;
  scrollToMessageIndex?: number | null;
}

export default function ChatPanel({
  context,
  activeBranch,
  scrollToMessageIndex,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const setMsgRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) msgRefs.current.set(index, el);
    else msgRefs.current.delete(index);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [context.length]);

  useEffect(() => {
    if (scrollToMessageIndex == null) return;
    const el = msgRefs.current.get(scrollToMessageIndex);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('msg-highlight');
      void el.offsetWidth;
      el.classList.add('msg-highlight');
    }
  }, [scrollToMessageIndex]);

  if (!activeBranch) {
    return (
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-[#000000] items-center justify-center text-center px-6">
        <div className="w-12 h-12 rounded-xl bg-bg-elevated border border-border flex items-center justify-center shadow-sm mb-4">
          <svg className="w-6 h-6 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-text-primary mb-1">No active conversation</p>
        <p className="text-xs text-text-muted leading-relaxed max-w-[280px]">Start a conversation to explore branches of thought.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-[#000000]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6 px-5 flex flex-col gap-5 max-w-[680px] w-full mx-auto" ref={scrollRef}>
        {context.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-text-muted">Start typing to begin on <strong className="text-text-primary font-medium">{activeBranch.name}</strong></p>
          </div>
        ) : (
          context.map((msg, index) => (
            <div
              key={msg.id || index}
              className="animate-fadeUp"
              ref={(el) => setMsgRef(index, el)}
            >
              <div className="mb-1">
                <span className={`text-[10px] font-semibold tracking-[0.08em] uppercase ${msg.role === 'user' ? 'text-text-secondary' : 'text-green'}`}>
                  {msg.role === 'user' ? 'YOU' : 'ASSISTANT'}
                </span>
              </div>
              <div className={`text-[13px] leading-[1.7] whitespace-pre-wrap break-words ${msg.role === 'assistant' ? 'text-text-secondary' : 'text-text-primary'}`}>
                {msg.content.split('\n').map((line, i) => (
                  <span key={i}>
                    {line}
                    {i < msg.content.split('\n').length - 1 && <br />}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
