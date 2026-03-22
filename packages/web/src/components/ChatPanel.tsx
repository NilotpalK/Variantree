import { useEffect, useRef } from 'react';
import { Message, Branch } from '@variantree/core';
import './ChatPanel.css';

interface ChatPanelProps {
  context: Message[];
  ancestry: string[];
  branches: Array<Branch & { isActive: boolean; messageCount: number }>;
  activeBranch: Branch | null;
}

export default function ChatPanel({
  context,
  ancestry,
  branches,
  activeBranch,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [context.length]);

  const breadcrumb = ancestry
    .map((id) => branches.find((b) => b.id === id)?.name ?? '?')
    .join(' → ');

  if (!activeBranch) {
    return (
      <div className="chat-panel">
        <div className="chat-empty">
          <h2>Variantree</h2>
          <p>Start a conversation to explore branches of thought.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-breadcrumb">{breadcrumb}</div>
        <div className="chat-context-count">{context.length} messages</div>
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {context.length === 0 ? (
          <div className="chat-empty-state">
            <p>Start typing to begin on <strong>{activeBranch.name}</strong></p>
          </div>
        ) : (
          context.map((msg, index) => (
            <div key={msg.id || index} className={`msg ${msg.role}`}>
              <div className="msg-header">
                <span className="msg-role">
                  {msg.role === 'user' ? 'YOU' : 'ASSISTANT'}
                </span>
              </div>
              <div className="msg-body">
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
