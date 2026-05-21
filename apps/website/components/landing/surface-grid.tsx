import { Bot, Chrome, Code2, Eye, FileCode2, GalleryHorizontal, Globe, Puzzle, Terminal } from 'lucide-react';

const SURFACES: ReadonlyArray<{
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  pkg: string;
  body: string;
  command?: string;
  href?: string;
}> = [
  {
    icon: Terminal,
    name: 'CLI',
    pkg: '@ohmyperf/cli',
    body: 'Single binary. Run on your laptop, in CI, or via npx for zero-install probes.',
    command: 'npx -y @ohmyperf/cli@latest run https://example.com',
  },
  {
    icon: Bot,
    name: 'MCP server',
    pkg: '@ohmyperf/mcp-server',
    body: '16 tools — measure, propose_patch, verify_fix, get_fix_plan and more. Drop into Claude / OpenCode / Cursor.',
    command: 'npx -y @ohmyperf/mcp-server@latest',
  },
  {
    icon: Code2,
    name: 'SDK',
    pkg: '@ohmyperf/core',
    body: 'Frozen 1.0.0 public API. Import { runEngine, measure } and embed in your own tooling.',
    command: 'import { runEngine } from "@ohmyperf/core"',
  },
  {
    icon: Chrome,
    name: 'Chrome extension',
    pkg: 'apps/extension-chrome',
    body: 'chrome.debugger driver. Click the toolbar icon on any tab to measure the current page.',
  },
  {
    icon: FileCode2,
    name: 'VSCode extension',
    pkg: 'ohmyperf-vscode',
    body: 'Cmd+Shift+P → "OhMyPerf: Measure URL". Reports stream into the editor.',
  },
  {
    icon: Eye,
    name: 'Static viewer',
    pkg: 'apps/website /viewer',
    body: 'Drag report.json onto the page. Full breakdown rendered in browser. No upload, no signup.',
    href: '/viewer/',
  },
  {
    icon: Puzzle,
    name: 'ESLint plugin',
    pkg: '@ohmyperf/eslint-plugin',
    body: '7 CWV-linked rules: no-document-write, prefer-loading-lazy, prefer-fetchpriority, more.',
    command: 'npm i -D @ohmyperf/eslint-plugin @typescript-eslint/parser',
  },
  {
    icon: GalleryHorizontal,
    name: 'Fixers SDK',
    pkg: '@ohmyperf/fixers',
    body: 'Archetype registry + proposePatches() engine. 4 archetypes shipped, more in v0.3.',
    command: 'import { proposePatches } from "@ohmyperf/fixers"',
  },
  {
    icon: Globe,
    name: 'Share server',
    pkg: '@ohmyperf/share-server',
    body: 'Cloudflare Workers + R2 + D1, or Node + S3-compatible + SQLite. Self-host or use ours.',
  },
];

export function SurfaceGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {SURFACES.map(({ icon: Icon, name, pkg, body, command, href }) => {
        const isLink = !!href;
        const Wrapper: React.ElementType = isLink ? 'a' : 'div';
        const wrapperProps = isLink ? { href, className: 'block' } : {};
        return (
          <Wrapper
            key={name}
            {...wrapperProps}
            className={`group rounded-xl border border-border bg-card p-5 transition-all ${isLink ? 'hover:border-foreground/30 hover:shadow-sm cursor-pointer' : 'hover:border-foreground/20'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-foreground/70" aria-hidden />
                <h3 className="font-semibold text-sm">{name}</h3>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground truncate ml-2">{pkg}</span>
            </div>
            <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">{body}</p>
            {command && (
              <pre className="rounded-md bg-muted/60 px-3 py-2 text-[11px] font-mono text-foreground/80 overflow-x-auto">
                {command}
              </pre>
            )}
            {isLink && (
              <span className="mt-3 inline-block text-xs font-medium text-[oklch(0.50_0.18_245)] dark:text-[oklch(0.78_0.18_245)] group-hover:underline">
                Open viewer →
              </span>
            )}
          </Wrapper>
        );
      })}
    </div>
  );
}
