import { useState } from 'react';
import { useEngine } from './hooks/useEngine';
import TreeSidebar from './components/TreeSidebar';
import ChatPanel from './components/ChatPanel';
import ChatInput from './components/ChatInput';
import TreeVisualization from './components/TreeVisualization';
import Modal from './components/Modal';

export default function App() {
  const engine = useEngine();
  const [isLoading, setIsLoading] = useState(false);
  const [showTreeView, setShowTreeView] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<number | null>(null);

  // Modal state
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'checkpoint' | 'branch';
    targetCheckpointId?: string;
  }>({ isOpen: false, type: 'checkpoint' });

  const handleSendMessage = async (content: string) => {
    setIsLoading(true);
    try {
      await engine.sendMessage(content);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCheckpoint = () => {
    setModalConfig({ isOpen: true, type: 'checkpoint' });
  };

  const handleCreateBranch = () => {
    setModalConfig({ isOpen: true, type: 'branch' });
  };

  const handleBranchFromCheckpoint = (checkpointId: string) => {
    setModalConfig({ isOpen: true, type: 'branch', targetCheckpointId: checkpointId });
  };

  const handleModalConfirm = async (value: string) => {
    const { type, targetCheckpointId } = modalConfig;
    setModalConfig({ isOpen: false, type });
    if (type === 'checkpoint') {
      await engine.createCheckpoint(value);
    } else {
      try {
        await engine.branch(value, targetCheckpointId);
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const handleModalCancel = () => {
    setModalConfig({ isOpen: false, type: modalConfig.type });
  };

  const handleDeleteBranch = async (branchId: string) => {
    const branch = engine.branches.find((b) => b.id === branchId);
    if (!branch) return;
    if (!confirm(`Delete branch "${branch.name}"?`)) return;
    try {
      await engine.deleteBranch(branchId);
    } catch (err: any) {
      alert(err.message);
    }
  };

  /**
   * Checkpoint click → scroll the chat to that message.
   * messageIndex is relative to the branch's own messages.
   * The full context = parentMessages + branchMessages, so the
   * absolute index = (context.length - activeBranchMessages) + messageIndex.
   */
  const handleCheckpointClick = (messageIndex: number) => {
    const activeBranch = engine.activeBranch;
    if (!activeBranch) return;
    const parentOffset = engine.context.length - activeBranch.messages.length;
    const absoluteIndex = parentOffset + messageIndex;
    // Toggle: clicking the same checkpoint again clears highlight
    setScrollTarget((prev) => (prev === absoluteIndex ? null : absoluteIndex));
  };

  // Modal icons
  const checkpointIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v8" />
      <circle cx="12" cy="14" r="4" />
      <path d="M12 18v4" />
    </svg>
  );

  const branchIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M12 15V9" />
      <path d="M8.7 7.5 11 9" />
      <path d="M15.3 7.5 13 9" />
    </svg>
  );

  const breadcrumb = engine.ancestry
    .map((id) => engine.branches.find((b) => b.id === id)?.name ?? '?')
    .join(' → ');

  return (
    <div className="flex flex-col h-screen w-screen bg-bg">
      {/* Global Header */}
      <header className="flex border-b border-border bg-bg-secondary shrink-0 h-[48px]">
        {/* Left portion matching sidebar width */}
        <div className="flex items-center justify-between px-4 border-r border-border w-[320px] min-w-[320px]">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-text-primary tracking-[-0.01em] overflow-hidden">
            <svg className="sidebar-icon shrink-0" viewBox="0 0 100 100" fill="none" style={{ width: 18, height: 18 }}>
              <polygon points="20,20 38,20 58,80 40,80" fill="currentColor" />
              <polygon points="60,20 64,20 44,80 40,80" fill="currentColor" />
              <polygon points="67,20 71,20 51,80 47,80" fill="currentColor" />
              <polygon points="74,20 78,20 58,80 54,80" fill="currentColor" />
              <polygon points="81,20 85,20 65,80 61,80" fill="currentColor" />
            </svg>
            <span className="font-bold truncate">Variantree</span>
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green animate-[pulse_2s_ease-in-out_infinite]" />
            <span className="text-[10px] font-semibold text-green uppercase tracking-[0.05em] mt-0.5">live</span>
          </div>
        </div>

        {/* Right portion matching main content area */}
        <div className="flex-1 flex items-center justify-between px-5 min-w-0">
          <div className="flex items-center min-w-0">
            {showTreeView ? (
              <span className="text-[12px] font-medium text-text-secondary tracking-[-0.01em]">Conversation Tree</span>
            ) : (
              <span className="text-[12px] font-medium text-text-secondary tracking-[-0.01em] truncate">{breadcrumb || 'New Session'}</span>
            )}
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {showTreeView ? (
              <span className="text-[11px] text-text-muted tabular-nums">
                {engine.branches.length} branches · {engine.checkpoints.length} checkpoints
              </span>
            ) : (
              <span className="text-[11px] text-text-faint tabular-nums border border-border bg-bg-elevated px-2 py-0.5 rounded-md">
                {engine.context.length} messages
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 bg-bg">
        <TreeSidebar
        branches={engine.branches}
        checkpoints={engine.checkpoints}
        activeBranchId={engine.activeBranch?.id ?? null}
        onSwitchBranch={engine.switchBranch}
        onCreateCheckpoint={handleCreateCheckpoint}
        onCreateBranch={handleCreateBranch}
        onToggleTreeView={() => setShowTreeView(!showTreeView)}
        isTreeViewActive={showTreeView}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onCheckpointClick={handleCheckpointClick}
        onBranchFromCheckpoint={handleBranchFromCheckpoint}
      />

      {showTreeView ? (
        <TreeVisualization
          branches={engine.branches}
          checkpoints={engine.checkpoints}
          onSwitchBranch={engine.switchBranch}
          onRestoreBranch={(branchId) => {
            engine.switchBranch(branchId);
            setShowTreeView(false);
          }}
        />
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          <ChatPanel
            context={engine.context}
            activeBranch={engine.activeBranch}
            scrollToMessageIndex={scrollTarget}
          />
          <ChatInput
            onSendMessage={handleSendMessage}
            onCreateCheckpoint={handleCreateCheckpoint}
            onCreateBranch={handleCreateBranch}
            disabled={isLoading}
          />
        </div>
      )}

      {/* Custom Modal */}
      <Modal
        isOpen={modalConfig.isOpen}
        title={modalConfig.type === 'checkpoint' ? 'Create Checkpoint' : 'Create Branch'}
        placeholder={
          modalConfig.type === 'checkpoint'
            ? 'e.g. API architecture decided'
            : 'e.g. explore-graphql'
        }
        confirmLabel="Create"
        icon={modalConfig.type === 'checkpoint' ? checkpointIcon : branchIcon}
        onConfirm={handleModalConfirm}
        onCancel={handleModalCancel}
      />
      </div>
    </div>
  );
}

