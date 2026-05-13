'use client';

import type { AuditResult } from '@ohmyperf/core';

interface Props {
  audits: ReadonlyArray<AuditResult>;
}

export function AuditsList({ audits }: Props) {
  if (audits.length === 0) return null;
  const sorted = [...audits].sort((a, b) => (a.passed ? 1 : 0) - (b.passed ? 1 : 0));
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-3 py-2 w-16">Status</th>
            <th className="text-left px-3 py-2 w-48">ID</th>
            <th className="text-left px-3 py-2">Title</th>
            <th className="text-right px-3 py-2 w-16">Score</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a, i) => (
            <tr key={`${a.id}-${i}`} className="border-t">
              <td className="px-3 py-2">
                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${a.passed ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>
                  {a.passed ? 'PASS' : 'FAIL'}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{a.id}</td>
              <td className="px-3 py-2">{a.title}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{a.score === null ? '—' : String(a.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
