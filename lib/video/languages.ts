export interface LanguageOption {
  id: string;
  label: string;
  // The language code passed to the whisper filter. For the "Roman" Hindi
  // and Urdu options there is no native transliteration mode in whisper.cpp,
  // so these deliberately pass "en": telling the model to expect English
  // output nudges it into writing the (non-English) speech phonetically in
  // Latin script instead of native Devanagari/Nastaliq. This is a
  // best-effort community-known trick, not an officially documented
  // feature, so quality will vary by content.
  whisperLanguage: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: "auto", label: "Auto-detect", whisperLanguage: "auto" },
  { id: "en", label: "English", whisperLanguage: "en" },
  { id: "hi", label: "Hindi", whisperLanguage: "hi" },
  { id: "hi-roman", label: "Hindi (Roman)", whisperLanguage: "en" },
  { id: "ur", label: "Urdu", whisperLanguage: "ur" },
  { id: "ur-roman", label: "Urdu (Roman)", whisperLanguage: "en" },
  { id: "es", label: "Spanish", whisperLanguage: "es" },
  { id: "fr", label: "French", whisperLanguage: "fr" },
  { id: "ar", label: "Arabic", whisperLanguage: "ar" },
];

export const DEFAULT_LANGUAGE_ID = "auto";

export function isLanguageId(value: string): boolean {
  return LANGUAGE_OPTIONS.some((option) => option.id === value);
}

export function resolveWhisperLanguage(languageId: string): string {
  return LANGUAGE_OPTIONS.find((option) => option.id === languageId)?.whisperLanguage ?? "auto";
}
