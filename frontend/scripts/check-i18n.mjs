import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");

// 0. Auto-sync package.json version with Single Source of Truth in backend/__init__.py
try {
  const initPyPath = path.join(repoRoot, "backend", "__init__.py");
  if (fs.existsSync(initPyPath)) {
    const initPy = fs.readFileSync(initPyPath, "utf8");
    const m = initPy.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
    if (m) {
      const canonicalVersion = m[1];
      const pkgPath = path.join(frontendRoot, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.version !== canonicalVersion) {
        pkg.version = canonicalVersion;
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
        console.log(`[version] Synced package.json version -> ${canonicalVersion}`);
      }
    }
  }
} catch {
  /* non-fatal */
}

const en = JSON.parse(fs.readFileSync(path.join(frontendRoot, "src/i18n/en.json"), "utf8"));
const pl = JSON.parse(fs.readFileSync(path.join(frontendRoot, "src/i18n/pl.json"), "utf8"));

function flatten(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") flatten(v, `${prefix}${k}.`, out);
    else out.set(`${prefix}${k}`, v);
  }
  return out;
}

const enFlat = flatten(en);
const plFlat = flatten(pl);

const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = (keys) => new Set([...keys].map((k) => k.replace(PLURAL, "")));
const enBase = base(enFlat.keys());
const plBase = base(plFlat.keys());

const errors = [];
const warnings = [];

// 1. Cross-check en.json vs pl.json keys
for (const k of plBase) {
  if (!enBase.has(k)) errors.push(`Key '${k}' exists in pl.json but is missing in en.json`);
}
for (const k of enBase) {
  if (!plBase.has(k)) errors.push(`Key '${k}' exists in en.json but is missing in pl.json`);
}

// 2. Polish plural checks
for (const k of plFlat.keys()) {
  if (k.endsWith("_one")) {
    const stem = k.slice(0, -4);
    for (const form of ["_few", "_many", "_other"]) {
      if (!plFlat.has(stem + form)) {
        errors.push(`Polish plural form missing: ${stem}${form}`);
      }
    }
  }
}

// 3. Scan frontend TypeScript files
function walk(dir, extFilter) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      if (!["node_modules", "dist", ".git", "__pycache__", ".venv", "venv"].includes(item)) {
        files.push(...walk(p, extFilter));
      }
    } else if (extFilter(p)) {
      files.push(p);
    }
  }
  return files;
}

const tsFiles = walk(path.join(frontendRoot, "src"), (p) => p.endsWith(".ts") || p.endsWith(".tsx"));

// Regular expression for t("key") or t('key')
const tCallRegex = /\bt\(\s*["']([^"'\r\n]+)["']/g;

for (const file of tsFiles) {
  const content = fs.readFileSync(file, "utf8");
  const relPath = path.relative(frontendRoot, file);
  let match;
  while ((match = tCallRegex.exec(content)) !== null) {
    const key = match[1];
    // Ignore non-i18n strings or format strings
    if (key.includes(" ") || !key.includes(".")) continue;

    if (!enFlat.has(key) && !enBase.has(key)) {
      errors.push(`Frontend [${relPath}]: t("${key}") not found in en.json`);
    }
    if (!plFlat.has(key) && !plBase.has(key)) {
      errors.push(`Frontend [${relPath}]: t("${key}") not found in pl.json`);
    }
  }
}

// 4. Scan backend Python files for ctx.progress, ctx.log, title, error keys
const pyFiles = walk(path.join(repoRoot, "backend"), (p) => p.endsWith(".py"));

const pyProgressRegex = /ctx\.progress\([^,]+,\s*["']([^"']+)["']/g;
const pyLogRegex = /ctx\.log\(\s*["']([^"']+)["']/g;
const pyTitleRegex = /title\s*=\s*["']([a-zA-Z0-9_\.]+)["']/g;

for (const file of pyFiles) {
  const content = fs.readFileSync(file, "utf8");
  const relPath = path.relative(repoRoot, file);
  let match;

  while ((match = pyProgressRegex.exec(content)) !== null) {
    const key = match[1];
    if (key.includes(".") && !key.includes(" ") && !key.includes("{")) {
      if (!enFlat.has(key) && !enBase.has(key)) {
        errors.push(`Backend [${relPath}]: progress status key '${key}' not in en.json`);
      }
      if (!plFlat.has(key) && !plBase.has(key)) {
        errors.push(`Backend [${relPath}]: progress status key '${key}' not in pl.json`);
      }
    }
  }

  while ((match = pyLogRegex.exec(content)) !== null) {
    const key = match[1];
    if (key.includes(".") && !key.includes(" ") && !key.includes("{")) {
      if (!enFlat.has(key) && !enBase.has(key)) {
        errors.push(`Backend [${relPath}]: log key '${key}' not in en.json`);
      }
      if (!plFlat.has(key) && !plBase.has(key)) {
        errors.push(`Backend [${relPath}]: log key '${key}' not in pl.json`);
      }
    }
  }

  while ((match = pyTitleRegex.exec(content)) !== null) {
    const key = match[1];
    if (key.startsWith("deps.installTitle.") || (key.includes(".") && !key.includes(" ") && !key.includes("{"))) {
      if (!enFlat.has(key) && !enBase.has(key)) {
        errors.push(`Backend [${relPath}]: title key '${key}' not in en.json`);
      }
      if (!plFlat.has(key) && !plBase.has(key)) {
        errors.push(`Backend [${relPath}]: title key '${key}' not in pl.json`);
      }
    }
  }
}

// 5. Dynamic tool and category keys verification
const tools = [
  "download",
  "video_sync",
  "compressor",
  "image_tools",
  "converter",
  "rembg",
  "upscale",
  "watermark",
  "tts",
  "pdf",
  "pdf_compress",
  "pdf_split",
  "pdf_convert",
  "pdf_extract",
  "duplicates",
  "progress",
];

for (const t of tools) {
  for (const suffix of ["name", "description"]) {
    const k = `tools.${t}.${suffix}`;
    if (!enFlat.has(k)) errors.push(`Missing dynamic tool key: ${k} in en.json`);
    if (!plFlat.has(k)) errors.push(`Missing dynamic tool key: ${k} in pl.json`);
  }
}

const categories = ["video", "image", "text", "pdf", "system", "generators"];
for (const c of categories) {
  const k = `categories.${c}`;
  if (!enFlat.has(k)) errors.push(`Missing dynamic category key: ${k} in en.json`);
  if (!plFlat.has(k)) errors.push(`Missing dynamic category key: ${k} in pl.json`);
}

const jobStatuses = ["running", "done", "error", "cancelled"];
for (const s of jobStatuses) {
  const k = `common.jobStatus.${s}`;
  if (!enFlat.has(k)) errors.push(`Missing dynamic jobStatus key: ${k} in en.json`);
  if (!plFlat.has(k)) errors.push(`Missing dynamic jobStatus key: ${k} in pl.json`);
}

console.log("\n==============================");
console.log("      i18n AUDIT RESULTS      ");
console.log("==============================");
console.log(`Verified ${enBase.size} base keys across ${tsFiles.length} frontend files and ${pyFiles.length} backend files.`);

if (warnings.length > 0) {
  console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
  for (const w of warnings) console.log(`  - ${w}`);
}

if (errors.length > 0) {
  console.error(`\n❌  ERRORS (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
} else {
  console.log("\n✅  All i18n checks PASSED with 0 errors!\n");
}
