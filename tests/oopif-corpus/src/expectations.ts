export interface FixtureExpectation {
  readonly id: string;
  readonly path: string;
  readonly description: string;
  readonly minOopifAttachments: number;
  readonly maxOopifAttachments: number;
  readonly mustEmitDetach?: boolean;
  readonly tolerateNoAttachment?: boolean;
}

export const FIXTURE_EXPECTATIONS: ReadonlyArray<FixtureExpectation> = [
  {
    id: "oopif-3-cross-origin",
    path: "/oopif-3-cross-origin",
    description: "Parent + 3 cross-origin OOPIFs (each iframe served by a distinct port).",
    minOopifAttachments: 3,
    maxOopifAttachments: 3,
  },
  {
    id: "sandbox-no-scripts",
    path: "/sandbox-no-scripts",
    description:
      "iframe with sandbox=\"\" (no allow-scripts) — still creates an OOPIF target, but in-frame metrics are documented opaque.",
    minOopifAttachments: 1,
    maxOopifAttachments: 1,
  },
  {
    id: "srcdoc-iframe",
    path: "/srcdoc-iframe",
    description:
      "srcdoc iframe is same-origin same-process; expect ZERO OOPIF target attachments — metrics fold into parent.",
    minOopifAttachments: 0,
    maxOopifAttachments: 0,
    tolerateNoAttachment: true,
  },
  {
    id: "iframe-removed-mid-run",
    path: "/iframe-removed-mid-run",
    description:
      "Cross-origin iframe is removed via JS at t≈200ms; expect attach event followed by detach, no engine crash.",
    minOopifAttachments: 1,
    maxOopifAttachments: 1,
    mustEmitDetach: true,
  },
];
