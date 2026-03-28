import React, { useState, useRef, KeyboardEvent } from 'react';

interface Props {
  onSend: (message: string) => void;
  isLoading: boolean;
}

const InputBar: React.FC<Props> = ({ onSend, isLoading }) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue('');
    // Reset height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = value.trim().length > 0 && !isLoading;

  return (
    <div className="input-bar">
      <div className="input-bar__inner">
        <textarea
          ref={textareaRef}
          className="input-bar__textarea"
          placeholder="Ask about your books, a specific finding, or request a correction…"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={1}
        />
        <button
          className={`input-bar__send ${canSend ? 'input-bar__send--active' : ''}`}
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <p className="input-bar__hint">
        Press <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for a new line
      </p>
    </div>
  );
};

export default InputBar;
