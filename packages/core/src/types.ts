export type SchemaVersion = "1.0.0";

export type Mode = "real" | "ci-stable";

export type HeadlessMode = "headless" | "headful";

export type ReporterName =
  | "json"
  | "html"
  | "markdown"
  | "junit"
  | "csv"
  | "har"
  | "trace"
  | "lh-compat";

export type DriverCapability =
  | "cdp-oopif"
  | "coverage"
  | "heap-snapshot"
  | "trace"
  | "long-tasks"
  | "har"
  | "axe";

export type PluginCapability =
  | "metric"
  | "audit"
  | "reporter"
  | "transport"
  | "collector"
  | "lowLevel"
  | "fs:read"
  | "fs:write"
  | "network";

export interface MetricAttribution {
  readonly element?: string;
  readonly target?: string;
  readonly url?: string;
  readonly source?: string;
  readonly cause?: string;
  readonly frameId?: string;
  readonly subparts?: Readonly<Record<string, number>>;
  readonly interactionType?: "pointer" | "keyboard";
  readonly longestScript?: {
    readonly url?: string;
    readonly invoker?: string;
    readonly duration: number;
    readonly subpart: "input-delay" | "processing" | "presentation";
  };
  readonly previousRect?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly currentRect?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface Metric {
  readonly name: string;
  readonly value: number;
  readonly unit: "ms" | "score" | "bytes" | "count" | "ratio";
  readonly previousValue?: number;
  readonly attribution?: MetricAttribution;
}

export interface AggregatedMetric {
  readonly median: number;
  readonly p75: number;
  readonly p95: number;
  readonly mean: number;
  readonly stdev: number;
  readonly cov: number;
  readonly runs: number;
  readonly droppedOutliers: number;
}

export interface AggregatedMetrics {
  readonly [metricName: string]: AggregatedMetric;
}

export interface FrameNode {
  readonly frameId: string;
  readonly url: string;
  readonly origin: string;
  readonly parentFrameId: string | null;
  readonly isOOPIF: boolean;
  readonly isCrossOrigin: boolean;
  readonly isSrcdoc?: boolean;
  readonly isFenced?: boolean;
  readonly attachedAt: number;
  readonly detachedAt?: number;
  readonly metrics: Record<string, Metric>;
  readonly children: readonly string[];
  readonly inFrameMetrics?: { available: false; reason: string };
}

export interface FrameTree {
  readonly root: string;
  readonly nodes: Readonly<Record<string, FrameNode>>;
}

export interface Resource {
  readonly url: string;
  readonly mimeType: string;
  readonly dnsMs?: number;
  readonly tcpMs?: number;
  readonly tlsMs?: number;
  readonly requestMs: number;
  readonly responseMs: number;
  readonly transferSizeBytes: number;
  readonly encodedSizeBytes: number;
  readonly decodedSizeBytes: number;
  readonly renderBlocking: boolean;
  readonly cacheHit: boolean;
}

export interface LongTask {
  readonly startTime: number;
  readonly duration: number;
  readonly attribution: string;
}

export interface AuditResult {
  readonly id: string;
  readonly title: string;
  readonly score: number | null;
  readonly passed: boolean;
  readonly details?: unknown;
}

export interface BudgetEvaluation {
  readonly metric: string;
  readonly threshold: number;
  readonly observed: number;
  readonly passed: boolean;
}

export interface ArtifactRef {
  readonly path: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface BrowserInfo {
  readonly name: string;
  readonly version: string;
  readonly source: "bundled" | "system" | "extension-host";
  readonly userDataDir?: string;
}

export interface CalibrationInfo {
  readonly reference: string;
  readonly observedScore: number;
  readonly throttleRate: number;
  readonly networkProfile: string;
  readonly cacheHit: boolean;
}

export interface ParityInfo {
  readonly mode: HeadlessMode;
  readonly knownDeltas: Readonly<Record<string, string>>;
}

export interface ReportMeta {
  readonly url: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly runs: number;
  readonly mode: Mode;
  readonly browser: BrowserInfo;
  readonly host: { os: string; arch: string; nodeVersion: string };
  readonly parity: ParityInfo;
  readonly calibration?: CalibrationInfo;
  readonly unstable?: boolean;
  readonly cspBypass?: "cdp-init-script" | "none";
  readonly servedBy?: "service-worker" | "network";
  readonly protocol?: "h1" | "h2" | "h3";
  readonly emulation: false | EmulationConfig;
  readonly degradations?: ReadonlyArray<{ readonly capability: DriverCapability; readonly reason: string }>;
  readonly pluginCapabilityUses: ReadonlyArray<{ pluginId: string; capability: PluginCapability; when: string }>;
  readonly measurementId: string;
}

export interface RunReport {
  readonly runIndex: number;
  readonly cold: boolean;
  readonly metrics: Readonly<Record<string, Metric>>;
  readonly resources: readonly Resource[];
  readonly longTasks: readonly LongTask[];
  readonly runtime?: Readonly<Record<string, number>>;
  readonly memory?: {
    readonly jsHeapUsedBytes: number;
    readonly jsHeapTotalBytes: number;
    readonly jsHeapLimitBytes: number;
    readonly domNodes: number;
    readonly eventListeners: number;
    readonly detachedNodes: number;
  };
  readonly meta: { readonly servedBy?: "service-worker" | "network" };
}

export interface Report {
  readonly schemaVersion: SchemaVersion;
  readonly meta: ReportMeta;
  readonly runs: readonly RunReport[];
  readonly coldRun?: RunReport;
  readonly warmAggregated?: AggregatedMetrics;
  readonly aggregated: AggregatedMetrics;
  readonly frames: FrameTree;
  readonly audits: readonly AuditResult[];
  readonly budgets?: readonly BudgetEvaluation[];
  readonly artifacts: {
    readonly traceRef?: ArtifactRef;
    readonly harRef?: ArtifactRef;
    readonly screenshotsRef?: readonly ArtifactRef[];
    readonly heapRef?: ArtifactRef;
  };
  readonly pluginData: Readonly<Record<string, unknown>>;
}

export interface EmulationConfig {
  readonly cpuThrottlingRate?: number;
  readonly networkProfile?: string;
  readonly viewport?: { width: number; height: number; deviceScaleFactor: number };
  readonly userAgent?: string;
  readonly geolocation?: { latitude: number; longitude: number };
}

export interface BudgetConfig {
  readonly [metricName: string]: number;
}

export interface ScenarioStep {
  readonly name: string;
  readonly run: (ctx: { page: unknown; env: NodeJS.ProcessEnv }) => Promise<void>;
  readonly measure?: boolean;
  readonly timeout?: number;
}

export interface ScenarioDefinition {
  readonly name: string;
  readonly steps: readonly ScenarioStep[];
}

export interface PluginRefByName {
  readonly id: string;
  readonly version?: string;
}

export type PluginRef = string | PluginRefByName | Plugin;

export interface SetupCtx {
  readonly logger: Logger;
}

export interface RunCtx {
  readonly runIndex: number;
  readonly driver: DriverHandle;
  readonly page: PageHandle;
  readonly emit: (metric: Metric) => void;
  readonly logger: Logger;
  readonly state: Map<string, unknown>;
  readonly cdp: CDPSessionLike | null;
  evaluateInPage<T = unknown>(expression: string): Promise<T | undefined>;
  audit(audit: AuditResult): void;
  setData(data: unknown): void;
  recordCapabilityUse(capability: PluginCapability): void;
}

export interface ReportCtx {
  readonly logger: Logger;
}

export interface ShareCtx {
  readonly logger: Logger;
  readonly endpoint: string;
}

export interface TeardownCtx {
  readonly logger: Logger;
}

export interface NavigationEvent {
  readonly url: string;
  readonly frameId: string;
  readonly type: "initial" | "soft-nav" | "bfcache-restore" | "prerender-activate";
}

export interface FrameCtx {
  readonly frameId: string;
  readonly url: string;
  readonly isOOPIF: boolean;
}

export interface PluginHooks {
  beforeNavigate(ctx: RunCtx): Awaitable<void>;
  onNavigate(ctx: RunCtx, nav: NavigationEvent): Awaitable<void>;
  onLoad(ctx: RunCtx): Awaitable<void>;
  onIdle(ctx: RunCtx): Awaitable<void>;
  onFrameAttached(ctx: RunCtx, frame: FrameCtx): Awaitable<void>;
  onMetric(ctx: RunCtx, metric: Metric): Awaitable<Metric | void>;
  beforeReport(ctx: ReportCtx): Awaitable<void>;
  onReport(ctx: ReportCtx, report: Report): Awaitable<Report | void>;
  onShare(ctx: ShareCtx, report: Report): Awaitable<void>;
}

export type Awaitable<T> = T | Promise<T>;

export interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly apiVersion: "1";
  readonly capabilities?: readonly PluginCapability[];
  setup?(ctx: SetupCtx): Awaitable<void>;
  hooks?: Partial<PluginHooks>;
  teardown?(ctx: TeardownCtx): Awaitable<void>;
}

export interface BrowserHandle {
  readonly id: string;
}

export interface PageHandle {
  readonly id: string;
}

export interface TargetHandle {
  readonly id: string;
}

export interface CDPSessionLike {
  send(method: string, params?: unknown): Promise<unknown>;
  on(event: string, handler: (payload: unknown) => void): void;
  detach(): Promise<void>;
}

export interface DriverHandle {
  readonly id: string;
}

export interface LaunchOpts {
  readonly mode: HeadlessMode;
  readonly executablePath?: string;
  readonly userDataDir?: string;
  readonly emulation?: EmulationConfig | false;
}

export interface Driver {
  readonly id: string;
  readonly browserVersion: string;
  launch(opts: LaunchOpts): Promise<BrowserHandle>;
  newPage(browser: BrowserHandle): Promise<PageHandle>;
  attachCDP?(target: TargetHandle): Promise<CDPSessionLike>;
  supports(capability: DriverCapability): boolean;
}

export type ScenarioFn = ScenarioDefinition;

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface EngineHooks {
  beforeMeasure?(opts: MeasureOptions): Awaitable<void>;
  afterMeasure?(report: Report): Awaitable<void>;
}

export type DriverRef =
  | "playwright-chromium"
  | "playwright-firefox"
  | "playwright-webkit"
  | "cdp-chrome"
  | "extension-chrome"
  | Driver;

export interface MeasureOptions {
  readonly url: string;
  readonly driver?: DriverRef;
  readonly mode?: Mode;
  readonly headless?: HeadlessMode;
  readonly runs?: number;
  readonly emulation?: EmulationConfig | false;
  readonly scenario?: ScenarioFn | string;
  readonly plugins?: readonly PluginRef[];
  readonly budgets?: BudgetConfig;
  readonly artifacts?: {
    readonly trace?: boolean;
    readonly screenshots?: boolean;
    readonly har?: boolean;
    readonly heap?: boolean;
    readonly coverage?: boolean;
  };
  readonly output?: { readonly dir: string; readonly formats: readonly ReporterName[] };
  readonly signal?: AbortSignal;
  readonly hooks?: Partial<EngineHooks>;
  readonly cacheMode?: "warm" | "cold-only" | "include-cold";
  readonly calibration?: {
    readonly recalibrate?: boolean;
  };
}
