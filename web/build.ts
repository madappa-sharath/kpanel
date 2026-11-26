/**
 * Production build script.
 * Uses Bun.build() JS API so we can pass the Tailwind plugin —
 * the `bun build` CLI doesn't support plugins yet.
 */
import { rmSync } from "node:fs";
import tailwind from "bun-plugin-tailwind";

const outdir = "./dist";

// Bun.build() doesn't clear outdir, and filenames are content-hashed, so stale
// chunks pile up and get embedded into the Go binary via go:embed.
rmSync(outdir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir,
  publicPath: "/",
  minify: true,
  plugins: [tailwind],
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("Build complete → dist/");
