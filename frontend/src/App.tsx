import React, { useState, useCallback } from 'react';
import './App.css';
import { AuditFinding, Message } from './types';
import AuditSidebar from './components/AuditSidebar';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import FindingsSummaryPanel from './components/FindingsSummaryPanel';

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  timestamp: new Date(),
  content:
    "Hi! I'm your audit assistant. I've connected to your QuickBooks, Shopify, Amazon, ShipBob, and Gusto accounts. " +
    'I can check your revenue, inventory, and payroll for discrepancies. What would you like me to look at first?',
};

const CHAT_URL  = 'http://localhost:8000/api/chat';
const AUDIT_URL = 'http://localhost:8000/api/audit';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const DEMO_STEPS = [
  'Run a full audit on all my systems and summarize every finding organized by severity.',
  'Show me the revenue discrepancies in detail — walk me through TXN-002, TXN-004, and TXN-009.',
  'Draft the journal entry to fix the TXN-002 discount discrepancy with Sarah Mitchell.',
];

function App() {
  const [messages,       setMessages]       = useState<Message[]>([WELCOME]);
  const [isLoading,      setIsLoading]      = useState(false);
  const [auditFindings,  setAuditFindings]  = useState<AuditFinding[]>([]);
  const [isPanelOpen,    setIsPanelOpen]    = useState(false);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [isDemoRunning,  setIsDemoRunning]  = useState(false);
  const [isSidebarOpen,  setIsSidebarOpen]  = useState(false);

  // ── Internal: makes the API call, appends result/error to state ──────────
  const callChatAPI = useCallback(async (text: string): Promise<void> => {
    setIsLoading(true);
    try {
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context: {} }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(errData.detail ?? `HTTP ${res.status}`);
      }

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          timestamp: new Date(),
          ...(data.requires_approval
            ? { approval: data.requires_approval, approvalStatus: 'pending' as const }
            : {}),
        },
      ]);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        {
          id:        `err-${Date.now()}`,
          role:      'assistant',
          timestamp: new Date(),
          isError:   true,
          retryText: text,
          content:
            '**Could not reach the audit server.**\n\n' +
            'Make sure the backend is running: `uvicorn main:app --reload`\n\n' +
            `_${detail}_`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Public: adds a user message then calls the API ───────────────────────
  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: new Date() },
      ]);
      await callChatAPI(text);
    },
    [callChatAPI],
  );

  // ── Retry: removes the error bubble then re-calls the API ────────────────
  const retryMessage = useCallback(
    async (errorId: string, text: string): Promise<void> => {
      setMessages((prev) => prev.filter((m) => m.id !== errorId));
      await callChatAPI(text);
    },
    [callChatAPI],
  );

  // ── Fetch raw findings for the summary panel ─────────────────────────────
  const fetchAuditFindings = useCallback(async (): Promise<void> => {
    setIsAuditLoading(true);
    setIsPanelOpen(true);
    try {
      const res = await fetch(AUDIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audit_type: 'all' }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setAuditFindings(data.findings ?? []);
    } catch {
      /* panel fetch failures are non-fatal */
    } finally {
      setIsAuditLoading(false);
    }
  }, []);

  // ── Sidebar audit button: parallel chat message + panel fetch ────────────
  const handleAuditAction = useCallback(
    (chatMessage: string) => {
      sendMessage(chatMessage);
      fetchAuditFindings();
      setIsSidebarOpen(false); // close sidebar on mobile after action
    },
    [sendMessage, fetchAuditFindings],
  );

  // ── Demo walkthrough ─────────────────────────────────────────────────────
  const runDemo = useCallback(async () => {
    if (isDemoRunning || isLoading) return;
    setIsDemoRunning(true);
    setIsSidebarOpen(false);
    try {
      await sendMessage(DEMO_STEPS[0]);
      fetchAuditFindings();
      await sleep(1200);
      await sendMessage(DEMO_STEPS[1]);
      await sleep(900);
      await sendMessage(DEMO_STEPS[2]);
    } finally {
      setIsDemoRunning(false);
    }
  }, [isDemoRunning, isLoading, sendMessage, fetchAuditFindings]);

  // ── Approval flow ────────────────────────────────────────────────────────
  const handleApprove = useCallback(
    (messageId: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, approvalStatus: 'approved' as const } : m)),
      );
      sendMessage('I approve this correction. Please confirm it has been applied.');
    },
    [sendMessage],
  );

  const handleReject = useCallback(
    (messageId: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, approvalStatus: 'rejected' as const } : m)),
      );
      sendMessage(
        'I reject this correction. Let me review the details further before making any changes.',
      );
    },
    [sendMessage],
  );

  const busy = isLoading || isDemoRunning;

  return (
    <div className="app">
      {/* Mobile hamburger — hidden on desktop via CSS */}
      <button
        className="sidebar-toggle"
        onClick={() => setIsSidebarOpen(true)}
        aria-label="Open navigation"
      >
        <span className="sidebar-toggle__bar" />
        <span className="sidebar-toggle__bar" />
        <span className="sidebar-toggle__bar" />
      </button>

      {/* Tap-outside overlay — mobile only */}
      <div
        className={`sidebar-overlay ${isSidebarOpen ? 'sidebar-overlay--visible' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />

      <AuditSidebar
        onAuditAction={handleAuditAction}
        onDemoRun={runDemo}
        onClose={() => setIsSidebarOpen(false)}
        isLoading={busy}
        isDemoRunning={isDemoRunning}
        isMobileOpen={isSidebarOpen}
      />

      <main className="app__main">
        <FindingsSummaryPanel
          findings={auditFindings}
          isOpen={isPanelOpen}
          isLoading={isAuditLoading}
          onToggle={() => setIsPanelOpen((v) => !v)}
          onFindingClick={(msg) => { sendMessage(msg); setIsSidebarOpen(false); }}
        />
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          onApprove={handleApprove}
          onReject={handleReject}
          onRetry={retryMessage}
        />
        <InputBar onSend={sendMessage} isLoading={busy} />
      </main>
    </div>
  );
}

export default App;
