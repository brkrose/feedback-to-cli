import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/overlay.js"],
  outfile: "dist/feedback-to-cli.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  banner: { js: "/* feedback-to-cli — MIT — https://github.com/brkrose/feedback-to-cli */" },
});

console.log("built dist/feedback-to-cli.js");
