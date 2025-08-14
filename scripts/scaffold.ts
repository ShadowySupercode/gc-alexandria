#!/usr/bin/env -S deno run --allow-read --allow-write
import { dirname, resolve } from "jsr:@std/path";

/** Read and parse JSON */
async function readJson(p: string) {
  try {
    const txt = await Deno.readTextFile(p);
    return JSON.parse(txt);
  } catch (e) {
    console.error(`Failed to read JSON: ${p}\n${e.message}`);
    Deno.exit(1);
  }
}

/** Ensure parent directory exists */
async function ensureDir(filePath: string) {
  await Deno.mkdir(dirname(filePath), { recursive: true });
}

/** File exists? */
async function exists(p: string) {
  try {
    await Deno.lstat(p);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}

/** Write file if changed; return action marker */
async function writeFile(p: string, content: string) {
  await ensureDir(p);
  const had = await exists(p);
  if (had) {
    const current = await Deno.readTextFile(p);
    if (current === content) return "skip" as const;
  }
  await Deno.writeTextFile(p, content);
  return had ? ("update" as const) : ("create" as const);
}

/** Shallow-merge package.json fields */
function mergePackage(pkg: any, merge: any) {
  const next = { ...pkg };
  for (const key of ["scripts", "dependencies", "devDependencies"]) {
    if (merge?.[key]) next[key] = { ...(pkg[key] || {}), ...merge[key] };
  }
  return next;
}

async function main() {
  const manifestPath = Deno.args[0];
  if (!manifestPath) {
    console.error("Usage: deno run --allow-read --allow-write scripts/scaffold.ts <manifest.json>");
    Deno.exit(1);
  }

  const manifest = await readJson(manifestPath);

  // Optional: merge package.json if present
  const pkgPath = resolve(Deno.cwd(), "package.json");
  if (manifest.package?.merge && (await exists(pkgPath))) {
    const pkg = await readJson(pkgPath);
    const merged = mergePackage(pkg, manifest.package.merge);
    await Deno.writeTextFile(pkgPath, JSON.stringify(merged, null, 2) + "\n");
    console.log("✓ package.json merged");
  } else if (manifest.package?.merge) {
    console.log("• package.json not found — skipping merge");
  }

  // Write files from manifest
  const files = manifest.files ?? [];
  for (const f of files) {
    const out = resolve(Deno.cwd(), String(f.path));
    const action = await writeFile(out, String(f.content ?? ""));
    const marker = action === "skip" ? "•" : action === "update" ? "↻" : "✓";
    console.log(`${marker} ${f.path}`);
  }

  console.log("\nDone.");
}

if (import.meta.main) main();
