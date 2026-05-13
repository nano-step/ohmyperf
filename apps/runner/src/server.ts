import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { JobStore } from "./queue.js";

const config = readConfig();
const jobs = new JobStore(config);
const app = createApp({ config, jobs });

const server = serve(
  { fetch: app.fetch, port: config.port, hostname: config.bind },
  (info) => {
    process.stderr.write(
      `ohmyperf runner listening on http://${info.address}:${String(info.port)}\n`,
    );
  },
);

const shutdown = async (signal: string): Promise<void> => {
  process.stderr.write(`ohmyperf runner: ${signal} -> shutdown\n`);
  await jobs.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
};

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void shutdown(sig));
}
