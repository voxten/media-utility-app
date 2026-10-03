// Verifies that pl.json and en.json define the same keys (ignoring plural suffixes) and that
// every Polish plural has the _one/_few/_many/_other forms Polish needs.
import fs from "node:fs";

const load = (lang) => JSON.parse(fs.readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), "utf8"));
const PLURAL = /_(zero|one|two|few|many|other)$/;
const flatten = (obj, prefix = "", out = new Map()) => {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") flatten(v, `${prefix}${k}.`, out);
    else out.set(`${prefix}${k}`, v);
  }
  return out;
};
const pl = flatten(load("pl"));
const en = flatten(load("en"));
const base = (keys) => new Set([...keys].map((k) => k.replace(PLURAL, "")));
const plBase = base(pl.keys());
const enBase = base(en.keys());
const problems = [];
for (const k of plBase) if (!enBase.has(k)) problems.push(`missing in en: ${k}`);
for (const k of enBase) if (!plBase.has(k)) problems.push(`missing in pl: ${k}`);
for (const k of pl.keys()) {
  if (!k.endsWith("_one")) continue;
  const stem = k.slice(0, -4);
  for (const form of ["_few", "_many", "_other"]) if (!pl.has(stem + form)) problems.push(`pl plural form missing: ${stem}${form}`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`i18n OK (${plBase.size} keys)`);
