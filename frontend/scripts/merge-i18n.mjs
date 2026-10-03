// Deep-merges a patch file ({ "pl": {...}, "en": {...} }) into src/i18n/<lang>.json.
// Usage: node scripts/merge-i18n.mjs path/to/patch.json
import fs from "node:fs";

const patch = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const merge = (target, source) => {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = merge(target[key] && typeof target[key] === "object" ? target[key] : {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
};
for (const [lang, values] of Object.entries(patch)) {
  const file = new URL(`../src/i18n/${lang}.json`, import.meta.url);
  const current = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify(merge(current, values), null, 2) + "\n");
  console.log(`merged ${lang}`);
}
