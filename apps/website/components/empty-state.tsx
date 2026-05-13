import type { ReactNode } from 'react';
import Link from 'next/link';

interface EmptyStateProps {
  title: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  children?: ReactNode;
}

export function EmptyState({ title, description, ctaLabel, ctaHref, children }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      {description && <p className="text-sm mb-4">{description}</p>}
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="inline-block text-sm underline underline-offset-4 hover:text-foreground transition-colors"
        >
          {ctaLabel}
        </Link>
      )}
      {children}
    </div>
  );
}
