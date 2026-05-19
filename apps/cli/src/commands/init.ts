import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineCommand } from "citty";
import { createConsoleLogger } from "@ohmyperf/core";
import { EXIT_CODES } from "../exit-codes.js";

const SUPPORTED_PROVIDERS = ["github", "gitlab", "circle"] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

const TEMPLATE_BY_PROVIDER: Record<SupportedProvider, { source: string; target: string }> = {
  github: { source: "github-actions.yml", target: ".github/workflows/ohmyperf.yml" },
  gitlab: { source: "gitlab-ci.yml", target: ".gitlab-ci.ohmyperf.yml" },
  circle: { source: "circleci-config.yml", target: ".circleci/config.yml" },
};

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description:
      "Scaffold CI templates (GitHub Actions, GitLab CI, or CircleCI) into your repo. Writes the file at the conventional path with --ci <provider>.",
  },
  args: {
    ci: {
      type: "string",
      description: `CI provider (one of: ${SUPPORTED_PROVIDERS.join(", ")})`,
      required: true,
    },
    cwd: {
      type: "string",
      description: "Target directory (defaults to current working directory)",
      default: ".",
    },
    force: {
      type: "boolean",
      description: "Overwrite an existing file at the conventional target path",
      default: false,
    },
  },
  async run({ args }): Promise<void> {
    const logger = createConsoleLogger({ level: "info", prefix: "ohmyperf:init" });
    const provider = String(args.ci);

    if (!SUPPORTED_PROVIDERS.includes(provider as SupportedProvider)) {
      logger.error(
        `unsupported --ci '${provider}' (supported: ${SUPPORTED_PROVIDERS.join(", ")})`,
      );
      process.exit(EXIT_CODES.invalidUsage);
    }

    const cfg = TEMPLATE_BY_PROVIDER[provider as SupportedProvider];
    const cwd = resolve(String(args.cwd));
    const targetPath = join(cwd, cfg.target);

    if (!args.force && (await pathExists(targetPath))) {
      logger.error(`refusing to overwrite ${targetPath}; pass --force to override`);
      process.exit(EXIT_CODES.invalidUsage);
    }

    const sourcePath = resolveTemplate(cfg.source);
    try {
      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
      logger.info(`wrote ${targetPath}`);
      logger.info(
        `next: commit the file, set OHMYPERF_URL (and OHMYPERF_RUNS) in your CI secrets/variables, push.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`failed to write ${targetPath}: ${msg}`);
      process.exit(EXIT_CODES.invalidUsage);
    }
  },
});

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function resolveTemplate(name: string): string {
  const here = fileURLToPath(import.meta.url);
  const candidates = [
    resolve(here, "../../../../templates/ci", name),
    resolve(here, "../../../templates/ci", name),
    resolve(here, "../../templates/ci", name),
  ];
  for (const path of candidates) {
    try {
      void readFile(path);
      return path;
    } catch {}
  }
  return candidates[0]!;
}

export const __INIT_TEST_HOOKS__ = { writeFile, readFile };
