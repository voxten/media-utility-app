// Spoken languages offered by the Transcription tool; Whisper knows more, these cover nearly every request.

import type { SelectOption } from "../../components/Select";

export const SPOKEN_LANGUAGES = [
  "pl", "en", "de", "uk", "ru", "cs", "sk", "es", "fr", "it", "pt", "nl", "sv", "no", "da", "fi",
  "hu", "ro", "lt", "el", "tr", "ar", "he", "hi", "ja", "ko", "zh", "vi", "id",
];

/** Options sorted by their name in the UI language; `auto` is the empty value. */
export function languageOptions(uiLanguage: string, autoLabel: string): SelectOption[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([uiLanguage], { type: "language" });
  } catch {
    names = null;
  }
  const named = SPOKEN_LANGUAGES.map((code) => {
    const name = names?.of(code) ?? code;
    const label = name.charAt(0).toLocaleUpperCase(uiLanguage) + name.slice(1);
    return { value: code, label, keywords: code };
  }).sort((a, b) => a.label.localeCompare(b.label, uiLanguage));
  return [{ value: "", label: autoLabel }, ...named];
}
