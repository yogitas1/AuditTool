import React, { useEffect, useRef } from 'react';
import { Message } from '../types';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import LiveAuditProgress from './LiveAuditProgress';

interface HarvestSummary  { projects_count: number; total_hours: number; }
interface AirtableSummary { total_projects: number; total_budget: number; }

interface Props {
  messages: Message[];
  isLoading: boolean;
  isLiveAuditRunning: boolean;
  harvestData: HarvestSummary | null;
  airtableData: AirtableSummary | null;
  onApprove: (messageId: string) => void;
  onReject: (messageId: string) => void;
  onRetry: (errorId: string, retryText: string) => void;
}

const ChatWindow: React.FC<Props> = ({
  messages, isLoading, isLiveAuditRunning,
  harvestData, airtableData,
  onApprove, onReject, onRetry,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading, isLiveAuditRunning]);

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
        {isLiveAuditRunning && (
          <LiveAuditProgress harvestData={harvestData} airtableData={airtableData} />
        )}
        {isLoading && !isLiveAuditRunning && <TypingIndicator />}
      </div>
    </div>
  );
};

export default ChatWindow;
