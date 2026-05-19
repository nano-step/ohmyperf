'use client';

import { useState } from 'react';
import type { FrameNode } from '@ohmyperf/core';

interface Props {
  nodes: Readonly<Record<string, FrameNode>>;
  root: string;
}

export function FrameTree({ nodes, root }: Props) {
  return (
    <div className="rounded-lg border p-4 text-sm font-mono">
      <FrameNodeItem nodes={nodes} frameId={root} depth={0} />
    </div>
  );
}

function FrameNodeItem({
  nodes,
  frameId,
  depth,
}: { nodes: Readonly<Record<string, FrameNode>>; frameId: string; depth: number }) {
  const node = nodes[frameId];
  const [open, setOpen] = useState(true);
  if (!node) return null;

  const hasChildren = node.children.length > 0;
  const tags: string[] = [];
  if (node.isOOPIF) tags.push('OOPIF');
  if (node.isCrossOrigin) tags.push('cross-origin');
  if (node.isSrcdoc) tags.push('srcdoc');
  if (node.isFenced) tags.push('fenced-frame');
  if (node.detachedAt !== undefined) tags.push('detached');

  return (
    <div style={{ marginLeft: depth * 16 }} className="mb-1">
      <div
        className={`flex items-center gap-2 flex-wrap ${hasChildren ? 'cursor-pointer hover:text-foreground' : ''} text-muted-foreground`}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        {hasChildren && <span className="text-xs">{open ? '▾' : '▸'}</span>}
        <span className="text-xs">{frameId}</span>
        {tags.map((t) => (
          <span key={t} className="px-1 py-0 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 text-xs">{t}</span>
        ))}
        <span className="text-xs truncate max-w-xs">{node.url || '(empty)'}</span>
      </div>
      {open && node.children.map((id) => (
        <FrameNodeItem key={id} nodes={nodes} frameId={id} depth={depth + 1} />
      ))}
    </div>
  );
}
