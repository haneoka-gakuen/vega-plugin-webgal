import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (!manifest.repository?.url?.endsWith("/vega-plugin-webgal.git")) {
  throw new Error("package repository must point to the independent WebGAL plugin repository");
}
if (manifest.publishConfig?.access !== "public" || manifest.publishConfig?.provenance !== true) {
  throw new Error("public provenance publishing is required");
}
if (!manifest.files?.includes("NOTICE.webgal.md")) {
  throw new Error("WebGAL provenance notice must ship with the package");
}
process.stdout.write("WebGAL compatibility package boundary verified\n");
