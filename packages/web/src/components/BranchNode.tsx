import { memo } from 'react';
import { Handle, Position, NodeToolbar, type NodeProps, type Node } from '@xyflow/react';
import { getBranchColor, getBranchColorMuted } from '../utils/branchColors';

export type BranchNodeData = {
  label: string;
  colorIndex: number;
  isActive: boolean;
  messageCount: number;
  checkpointCount: number;
  branchId: string;
  parentBranchName: string;
  createdAt: number;
  lastUserContent: string;
  lastAssistantContent: string;
  isCardOpen: boolean;
  onRestoreBranch: (branchId: string) => void;
};

type BranchNodeType = Node<BranchNodeData, 'branch'>;

function getRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function BranchNode({ data }: NodeProps<BranchNodeType>) {
  const color = getBranchColor(data.colorIndex);
  const mutedBg = getBranchColorMuted(data.colorIndex, 0.06);
  const mutedBorder = getBranchColorMuted(data.colorIndex, 0.18);
  const showCard = data.isCardOpen;

  return (
    <>
      <NodeToolbar isVisible={showCard} position={Position.Right} offset={12}>
        <div
          className="flex flex-col p-4 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-50 min-w-[230px] max-w-[260px]"
          style={{
            background: 'var(--color-bg-elevated)',
            border: `1px solid ${getBranchColorMuted(data.colorIndex, 0.2)}`,
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                background: color,
                boxShadow: data.isActive ? `0 0 0 2px var(--color-bg-elevated), 0 0 0 4px ${getBranchColorMuted(data.colorIndex, 0.3)}` : undefined,
              }}
            />
            <span className="text-[14px] font-bold text-text-primary leading-none tracking-[-0.02em] flex-1">
              {data.label}
            </span>
            {data.isActive && (
              <span
                className="text-[8px] font-bold py-0.5 px-1.5 rounded-full tracking-[0.05em] uppercase"
                style={{ color, background: getBranchColorMuted(data.colorIndex, 0.15) }}
              >
                active
              </span>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 border-t border-b py-2.5 mb-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-text-muted uppercase tracking-[0.06em] font-medium">From</span>
              <span className="text-[11px] font-semibold text-text-primary truncate">{data.parentBranchName}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-text-muted uppercase tracking-[0.06em] font-medium">Msgs</span>
              <span className="text-[11px] font-semibold text-text-primary">{data.messageCount}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-text-muted uppercase tracking-[0.06em] font-medium">Created</span>
              <span className="text-[11px] font-semibold text-text-primary">{getRelativeTime(data.createdAt)}</span>
            </div>
          </div>

          {/* Last exchange */}
          {(data.lastUserContent || data.lastAssistantContent) && (
            <div className="mb-3">
              <div className="text-[9px] text-text-muted uppercase tracking-[0.06em] font-medium mb-1.5">Last Exchange</div>
              {data.lastUserContent && (
                <div className="mb-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-[0.04em] text-text-primary block mb-0.5">You</span>
                  <p className="text-[10px] text-text-secondary leading-relaxed m-0">
                    {data.lastUserContent.length > 80 ? data.lastUserContent.slice(0, 80) + '…' : data.lastUserContent}
                  </p>
                </div>
              )}
              {data.lastAssistantContent && (
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-[0.04em] text-green block mb-0.5">Claude</span>
                  <p className="text-[10px] text-text-secondary leading-relaxed m-0">
                    {data.lastAssistantContent.length > 80 ? data.lastAssistantContent.slice(0, 80) + '…' : data.lastAssistantContent}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Restore button */}
          <button
            className="flex items-center justify-center gap-1.5 h-7 rounded-md text-[11px] font-semibold cursor-pointer transition-all duration-150 ease-out font-[inherit] border hover:brightness-110 w-full"
            style={{
              color,
              background: getBranchColorMuted(data.colorIndex, 0.08),
              borderColor: getBranchColorMuted(data.colorIndex, 0.25),
            }}
            onClick={(e) => {
              e.stopPropagation();
              data.onRestoreBranch(data.branchId);
            }}
          >
            <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Restore to Chat
          </button>
        </div>
      </NodeToolbar>

      <div
        className="relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 cursor-pointer transition-all duration-150 ease-out select-none group"
        style={{
          background: data.isActive ? mutedBg : 'rgba(30, 30, 30, 0.85)',
          border: `1px solid ${data.isActive ? getBranchColorMuted(data.colorIndex, 0.35) : mutedBorder}`,
          boxShadow: data.isActive
            ? `0 0 14px ${getBranchColorMuted(data.colorIndex, 0.25)}, 0 0 5px ${getBranchColorMuted(data.colorIndex, 0.15)}`
            : `0 0 12px ${getBranchColorMuted(data.colorIndex, 0.18)}, 0 0 4px ${getBranchColorMuted(data.colorIndex, 0.1)}`,
          backdropFilter: 'blur(8px)',
          outline: data.isCardOpen ? `1.5px solid ${getBranchColorMuted(data.colorIndex, 0.4)}` : 'none',
          outlineOffset: '2px',
        }}
      >
        <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0 !min-w-0 !min-h-0" />

        {/* Color dot */}
        <span
          className={`rounded-full shrink-0 transition-all duration-150 ${data.isActive ? 'w-[7px] h-[7px]' : 'w-1.5 h-1.5'}`}
          style={{
            background: color,
            boxShadow: data.isActive ? `0 0 6px ${getBranchColorMuted(data.colorIndex, 0.45)}` : undefined,
          }}
        />

        {/* Content */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className={`text-[11px] leading-none whitespace-nowrap overflow-hidden text-ellipsis ${data.isActive ? 'font-semibold' : 'font-medium'}`}
            style={{ color: data.isActive ? color : 'var(--color-text-secondary)' }}
          >
            {data.label}
          </span>
          <span className="text-[9px] text-text-faint leading-none tabular-nums shrink-0 opacity-70">
            {data.messageCount}
            {data.checkpointCount > 0 ? `·${data.checkpointCount}` : ''}
          </span>
        </div>

        {data.isActive && (
          <span className="w-1 h-1 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
        )}

        <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0 !min-w-0 !min-h-0" />
      </div>
    </>
  );
}

export default memo(BranchNode);
