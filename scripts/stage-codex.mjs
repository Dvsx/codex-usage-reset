import { cp, mkdir, readdir, realpath, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codexLink = join(projectRoot, "node_modules", "@openai", "codex");
const codexRoot = await realpath(codexLink);
const packageRoot = join(dirname(codexRoot), "codex-win32-x64");
const outputRoot = join(projectRoot, "build", "codex-runtime");

async function findFile(root, name, depth = 0) {
  if (depth > 8) return null;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return fullPath;
    if (entry.isDirectory()) {
      const match = await findFile(fullPath, name, depth + 1);
      if (match) return match;
    }
  }
  return null;
}

try {
  const metadata = await stat(packageRoot);
  if (!metadata.isDirectory()) throw new Error("not a directory");
} catch {
  throw new Error(`Missing Windows Codex runtime package: ${packageRoot}. Run pnpm install on Windows x64.`);
}

const executable = await findFile(packageRoot, "codex.exe");
if (!executable) throw new Error(`codex.exe was not found below ${packageRoot}`);

const runtimeDirectory = dirname(executable);
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(runtimeDirectory, outputRoot, { recursive: true });
console.log(`Staged Codex runtime from ${runtimeDirectory}`);
