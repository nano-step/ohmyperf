import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineCommand } from "citty";
import { createConsoleLogger, type Report } from "@ohmyperf/core";
import {
  ShareSecretLeakError,
  ShareUploadError,
  uploadReport,
} from "@ohmyperf/share-client";
import { EXIT_CODES } from "../exit-codes.js";

export const shareCommand = defineCommand({
  meta: {
    name: "share",
    description: "Upload a report.json to a share-server endpoint and print the public URL.",
  },
  args: {
    file: { type: "positional", description: "Path to report.json", required: true },
    endpoint: {
      type: "string",
      description: "share-server base URL (e.g. https://ohmyperf.dev)",
      required: false,
    },
    password: {
      type: "string",
      description: "Optional password gate on the share",
      required: false,
    },
    "expires-in-days": {
      type: "string",
      description: "Expiry in days (default: 30)",
      default: "30",
    },
    private: { type: "boolean", description: "Mark the share private", default: false },
    "unsafe-share-with-secrets": {
      type: "boolean",
      description: "Skip env-secret scrubber (NOT RECOMMENDED)",
      default: false,
    },
    json: { type: "boolean", description: "Print JSON status to stdout", default: false },
  },
  async run({ args }): Promise<void> {
    const logger = createConsoleLogger({ level: "info", prefix: "ohmyperf:share" });

    const endpoint = String(
      args.endpoint ?? process.env["OHMYPERF_SHARE_ENDPOINT"] ?? "",
    );
    if (!endpoint || !/^https?:\/\//.test(endpoint)) {
      logger.error(
        "missing share-server --endpoint (or OHMYPERF_SHARE_ENDPOINT env). Example: --endpoint http://localhost:4170",
      );
      process.exit(EXIT_CODES.invalidUsage);
    }

    let report: Report;
    try {
      const body = await readFile(resolve(String(args.file)), "utf8");
      report = JSON.parse(body) as Report;
      if (report.schemaVersion !== "1.0.0") {
        throw new Error(`unsupported schemaVersion: ${String(report.schemaVersion)}`);
      }
    } catch (err) {
      logger.error(`failed to load report: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(EXIT_CODES.invalidUsage);
    }

    const expiresInDays = Number(args["expires-in-days"]);
    try {
      const result = await uploadReport({
        endpoint,
        report,
        ...(args.password ? { password: String(args.password) } : {}),
        expiresInDays: Number.isFinite(expiresInDays) ? expiresInDays : 30,
        private: Boolean(args.private),
        skipRedaction: Boolean(args["unsafe-share-with-secrets"]),
      });
      if (args.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        logger.info(`shared: ${result.url}`);
        logger.info(`expires: ${new Date(result.expiresAt).toISOString()}`);
        if (result.redaction) {
          logger.info(
            `redaction: ${String(result.redaction.headers)} headers, ${String(result.redaction.queryParams)} query params redacted`,
          );
        }
      }
    } catch (err) {
      if (err instanceof ShareSecretLeakError) {
        logger.error(err.message);
        for (const leak of err.leaks) {
          logger.error(`  env-secret detected: ${leak.envKey} appears in ${leak.path}`);
        }
        process.exit(EXIT_CODES.shareUploadRefused);
      }
      if (err instanceof ShareUploadError) {
        logger.error(err.message);
        process.exit(
          err.status === 413 || err.status === 429
            ? EXIT_CODES.shareUploadRefused
            : EXIT_CODES.invalidUsage,
        );
      }
      logger.error(`share failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(EXIT_CODES.invalidUsage);
    }
  },
});
