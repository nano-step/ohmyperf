import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FixtureServerEndpoint {
  readonly base: string;
  readonly host: string;
  readonly port: number;
}

export interface FixtureServerHandle {
  readonly origins: ReadonlyArray<FixtureServerEndpoint>;
  close(): Promise<void>;
}

export interface StartFixtureServerOptions {
  readonly originCount?: number;
}

export async function startFixtureServer(
  opts: StartFixtureServerOptions = {},
): Promise<FixtureServerHandle> {
  const originCount = Math.max(1, opts.originCount ?? 4);
  const servers: Server[] = [];
  const origins: FixtureServerEndpoint[] = [];

  for (let i = 0; i < originCount; i++) {
    const server = createServer((req, res) => {
      handleRequest(origins, i, req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as AddressInfo;
    const endpoint: FixtureServerEndpoint = {
      host: "127.0.0.1",
      port: addr.port,
      base: `http://127.0.0.1:${String(addr.port)}`,
    };
    servers.push(server);
    origins.push(endpoint);
  }

  return {
    origins,
    async close() {
      await Promise.all(
        servers.map(
          (s) =>
            new Promise<void>((resolve) => {
              s.close(() => resolve());
            }),
        ),
      );
    },
  };
}

function send(res: import("node:http").ServerResponse, status: number, body: string, type = "text/html; charset=utf-8"): void {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function handleRequest(
  origins: ReadonlyArray<FixtureServerEndpoint>,
  selfIndex: number,
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
): void {
  const url = req.url ?? "/";
  const child1 = origins[1] ?? origins[0]!;
  const child2 = origins[2] ?? origins[0]!;
  const child3 = origins[3] ?? origins[0]!;

  if (url === "/healthz") {
    send(res, 200, JSON.stringify({ ok: true, origin: selfIndex }), "application/json");
    return;
  }

  if (url === "/oopif-3-cross-origin" && selfIndex === 0) {
    send(
      res,
      200,
      `<!doctype html><html><head><title>parent-3-oopif</title></head><body>
<h1>parent</h1>
<iframe src="${child1.base}/child" title="child-1" width="200" height="120"></iframe>
<iframe src="${child2.base}/child" title="child-2" width="200" height="120"></iframe>
<iframe src="${child3.base}/child" title="child-3" width="200" height="120"></iframe>
</body></html>`,
    );
    return;
  }

  if (url === "/sandbox-no-scripts" && selfIndex === 0) {
    send(
      res,
      200,
      `<!doctype html><html><head><title>parent-sandbox</title></head><body>
<h1>parent</h1>
<iframe src="${child1.base}/child" sandbox="" title="sandboxed-no-scripts" width="200" height="120"></iframe>
</body></html>`,
    );
    return;
  }

  if (url === "/srcdoc-iframe" && selfIndex === 0) {
    send(
      res,
      200,
      `<!doctype html><html><head><title>parent-srcdoc</title></head><body>
<h1>parent</h1>
<iframe srcdoc="<p>inline child</p>" title="srcdoc-child" width="200" height="120"></iframe>
</body></html>`,
    );
    return;
  }

  if (url === "/iframe-removed-mid-run" && selfIndex === 0) {
    send(
      res,
      200,
      `<!doctype html><html><head><title>parent-removal</title></head><body>
<h1>parent</h1>
<iframe id="doomed" src="${child1.base}/child" title="will-be-removed" width="200" height="120"></iframe>
<script>
  setTimeout(function () {
    var f = document.getElementById('doomed');
    if (f && f.parentNode) f.parentNode.removeChild(f);
  }, 200);
</script>
</body></html>`,
    );
    return;
  }

  if (url === "/child") {
    send(
      res,
      200,
      `<!doctype html><html><head><title>child</title></head><body>
<p id="from-child">child @ origin ${String(selfIndex)}</p>
</body></html>`,
    );
    return;
  }

  send(res, 404, "not found", "text/plain; charset=utf-8");
}
