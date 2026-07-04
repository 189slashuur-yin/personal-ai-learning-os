import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const targetFlagIndex = args.indexOf("--target");
const inlineTarget = args.find((argument) => argument.startsWith("--target="));
const requestedTarget = inlineTarget?.slice("--target=".length) ??
  (targetFlagIndex >= 0 ? args[targetFlagIndex + 1] : undefined);

if (targetFlagIndex >= 0 && !requestedTarget) {
  throw new Error("--target 需要一个目录路径。");
}

const targetRoot = requestedTarget
  ? path.resolve(requestedTarget)
  : path.join(projectRoot, "backups");

function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function exists(candidate) {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

await mkdir(targetRoot, { recursive: true });
const backupRoot = path.join(targetRoot, `palos-backup-${timestamp()}`);
await mkdir(backupRoot, { recursive: false });

const entries = [
  "docs",
  "README.md",
  "PROJECT.md",
  "ARCHITECTURE.md",
  "ROADMAP.md",
  "HANDOFF.md",
  "CHANGELOG.md",
  "data",
];

const copied = [];
for (const entry of entries) {
  const source = path.join(projectRoot, entry);
  if (!(await exists(source))) continue;
  await cp(source, path.join(backupRoot, entry), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  copied.push(entry);
}

console.log(`PALOS backup created: ${backupRoot}`);
console.log(`Included: ${copied.join(", ")}`);
console.log("Browser LocalStorage is not included; export it separately when an export feature becomes available.");

