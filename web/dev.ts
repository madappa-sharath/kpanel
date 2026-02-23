import homepage from "./index.html";

const GO_API = "http://localhost:8080";

const server = Bun.serve({
  port: 3000,

  routes: {
    // Bun bundles index.html and all its assets, enables HMR
    "/": homepage,
  },

  development: {
    hmr: true,
    console: true, // stream browser console.log to terminal
  },

  async fetch(req) {
    const url = new URL(req.url);

    // Proxy /api/* to the Go server
    if (url.pathname.startsWith("/api")) {
      return fetch(GO_API + url.pathname + url.search, {
        method: req.method,
        headers: req.headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      });
    }

    // SPA fallback: serve the app shell for any unmatched path (React Router etc.)
    return new Response(Bun.file("./index.html"));
  },
});

console.log(`kpanel dev server: ${server.url}`);
console.log(`API proxy → ${GO_API}`);
