import homepage from "./index.html";

const GO_API = "http://localhost:8080";

function proxyAPI(req: Request): Promise<Response> {
  const url = new URL(req.url);
  return fetch(GO_API + url.pathname + url.search, {
    method: req.method,
    headers: req.headers,
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
  });
}

const server = Bun.serve({
  port: 3000,

  routes: {
    // API proxy — matched before the SPA wildcard
    "/api/*": proxyAPI,

    // SPA catch-all: Bun bundles index.html + all assets and watches them.
    // This must be "/*" not just "/" so that direct navigation to any route
    // (e.g. /clusters/dev/brokers) gets the bundled app, not a raw file.
    "/*": homepage,
  },

  development: {
    // HMR is off until oven-sh/bun#40248 is fixed. Bun's HMR runtime hands a
    // module an import cycle as `null`, and @tanstack/router-core 1.171.16+ reads
    // one at module-eval time, so the app throws before React mounts and every
    // route renders a blank page:
    //
    //   TypeError: Cannot read properties of null (reading 'replaceRouteChunk')
    //
    // Costs while this is off: no auto-reload (save, then refresh — Bun rebundles
    // on the next request) and no browser console forwarding, since `console`
    // below is delivered over the HMR socket. `bun build.ts` is unaffected, which
    // is why this stays a dev-only switch instead of a dependency pin or patch.
    //
    // Fix PR: https://github.com/oven-sh/bun/pull/40259 (unmerged as of Bun 1.4.5)
    hmr: false,
    console: true,
  },
});

console.log(`kpanel dev server: ${server.url}`);
console.log(`API proxy → ${GO_API}`);
