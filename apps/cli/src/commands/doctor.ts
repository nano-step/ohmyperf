import { defineCommand } from "citty";
import { existsSync } from "node:fs";
import { arch as osArch, platform as osPlatform, release as osRelease } from "node:os";
import { createConsoleLogger } from "@ohmyperf/core";
import { EXIT_CODES } from "../exit-codes.js";

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description:
      "Print Node/OS/browser-install/plugin-set diagnostics and exit non-zero if anything is broken.",
  },
  args: {
    quiet: {
      type: "boolean",
      description: "Suppress non-error output",
      default: false,
    },
  },
  async run({ args }): Promise<void> {
    const logger = createConsoleLogger({
      level: args.quiet ? "warn" : "info",
      prefix: "ohmyperf:doctor",
    });
    const issues: string[] = [];

    logger.info(`node:    ${process.version}`);
    logger.info(`os:      ${osPlatform()} ${osRelease()} (${osArch()})`);

    const browserPath = process.env["OHMYPERF_CHROMIUM_PATH"];
    if (browserPath !== undefined && browserPath.length > 0) {
      logger.info(`browser-env: OHMYPERF_CHROMIUM_PATH=${browserPath}`);
      if (!existsSync(browserPath)) {
        issues.push(`OHMYPERF_CHROMIUM_PATH points at a non-existent file: ${browserPath}`);
      }
    } else {
      logger.info("browser-env: not set (will use Playwright's bundled Chromium)");
    }

    const playwrightOk = await tryImportPlaywright();
    if (!playwrightOk) {
      issues.push(
        "playwright is not resolvable from the current cwd; run `pnpm install` (or `npm install`) in your project.",
      );
    } else {
      logger.info("playwright: resolvable");
    }

    const nodeMajor = parseInt(process.versions.node.split(".")[0] ?? "0", 10);
    if (nodeMajor < 20) {
      issues.push(`Node.js ${process.version} is older than the supported minimum (20.x).`);
    }

    if (issues.length === 0) {
      logger.info("status: OK");
      return;
    }

    logger.error(`status: ${String(issues.length)} issue(s) found`);
    for (const i of issues) logger.error(`  - ${i}`);
    process.exit(EXIT_CODES.invalidUsage);
  },
});

async function tryImportPlaywright(): Promise<boolean> {
  try {
    await import("playwright");
    return true;
  } catch {
    return false;
  }
}
