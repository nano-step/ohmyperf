import { defineCommand } from "citty";
import { computePluginIntegrity, createConsoleLogger } from "@ohmyperf/core";
import {
  axePlugin,
  cwvPlugin,
  customMetricExamplePlugin,
} from "@ohmyperf/plugins-builtin";

export const listPluginsCommand = defineCommand({
  meta: {
    name: "list-plugins",
    description: "List the built-in plugin set with version, integrity, capabilities.",
  },
  args: {
    json: {
      type: "boolean",
      description: "Emit a JSON array to stdout",
      default: false,
    },
  },
  async run({ args }): Promise<void> {
    const builtins = [cwvPlugin(), axePlugin(), customMetricExamplePlugin()];
    const entries = builtins.map((p) => ({
      id: p.id,
      version: p.version,
      apiVersion: p.apiVersion,
      capabilities: p.capabilities ?? [],
      integrity: computePluginIntegrity(p),
      source: "built-in" as const,
    }));

    if (args.json) {
      process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
      return;
    }

    const logger = createConsoleLogger({ level: "info", prefix: "ohmyperf:plugins" });
    logger.info(`${String(entries.length)} built-in plugin(s):`);
    for (const e of entries) {
      logger.info(`  ${e.id}@${e.version}  apiVersion=${e.apiVersion}  caps=[${e.capabilities.join(",")}]`);
      logger.info(`    integrity: ${e.integrity}`);
    }
  },
});
