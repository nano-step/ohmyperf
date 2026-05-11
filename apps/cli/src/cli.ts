import { defineCommand, runMain } from "citty";
import { runCommand } from "./commands/run.js";
import { doctorCommand } from "./commands/doctor.js";
import { listPluginsCommand } from "./commands/list-plugins.js";
import { installBrowserCommand } from "./commands/install-browser.js";
import { diffCommand } from "./commands/diff.js";
import { shareCommand } from "./commands/share.js";

export const main = defineCommand({
  meta: {
    name: "ohmyperf",
    version: "0.0.0-pre",
    description:
      "Real-machine, real-browser web perf measurement with ~99% iframe coverage. Runs on your hardware.",
  },
  subCommands: {
    run: runCommand,
    diff: diffCommand,
    share: shareCommand,
    doctor: doctorCommand,
    "list-plugins": listPluginsCommand,
    "install-browser": installBrowserCommand,
  },
});

export function runCli(): void {
  void runMain(main);
}
