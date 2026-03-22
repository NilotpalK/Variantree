import { useState, useRef, useEffect } from 'react';
import './Modal.css';

interface ModalProps {
  isOpen: boolean;
  title: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: React.ReactNode;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export default function Modal({
  isOpen,
  title,
  placeholder = 'Enter a name...',
  confirmLabel = 'Create',
  cancelLabel = 'Cancel',
  icon,
  onConfirm,
  onCancel,
}: ModalProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue('');
      // Focus with slight delay for animation
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel} onKeyDown={handleKeyDown}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          {icon && <span className="modal-icon">{icon}</span>}
          <h3 className="modal-title">{title}</h3>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="modal-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />

          <div className="modal-actions">
            <button type="button" className="modal-btn cancel" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button
              type="submit"
              className="modal-btn confirm"
              disabled={!value.trim()}
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
