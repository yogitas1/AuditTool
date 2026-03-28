import React, { useEffect, useRef } from 'react';
import { Message } from '../types';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';

interface Props {
  messages: Message[];
  isLoading: boolean;
  onApprove: (messageId: string) => void;
  onReject: (messageId: string) => void;
  onRetry: (errorId: string, retryText: string) => void;
}

const ChatWindow: React.FC<Props> = ({ messages, isLoading, onApprove, onReject, onRetry }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Scroll the container itself — more reliable than scrollIntoView
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="chat-window" ref={containerRef}>
      <div className="chat-window__inner">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onApprove={onApprove}
            onReject={onReject}
            onRetry={onRetry}
          />
        ))}
        {isLoading && <TypingIndicator />}
      </div>
    </div>
  );
};

export default ChatWindow;
