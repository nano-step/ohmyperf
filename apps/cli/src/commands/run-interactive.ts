import { homedir } from "node:os";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { BRAND_IDS, BRAND_MANIFEST, type BrandId } from "@ohmyperf/design-tokens";

export interface InteractiveAnswers {
  readonly url: string;
  readonly style: BrandId;
  readonly mode: "real" | "ci-stable";
  readonly runs: number;
  readonly format: string;
  readonly browserPath: string | undefined;
  readonly output: string;
  readonly plugins: string;
  readonly collectTrace: boolean;
}

const HTTP_URL_PATTERN = /^https?:\/\/[^\s]+$/;

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return resolve(homedir(), value.slice(2));
  return value;
}

export async function promptInteractive(initial: {
  url?: string;
  style?: BrandId;
  mode?: string;
  runs?: number;
  format?: string;
  browserPath?: string;
  output?: string;
}): Promise<InteractiveAnswers | null> {
  p.intro(`${pc.bgCyan(pc.black(" OhMyPerf "))} ${pc.dim("interactive run")}`);

  // NOTE: @clack/core 0.4.2 quirk — when `placeholder` is set, pressing Enter on
  // an empty input SUBMITS THE PLACEHOLDER STRING as the value. To keep empty
  // input meaning "empty", we omit `placeholder` for fields where blank is a
  // legitimate answer (browserPath) and use `defaultValue` (NOT `placeholder`)
  // for fields with real defaults (output dir).

  const url = await p.text({
    message: `URL to measure ${pc.dim("(example: https://example.com)")}`,
    ...(initial.url ? { initialValue: initial.url } : {}),
    validate(value) {
      const v = (value ?? "").trim();
      if (!v) return "URL is required";
      if (!HTTP_URL_PATTERN.test(v)) return "Must be a valid http(s) URL";
      return undefined;
    },
  });
  if (p.isCancel(url)) {
    p.cancel("Cancelled.");
    return null;
  }

  const style = await p.select({
    message: "Visual style",
    initialValue: initial.style ?? "calibre",
    options: BRAND_IDS.map((id) => {
      const m = BRAND_MANIFEST[id];
      const themeHint = `${m.supportsLight ? "light" : ""}${m.supportsLight && m.supportsDark ? "+" : ""}${m.supportsDark ? "dark" : ""}`;
      return {
        value: id,
        label: m.displayName,
        hint: `${themeHint} · preferred ${m.preferredTheme}`,
      };
    }),
  });
  if (p.isCancel(style)) {
    p.cancel("Cancelled.");
    return null;
  }

  const mode = await p.select({
    message: "Measurement mode",
    initialValue: (initial.mode as "real" | "ci-stable") ?? "real",
    options: [
      {
        value: "real",
        label: "real",
        hint: "no throttling · fast dev loop",
      },
      {
        value: "ci-stable",
        label: "ci-stable",
        hint: "CPU calibration + Fast 4G · reproducible for CI",
      },
    ],
  });
  if (p.isCancel(mode)) {
    p.cancel("Cancelled.");
    return null;
  }

  const runsRaw = await p.text({
    message: `Number of runs ${pc.dim("(1-30)")}`,
    initialValue: String(initial.runs ?? 5),
    validate(value) {
      const n = Number((value ?? "").trim());
      if (!Number.isInteger(n) || n < 1 || n > 30) return "Must be an integer 1-30";
      return undefined;
    },
  });
  if (p.isCancel(runsRaw)) {
    p.cancel("Cancelled.");
    return null;
  }
  const runs = Number(String(runsRaw).trim());

  const formats = await p.multiselect({
    message: "Output formats",
    initialValues: (initial.format ?? "json,html,deck").split(",").map((s) => s.trim()),
    required: true,
    options: [
      { value: "json", label: "json", hint: "machine-readable Report" },
      { value: "html", label: "html", hint: "single-file interactive viewer" },
      { value: "deck", label: "deck", hint: "multi-slide presentation" },
      { value: "markdown", label: "markdown", hint: "PR-comment summary" },
      { value: "junit", label: "junit", hint: "CI test runner XML" },
      { value: "csv", label: "csv", hint: "spreadsheet metrics" },
    ],
  });
  if (p.isCancel(formats)) {
    p.cancel("Cancelled.");
    return null;
  }

  const plugins = await p.select({
    message: "Plugin set",
    initialValue: "all",
    options: [
      { value: "all", label: "all", hint: "cwv + axe + custom-metric-example" },
      { value: "cwv+axe", label: "cwv+axe", hint: "skip example plugin" },
      { value: "cwv", label: "cwv", hint: "Core Web Vitals only (fastest)" },
      { value: "none", label: "none", hint: "no plugins" },
    ],
  });
  if (p.isCancel(plugins)) {
    p.cancel("Cancelled.");
    return null;
  }

  // Browser path: empty MUST mean "use bundled". Therefore NO placeholder
  // (clack 0.4 would submit the placeholder as the value on Enter).
  const browserPathRaw = await p.text({
    message: `Chromium binary path ${pc.dim("(optional · empty = Playwright bundled)")}`,
    ...(initial.browserPath ? { initialValue: initial.browserPath } : {}),
  });
  if (p.isCancel(browserPathRaw)) {
    p.cancel("Cancelled.");
    return null;
  }
  const browserPathTrimmed = String(browserPathRaw ?? "").trim();
  const browserPath = browserPathTrimmed.length > 0 ? expandHome(browserPathTrimmed) : undefined;

  const collectTrace = await p.confirm({
    message: "Collect trace (advanced)?",
    initialValue: false,
  });
  if (p.isCancel(collectTrace)) {
    p.cancel("Cancelled.");
    return null;
  }

  // Output dir: defaultValue (NOT placeholder) so empty Enter → use default.
  const outputRaw = await p.text({
    message: "Output directory",
    initialValue: initial.output ?? "./ohmyperf-out",
    defaultValue: "./ohmyperf-out",
    validate(value) {
      const v = (value ?? "").trim();
      if (!v) return undefined;
      if (v === "~" || v.startsWith("~/") || v.startsWith("/") || v.startsWith("./") || v.startsWith("../") || /^[a-zA-Z0-9._-]/.test(v)) {
        return undefined;
      }
      return "Path looks invalid";
    },
  });
  if (p.isCancel(outputRaw)) {
    p.cancel("Cancelled.");
    return null;
  }
  const outputTrimmed = String(outputRaw ?? "").trim();
  const output = expandHome(outputTrimmed.length > 0 ? outputTrimmed : "./ohmyperf-out");

  const urlStr = String(url).trim();
  const summaryLines: string[] = [
    `${pc.dim("URL:")}      ${pc.cyan(urlStr)}`,
    `${pc.dim("Style:")}    ${pc.cyan(BRAND_MANIFEST[style as BrandId].displayName)} ${pc.dim(`(${String(style)})`)}`,
    `${pc.dim("Mode:")}     ${pc.cyan(mode as string)}`,
    `${pc.dim("Runs:")}     ${pc.cyan(String(runs))}`,
    `${pc.dim("Formats:")}  ${pc.cyan((formats as string[]).join(", "))}`,
    `${pc.dim("Plugins:")}  ${pc.cyan(plugins as string)}`,
    `${pc.dim("Output:")}   ${pc.cyan(output)}`,
    `${pc.dim("Browser:")}  ${browserPath ? pc.cyan(browserPath) : pc.dim("(Playwright bundled)")}`,
    `${pc.dim("Trace:")}    ${collectTrace ? pc.cyan("enabled") : pc.dim("disabled")}`,
  ];

  p.note(summaryLines.join("\n"), "Run summary");

  const confirmed = await p.confirm({
    message: "Start measurement?",
    initialValue: true,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Cancelled before measurement started.");
    return null;
  }

  return {
    url: urlStr,
    style: style as BrandId,
    mode: (mode as string) === "ci-stable" ? "ci-stable" : "real",
    runs,
    format: (formats as string[]).join(","),
    browserPath,
    output,
    plugins: plugins as string,
    collectTrace: Boolean(collectTrace),
  };
}

export function isInteractiveContext(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
