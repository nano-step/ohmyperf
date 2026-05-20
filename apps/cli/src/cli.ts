import { createRequire } from "node:module";
import { defineCommand, runMain } from "citty";
import { runCommand } from "./commands/run.js";
import { doctorCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";
import { listPluginsCommand } from "./commands/list-plugins.js";
import { listStylesCommand } from "./commands/list-styles.js";
import { installBrowserCommand } from "./commands/install-browser.js";
import { diffCommand } from "./commands/diff.js";
import { shareCommand } from "./commands/share.js";

const require = createRequire(import.meta.url);
const pkgVersion = (require("../package.json") as { version: string }).version;

export const main = defineCommand({
  meta: {
    name: "ohmyperf",
    version: pkgVersion,
    description:
      "Real-machine, real-browser web perf measurement with ~99% iframe coverage. Runs on your hardware.",
  },
  subCommands: {
    run: runCommand,
    diff: diffCommand,
    share: shareCommand,
    doctor: doctorCommand,
    init: initCommand,
    "list-plugins": listPluginsCommand,
    "list-styles": listStylesCommand,
    "install-browser": installBrowserCommand,
  },
});

export function runCli(): void {
  void runMain(main);
}
