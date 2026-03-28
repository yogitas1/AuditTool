import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../types';
import ApprovalCard from './ApprovalCard';

interface Props {
  message: Message;
  onApprove?: (messageId: string) => void;
  onReject?: (messageId: string) => void;
  onRetry?: (errorId: string, retryText: string) => void;
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  if (date.toDateString() !== now.toDateString()) {
    opts.month = 'short';
    opts.day = 'numeric';
  }
  return date.toLocaleTimeString('en-US', opts);
}

const MessageBubble: React.FC<Props> = ({ message, onApprove, onReject, onRetry }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`msg-row ${isUser ? 'msg-row--user' : 'msg-row--assistant'}`}>
      {!isUser && <div className="msg-avatar">AI</div>}

      <div className="msg-body">
        <div
          className={[
            'bubble',
            isUser ? 'bubble--user' : 'bubble--assistant',
            message.isError ? 'bubble--error' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {isUser ? (
            message.content
          ) : (
            <ReactMarkdown>{message.content}</ReactMarkdown>
          )}

          {/* Retry button — only on error assistant messages */}
          {message.isError && message.retryText && onRetry && (
            <button
              className="retry-btn"
              onClick={() => onRetry(message.id, message.retryText!)}
            >
              ↻ Retry
            </button>
          )}
        </div>

        {/* Approval card below bubble */}
        {!isUser && message.approval && (
          <ApprovalCard
            data={message.approval}
            status={message.approvalStatus ?? 'pending'}
            onApprove={() => onApprove?.(message.id)}
            onReject={() => onReject?.(message.id)}
          />
        )}

        {/* Timestamp */}
        <span className={`msg-timestamp ${isUser ? 'msg-timestamp--user' : ''}`}>
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
    </div>
  );
};

export default MessageBubble;
