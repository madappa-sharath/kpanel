/**
 * Production build script.
 * Uses Bun.build() JS API so we can pass the Tailwind plugin —
 * the `bun build` CLI doesn't support plugins yet.
 */
import tailwind from "bun-plugin-tailwind";

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
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
