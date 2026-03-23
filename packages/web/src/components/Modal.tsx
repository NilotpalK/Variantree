import { useState, useRef, useEffect } from 'react';

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
    <div
      className="fixed inset-0 bg-[rgba(0,0,0,0.6)] backdrop-blur-[4px] flex items-center justify-center z-100 animate-[fadeIn_0.15s_ease]"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-bg-elevated border border-border rounded-lg w-[380px] max-w-[90vw] p-5 animate-[slideUp_0.2s_ease] shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          {icon && <span className="text-text-muted flex items-center [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
          <h3 className="text-[14px] font-semibold text-text-primary tracking-[-0.01em] m-0">{title}</h3>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="w-full py-2 px-3 bg-bg border border-border rounded-md text-text-primary text-[13px] font-[inherit] outline-none transition-all duration-200 ease-out focus:border-[rgba(255,255,255,0.14)] placeholder:text-text-faint"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              className="h-8 px-3 rounded-md text-[12px] font-medium cursor-pointer font-[inherit] transition-all duration-150 ease-out border border-border bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              className="h-8 px-4 rounded-md text-[12px] font-semibold cursor-pointer font-[inherit] transition-all duration-150 ease-out border-0 bg-text-primary text-bg hover:not-disabled:opacity-90 disabled:opacity-25 disabled:cursor-not-allowed"
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
