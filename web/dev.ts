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

    // SPA catch-all: Bun bundles index.html + all assets and enables HMR.
    // This must be "/*" not just "/" so that direct navigation to any route
    // (e.g. /clusters/dev/brokers) gets the bundled app, not a raw file.
    "/*": homepage,
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log(`kpanel dev server: ${server.url}`);
console.log(`API proxy → ${GO_API}`);
