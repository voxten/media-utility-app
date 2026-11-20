import type { SelectOption } from "../../components/Select";
import { fileExtension, FILE_TYPES, PDF_EXTENSIONS } from "../../lib/fileTypes";
import type { OcrLanguage } from "../../lib/types";

export const OCR_EXTENSIONS = FILE_TYPES.imagesAndPdf;

export const isPdf = (path: string) => PDF_EXTENSIONS.includes(fileExtension(path));

/** What the tool works on: every image, or the first PDF alone (a PDF is never mixed with images). */
export function pickSources(paths: string[]): { sources: string[]; skipped: number } {
  const usable = paths.filter((p) => OCR_EXTENSIONS.includes(fileExtension(p)));
  const pdf = usable.find(isPdf);
  const sources = pdf ? [pdf] : usable;
  return { sources, skipped: paths.length - sources.length };
}

function displayName(tag: string, fallback: string, uiLanguage: string): string {
  try {
    const name = new Intl.DisplayNames([uiLanguage], { type: "language" }).of(tag);
    if (name && name !== tag) return name.charAt(0).toLocaleUpperCase(uiLanguage) + name.slice(1);
  } catch {
    return fallback;
  }
  return fallback;
}

/** Installed recognition languages named in the UI language, sorted by that name. */
export function languageOptions(languages: OcrLanguage[], uiLanguage: string): SelectOption[] {
  return languages
    .map((lang) => ({ value: lang.tag, label: displayName(lang.tag, lang.name, uiLanguage), keywords: lang.tag }))
    .sort((a, b) => a.label.localeCompare(b.label, uiLanguage));
}

/** The saved language when it is still installed, else one matching the UI language, else the first. */
export function defaultLanguage(languages: OcrLanguage[], saved: string | undefined, uiLanguage: string): string {
  const tags = languages.map((lang) => lang.tag);
  if (saved && tags.includes(saved)) return saved;
  const ui = uiLanguage.toLowerCase();
  return tags.find((tag) => tag.toLowerCase().split("-")[0] === ui) ?? tags[0] ?? "";
}
