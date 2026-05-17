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

  if (url === "/bfcache" && selfIndex === 0) {
    send(
      res,
      200,
      `<!doctype html><html><head><title>bfcache-source</title></head><body>
<h1>bfcache source</h1>
<p>This page navigates forward then back to test bfcache restore.</p>
<a id="forward" href="/bfcache-target">go</a>
<script>setTimeout(function(){document.getElementById('forward').click();},300);setTimeout(function(){history.back();},800);</script>
</body></html>`,
    );
    return;
  }

  if (url === "/bfcache-target" && selfIndex === 0) {
    send(res, 200, `<!doctype html><html><body><h1>bfcache target</h1></body></html>`);
    return;
  }

  if (url === "/prerender" && selfIndex === 0) {
    send(
      res,
      200,
      `<!doctype html><html><head><title>prerender-source</title>
<script type="speculationrules">{"prerender":[{"source":"list","urls":["/prerender-target"]}]}</script>
</head><body><h1>prerender source</h1>
<a id="go" href="/prerender-target">target</a>
<script>setTimeout(function(){document.getElementById('go').click();},600);</script>
</body></html>`,
    );
    return;
  }

  if (url === "/prerender-target" && selfIndex === 0) {
    send(res, 200, `<!doctype html><html><body><h1>prerender target</h1></body></html>`);
    return;
  }

  if (url === "/sw-precache" && selfIndex === 0) {
    send(
      res,
      200,
      `<!doctype html><html><head><title>sw-precache</title></head><body>
<h1>service-worker precache</h1>
<script>
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw-precache-worker.js').catch(function(){});
</script>
</body></html>`,
    );
    return;
  }

  if (url === "/sw-precache-worker.js" && selfIndex === 0) {
    send(
      res,
      200,
      `self.addEventListener('install', function (e) {
  e.waitUntil(caches.open('ohmyperf-test-v1').then(function (c) { return c.addAll(['/']); }));
});
self.addEventListener('fetch', function () {});`,
      "application/javascript; charset=utf-8",
    );
    return;
  }

  if (url === "/spa-soft-nav" && selfIndex === 0) {
    send(
      res,
      200,
      `<!doctype html><html><head><title>spa-soft-nav</title></head><body>
<h1>SPA soft nav root</h1>
<div id="route">/initial</div>
<script>
  setTimeout(function () {
    history.pushState({}, '', '/spa-soft-nav/inner');
    document.getElementById('route').textContent = '/inner';
  }, 400);
</script>
</body></html>`,
    );
    return;
  }

  if (url === "/popup" && selfIndex === 0) {
    send(
      res,
      200,
      `<!doctype html><html><head><title>popup-opener</title></head><body>
<h1>popup opener</h1>
<button id="open" onclick="window.open('/child', 'popup');">open</button>
<script>setTimeout(function(){document.getElementById('open').click();},400);</script>
</body></html>`,
    );
    return;
  }

  if (url === "/worker" && selfIndex === 0) {
    send(
      res,
      200,
      `<!doctype html><html><head><title>worker</title></head><body>
<h1>dedicated worker busy loop</h1>
<script>
  var blob = new Blob(['var t=Date.now()+150; while(Date.now()<t){};postMessage("done");'], {type:'application/javascript'});
  var w = new Worker(URL.createObjectURL(blob));
  w.onmessage = function(){};
</script>
</body></html>`,
    );
    return;
  }

  if (url === "/iframe-resize-causes-parent-shift" && selfIndex === 0) {
    send(
      res,
      200,
      `<!doctype html><html><head><title>iframe-resize-parent-shift</title>
<style>iframe{display:block;width:300px;border:1px solid #ccc;transition:none}.below{margin-top:10px;font-size:24px}</style>
</head><body>
<h1>parent</h1>
<iframe id="grow" src="${child1.base}/child" height="40"></iframe>
<p class="below" id="below">below the iframe — this will shift on iframe resize</p>
<script>setTimeout(function(){document.getElementById('grow').height='200';},500);</script>
</body></html>`,
    );
    return;
  }

  if (url === "/fenced-frame" && selfIndex === 0) {
    send(
      res,
      200,
      `<!doctype html><html><head><title>fenced-frame</title></head><body>
<h1>fenced-frame parent</h1>
<fencedframe src="${child1.base}/child" width="200" height="120"></fencedframe>
</body></html>`,
    );
    return;
  }

  if (url === "/5xx-error" && selfIndex === 0) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("<!doctype html><html><body>Service Unavailable</body></html>");
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
