import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = path.join(root, "dist");
const output = path.resolve(process.argv[3] || defaultOutput);
const repository = process.argv[2] || "";
const [owner = "", repo = ""] = repository.split("/");
const base = repository && repo !== `${owner}.github.io` ? repo : "";
const excluded = new Set([
  ".git",
  ".github",
  "dist",
  "node_modules",
  "scripts",
  "backups",
]);

if (
  output === root ||
  (output !== defaultOutput && !path.relative(root, output).startsWith(".."))
) {
  throw new Error(
    "The build output must be outside the source tree to avoid overwriting project files.",
  );
}
await mkdir(output, { recursive: true });

async function copyTree(source, destination) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (source === root && excluded.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".nojekyll") continue;
    if (/^\.env(?:\.|$)/i.test(entry.name) || entry.name === "AGENTS.md")
      continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await copyTree(from, to);
    } else {
      await cp(from, to);
    }
  }
}

async function rewriteTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteTree(file);
      continue;
    }
    if (!/\.(html|css|js)$/i.test(entry.name)) continue;
    let content = await readFile(file, "utf8");
    if (base) {
      content = content
        .replace(
          /((?:href|src|action)=["'])\/(?!\/)([^"']*)/gi,
          `$1/${base}/$2`,
        )
        .replace(/(url\(\s*["']?)\/(?!\/)([^)'"]*)/gi, `$1/${base}/$2`)
        .replace(
          /((?:from\s*|import\s*\()\s*["'])\/(?!\/)([^"']+)(["'])/g,
          `$1/${base}/$2$3`,
        );
    }
    await writeFile(file, content);
  }
}

await copyTree(root, output);
await rewriteTree(output);
console.log(
  `Static site built at ${output}${base ? ` for /${base}/` : " for the domain root"}.`,
);
