#!/usr/bin/env -S deno run --allow-read --allow-write
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { parse as parseYaml } from "https://deno.land/std@0.224.0/yaml/mod.ts";
const themesDir = "src/lib/theme/themes";
const outCss = "src/lib/theme/generated/themes.css";
function toRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  const n = (s: string) => parseInt(s, 16);
  if (h.length === 3) return `${n(h[0]+h[0])} ${n(h[1]+h[1])} ${n(h[2]+h[2])}`;
  return `${n(h.slice(0,2))} ${n(h.slice(2,4))} ${n(h.slice(4,6))}`;
}
const entries: string[] = [];
for await (const ent of Deno.readDir(themesDir)) if (ent.isFile && ent.name.endsWith(".yaml")) entries.push(ent.name);
entries.sort();
let css = "";
for (const file of entries) {
  const t = parseYaml(await Deno.readTextFile(join(themesDir, file))) as any;
  const sel = t.name === "light" ? ':root,[data-theme="light"]' : `[data-theme="${t.name}"]`;
  css += `${sel}{\n`;
  for (const [k, v] of Object.entries(t.colors ?? {})) css += `--color-${k}: ${toRgb(String(v))};\n`;
  for (const [k, v] of Object.entries(t.radii ?? {})) css += `--radius-${k}: ${v};\n`;
  for (const [k, v] of Object.entries(t.spacing ?? {})) css += `--space-${k}: ${v};\n`;
  const ty = t.typography ?? {};
  if (ty["font-reading"]) css += `--font-reading: ${ty["font-reading"]};\n`;
  if (ty["font-ui"]) css += `--font-ui: ${ty["font-ui"]};\n`;
  if (ty["leading-reading"]) css += `--leading-reading: ${ty["leading-reading"]};\n`;
  if (ty["measure-ch"]) css += `--measure-ch: ${ty["measure-ch"]};\n`;
  css += `}\n\n`;
}
await Deno.mkdir(join("src/lib/theme/generated"), { recursive: true });
await Deno.writeTextFile(outCss, css);
console.log("Wrote", outCss);
