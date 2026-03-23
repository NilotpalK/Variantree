import { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  onCreateCheckpoint: () => void;
  onCreateBranch: () => void;
  disabled?: boolean;
}

export default function ChatInput({
  onSendMessage,
  onCreateCheckpoint,
  onCreateBranch,
  disabled = false,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
    }
  }, [value]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSendMessage(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-5 pt-2 pb-4 w-full shrink-0">
      <div className="flex items-end gap-1.5 bg-bg-elevated border border-border rounded-lg p-1.5 pl-3 transition-all duration-200 ease-out max-w-[680px] mx-auto focus-within:border-[rgba(255,255,255,0.12)] focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
        <textarea
          ref={textareaRef}
          className="flex-1 bg-transparent border-0 outline-none text-text-primary text-[13px] font-[inherit] leading-relaxed resize-none max-h-[140px] py-1 placeholder:text-text-faint"
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
        />
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            className="bg-transparent border-0 text-text-muted cursor-pointer p-1.5 rounded-md transition-all duration-150 ease-out leading-none flex items-center justify-center hover:bg-bg-hover hover:text-text-secondary [&>svg]:w-[15px] [&>svg]:h-[15px]"
            onClick={onCreateCheckpoint}
            title="Create checkpoint"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v8" />
              <circle cx="12" cy="14" r="4" />
              <path d="M12 18v4" />
            </svg>
          </button>
          <button
            className="bg-transparent border-0 text-text-muted cursor-pointer p-1.5 rounded-md transition-all duration-150 ease-out leading-none flex items-center justify-center hover:bg-bg-hover hover:text-text-secondary [&>svg]:w-[15px] [&>svg]:h-[15px]"
            onClick={onCreateBranch}
            title="Create branch"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <circle cx="18" cy="6" r="3" />
              <path d="M12 15V9" />
              <path d="M8.7 7.5 11 9" />
              <path d="M15.3 7.5 13 9" />
            </svg>
          </button>
          <button
            className="bg-text-primary text-bg border-0 w-7 h-7 rounded-md cursor-pointer flex items-center justify-center transition-all duration-150 ease-out hover:not-disabled:opacity-85 disabled:opacity-15 disabled:cursor-not-allowed [&>svg]:w-3.5 [&>svg]:h-3.5"
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            title="Send message"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
