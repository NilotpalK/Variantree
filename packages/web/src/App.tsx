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

  // Modal state
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'checkpoint' | 'branch';
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

  const handleModalConfirm = async (value: string) => {
    setModalConfig({ isOpen: false, type: modalConfig.type });
    if (modalConfig.type === 'checkpoint') {
      await engine.createCheckpoint(value);
    } else {
      try {
        await engine.branch(value);
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

  return (
    <div className="app">
      <TreeSidebar
        branches={engine.branches}
        checkpoints={engine.checkpoints}
        activeBranchId={engine.activeBranch?.id ?? null}
        onSwitchBranch={engine.switchBranch}
        onDeleteBranch={handleDeleteBranch}
        onCreateCheckpoint={handleCreateCheckpoint}
        onCreateBranch={handleCreateBranch}
        onToggleTreeView={() => setShowTreeView(!showTreeView)}
        isTreeViewActive={showTreeView}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {showTreeView ? (
        <TreeVisualization
          branches={engine.branches}
          checkpoints={engine.checkpoints}
          onSwitchBranch={(branchId) => {
            engine.switchBranch(branchId);
            setShowTreeView(false);
          }}
        />
      ) : (
        <div className="main-content">
          <ChatPanel
            context={engine.context}
            ancestry={engine.ancestry}
            branches={engine.branches}
            activeBranch={engine.activeBranch}
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
  );
}
