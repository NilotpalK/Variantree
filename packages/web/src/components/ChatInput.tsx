import { useState, useRef, useEffect } from 'react';
import './ChatInput.css';

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

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
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
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
        />
        <div className="chat-input-actions">
          <button
            className="input-action-btn"
            onClick={onCreateCheckpoint}
            title="Create checkpoint"
          >
            📌
          </button>
          <button
            className="input-action-btn"
            onClick={onCreateBranch}
            title="Create branch"
          >
            🌿
          </button>
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            title="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
