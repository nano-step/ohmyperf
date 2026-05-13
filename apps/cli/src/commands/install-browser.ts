import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { defineCommand } from "citty";
import { createConsoleLogger } from "@ohmyperf/core";
import { EXIT_CODES } from "../exit-codes.js";

export const installBrowserCommand = defineCommand({
  meta: {
    name: "install-browser",
    description: "Download Playwright's bundled Chromium (idempotent).",
  },
  args: {
    quiet: {
      type: "boolean",
      default: false,
    },
  },
  async run({ args }): Promise<void> {
    const logger = createConsoleLogger({
      level: args.quiet ? "warn" : "info",
      prefix: "ohmyperf:install-browser",
    });

    const cliPath = resolvePlaywrightCli();
    if (cliPath) {
      logger.info(`running: node ${cliPath} install chromium`);
      const code = await runProcess(process.execPath, [cliPath, "install", "chromium"]);
      if (code === 0) {
        logger.info("Chromium installed");
        return;
      }
      logger.error(`installer exited with code ${String(code)}`);
      process.exit(EXIT_CODES.browserBinaryMissing);
    }

    for (const cmd of ["pnpm", "npx"]) {
      const argv = cmd === "pnpm"
        ? ["exec", "playwright", "install", "chromium"]
        : ["playwright", "install", "chromium"];
      logger.info(`running: ${cmd} ${argv.join(" ")}`);
      const code = await runProcess(cmd, argv);
      if (code === 0) {
        logger.info("Chromium installed");
        return;
      }
      logger.warn(`${cmd} exited with code ${String(code)}; trying next runner`);
    }
    logger.error("Could not install Chromium via any runner. Try `pnpm add -w playwright && pnpm exec playwright install chromium`.");
    process.exit(EXIT_CODES.browserBinaryMissing);
  },
});

function resolvePlaywrightCli(): string | null {
  const cwdRequire = createRequire(`${process.cwd()}/_resolve_anchor.js`);
  try {
    return cwdRequire.resolve("playwright/cli.js");
  } catch {
    try {
      const selfRequire = createRequire(import.meta.url);
      return selfRequire.resolve("playwright/cli.js");
    } catch {
      return null;
    }
  }
}

function runProcess(cmd: string, argv: ReadonlyArray<string>): Promise<number> {
  return new Promise<number>((resolve) => {
    const child = spawn(cmd, [...argv], { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}
