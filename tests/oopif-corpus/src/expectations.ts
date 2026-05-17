export interface FixtureExpectation {
  readonly id: string;
  readonly path: string;
  readonly description: string;
  readonly minOopifAttachments: number;
  readonly maxOopifAttachments: number;
  readonly mustEmitDetach?: boolean;
  readonly tolerateNoAttachment?: boolean;
  readonly mustHaveMetrics?: ReadonlyArray<string>;
  readonly mayMissMetrics?: ReadonlyArray<string>;
  readonly mustHaveAttribution?: ReadonlyArray<string>;
  readonly chromiumFlags?: ReadonlyArray<string>;
  readonly expectError?: boolean;
}

export const FIXTURE_EXPECTATIONS: ReadonlyArray<FixtureExpectation> = [
  {
    id: "oopif-3-cross-origin",
    path: "/oopif-3-cross-origin",
    description: "Parent + 3 cross-origin OOPIFs (each iframe served by a distinct port).",
    minOopifAttachments: 3,
    maxOopifAttachments: 3,
    mustHaveMetrics: ["lcp", "fcp", "ttfb"],
    mayMissMetrics: ["cls", "inp"],
    mustHaveAttribution: ["lcp"],
  },
  {
    id: "sandbox-no-scripts",
    path: "/sandbox-no-scripts",
    description:
      "iframe with sandbox=\"\" (no allow-scripts) — still creates an OOPIF target, but in-frame metrics are documented opaque.",
    minOopifAttachments: 1,
    maxOopifAttachments: 1,
    mustHaveMetrics: ["lcp", "fcp", "ttfb"],
    mayMissMetrics: ["cls", "inp"],
  },
  {
    id: "srcdoc-iframe",
    path: "/srcdoc-iframe",
    description:
      "srcdoc iframe is same-origin same-process; expect ZERO OOPIF target attachments — metrics fold into parent.",
    minOopifAttachments: 0,
    maxOopifAttachments: 0,
    tolerateNoAttachment: true,
    mustHaveMetrics: ["lcp", "fcp", "ttfb"],
    mayMissMetrics: ["cls", "inp"],
  },
  {
    id: "iframe-removed-mid-run",
    path: "/iframe-removed-mid-run",
    description:
      "Cross-origin iframe is removed via JS at t≈200ms; expect attach event followed by detach, no engine crash.",
    minOopifAttachments: 1,
    maxOopifAttachments: 1,
    mustEmitDetach: true,
    mustHaveMetrics: ["lcp", "fcp", "ttfb"],
    mayMissMetrics: ["cls", "inp"],
  },
  {
    id: "bfcache",
    path: "/bfcache",
    description:
      "Page navigates forward then back via history.back(); engine should record metrics for the initial load and survive the bfcache restore without crash.",
    minOopifAttachments: 0,
    maxOopifAttachments: 0,
    tolerateNoAttachment: true,
    mustHaveMetrics: ["lcp", "fcp", "ttfb"],
    mayMissMetrics: ["cls", "inp"],
  },
  {
    id: "prerender",
    path: "/prerender",
    description:
      "Speculation rules pre-render of /prerender-target. Engine should not crash; primary frame metrics still emitted. Pre-render of target is opaque to v1.",
    minOopifAttachments: 0,
    maxOopifAttachments: 0,
    tolerateNoAttachment: true,
    mustHaveMetrics: ["fcp", "ttfb"],
    mayMissMetrics: ["lcp", "cls", "inp"],
  },
  {
    id: "sw-precache",
    path: "/sw-precache",
    description:
      "Page registers a Service Worker that precaches '/' via caches.addAll. Engine reports first-visit metrics; SW lifecycle is opaque to v1.",
    minOopifAttachments: 0,
    maxOopifAttachments: 0,
    tolerateNoAttachment: true,
    mustHaveMetrics: ["lcp", "fcp", "ttfb"],
    mayMissMetrics: ["cls", "inp"],
  },
  {
    id: "spa-soft-nav",
    path: "/spa-soft-nav",
    description:
      "history.pushState soft-navigation 400ms after first paint. Engine measures the ORIGINAL navigation only (soft-nav out of scope in v1, documented).",
    minOopifAttachments: 0,
    maxOopifAttachments: 0,
    tolerateNoAttachment: true,
    mustHaveMetrics: ["lcp", "fcp", "ttfb"],
    mayMissMetrics: ["cls", "inp"],
  },
  {
    id: "popup",
    path: "/popup",
    description:
      "Parent opens a popup via window.open(). Engine measures the opener only; popup is a separate top-level target the engine does not auto-attach.",
    minOopifAttachments: 0,
    maxOopifAttachments: 0,
    tolerateNoAttachment: true,
    mustHaveMetrics: ["lcp", "fcp", "ttfb"],
    mayMissMetrics: ["cls", "inp"],
  },
  {
    id: "worker",
    path: "/worker",
    description:
      "Dedicated worker runs a 150ms busy loop. PerformanceObserver('longtask') is main-thread only, so the worker's task MUST NOT appear in TBT/longTasks on the main thread.",
    minOopifAttachments: 0,
    maxOopifAttachments: 0,
    tolerateNoAttachment: true,
    mustHaveMetrics: ["fcp", "ttfb"],
    mayMissMetrics: ["lcp", "cls", "inp"],
  },
  {
    id: "iframe-resize-causes-parent-shift",
    path: "/iframe-resize-causes-parent-shift",
    description:
      "iframe height changes 500ms after load, causing parent reflow + CLS. Attribution must reflect frame-resize via web-vitals LayoutShift.sources[].node.nodeName==='IFRAME'.",
    minOopifAttachments: 1,
    maxOopifAttachments: 1,
    mustHaveMetrics: ["lcp", "fcp", "ttfb", "cls"],
    mayMissMetrics: ["inp"],
    mustHaveAttribution: ["cls"],
  },
  {
    id: "fenced-frame",
    path: "/fenced-frame",
    description:
      "<fencedframe> is a privacy-gated target. Engine should NOT attach (subtype excluded by TARGET_SUBTYPE_FENCED_FRAME guard); parent metrics still emit.",
    minOopifAttachments: 0,
    maxOopifAttachments: 0,
    tolerateNoAttachment: true,
    mustHaveMetrics: ["fcp", "ttfb"],
    mayMissMetrics: ["lcp", "cls", "inp"],
    chromiumFlags: ["--enable-features=FencedFrames,PrivacySandboxAdsAPIsOverride"],
  },
  {
    id: "5xx-error",
    path: "/5xx-error",
    description:
      "Server responds with 503. Engine should still produce a Report (graceful degradation), not throw. TTFB is captured.",
    minOopifAttachments: 0,
    maxOopifAttachments: 0,
    tolerateNoAttachment: true,
    mustHaveMetrics: ["ttfb"],
    mayMissMetrics: ["lcp", "fcp", "cls", "inp"],
  },
];
