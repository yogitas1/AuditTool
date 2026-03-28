import React from 'react';

const TypingIndicator: React.FC = () => (
  <div className="msg-row msg-row--assistant">
    <div className="msg-avatar">AI</div>
    <div className="bubble bubble--assistant bubble--typing">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </div>
  </div>
);

export default TypingIndicator;
