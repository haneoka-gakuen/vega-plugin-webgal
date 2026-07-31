import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const expected = `v${manifest.version}`;
if (process.env.RELEASE_TAG !== expected) {
  throw new Error(
    `GitHub release tag ${JSON.stringify(process.env.RELEASE_TAG)} must equal ${expected}`,
  );
}
process.stdout.write(`Verified release tag ${expected}\n`);
