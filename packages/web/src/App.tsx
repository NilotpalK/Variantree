import { useState } from 'react';
import { useEngine } from './hooks/useEngine';
import TreeSidebar from './components/TreeSidebar';
import ChatPanel from './components/ChatPanel';
import ChatInput from './components/ChatInput';
import TreeVisualization from './components/TreeVisualization';

export default function App() {
  const engine = useEngine();
  const [isLoading, setIsLoading] = useState(false);
  const [showTreeView, setShowTreeView] = useState(false);

  const handleSendMessage = async (content: string) => {
    setIsLoading(true);
    try {
      await engine.sendMessage(content);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCheckpoint = async () => {
    const label = prompt('Checkpoint name:');
    if (!label) return;
    await engine.createCheckpoint(label);
  };

  const handleCreateBranch = async () => {
    const name = prompt('Branch name:');
    if (!name) return;
    try {
      await engine.branch(name);
    } catch (err: any) {
      alert(err.message);
    }
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
    </div>
  );
}
