import { defineCommand } from "citty";
import { BRAND_IDS, BRAND_MANIFEST } from "@ohmyperf/design-tokens";

export const listStylesCommand = defineCommand({
  meta: {
    name: "list-styles",
    description: "List the available visual styles (brand IDs + manifest metadata).",
  },
  args: {
    json: {
      type: "boolean",
      description: "Emit a JSON array to stdout",
      default: false,
    },
  },
  run({ args }): void {
    if (args.json) {
      const out = BRAND_IDS.map((id) => BRAND_MANIFEST[id]);
      process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
      return;
    }
    const rows = BRAND_IDS.map((id) => {
      const m = BRAND_MANIFEST[id];
      return {
        id,
        displayName: m.displayName,
        preferredTheme: m.preferredTheme,
        supportsLight: m.supportsLight ? "yes" : "no",
        supportsDark: m.supportsDark ? "yes" : "no",
        license: m.license,
        upstreamSha: m.upstreamSha ?? "(authored)",
      };
    });
    const headers: ReadonlyArray<keyof (typeof rows)[number]> = [
      "id",
      "displayName",
      "preferredTheme",
      "supportsLight",
      "supportsDark",
      "license",
      "upstreamSha",
    ];
    const widths = headers.map((h) =>
      Math.max(h.length, ...rows.map((r) => String(r[h]).length)),
    );
    const headerLine = headers.map((h, i) => h.padEnd(widths[i]!)).join("  ");
    const dividerLine = headers.map((_, i) => "─".repeat(widths[i]!)).join("  ");
    process.stdout.write(`${headerLine}\n${dividerLine}\n`);
    for (const r of rows) {
      const line = headers.map((h, i) => String(r[h]).padEnd(widths[i]!)).join("  ");
      process.stdout.write(`${line}\n`);
    }
    for (const id of BRAND_IDS) {
      process.stdout.write(`\n${BRAND_MANIFEST[id].displayName}: ${BRAND_MANIFEST[id].description}\n`);
    }
  },
});
