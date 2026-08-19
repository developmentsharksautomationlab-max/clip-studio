export interface CaptionLanguageOption {
  id: string;
  label: string;
  // Instruction fragment fed to the translation prompt — empty for "same"
  // since that means "don't translate, keep the spoken language".
  instruction: string;
}

export const CAPTION_LANGUAGE_OPTIONS: CaptionLanguageOption[] = [
  { id: "same", label: "Same as spoken", instruction: "" },
  { id: "en", label: "English", instruction: "English" },
  { id: "hi", label: "Hindi (Devanagari)", instruction: "Hindi, written in Devanagari script" },
  {
    id: "hi-roman",
    label: "Hindi (Roman)",
    instruction: "Hindi, written phonetically in Latin/Roman script, not Devanagari",
  },
  { id: "ur", label: "Urdu", instruction: "Urdu, written in Urdu (Nastaliq) script" },
  {
    id: "ur-roman",
    label: "Urdu (Roman)",
    instruction: "Urdu, written phonetically in Latin/Roman script, not Urdu script",
  },
  { id: "es", label: "Spanish", instruction: "Spanish" },
  { id: "fr", label: "French", instruction: "French" },
  { id: "ar", label: "Arabic", instruction: "Arabic" },
];

export const DEFAULT_CAPTION_LANGUAGE_ID = "same";

export function isCaptionLanguageId(value: string): boolean {
  return CAPTION_LANGUAGE_OPTIONS.some((o) => o.id === value);
}

// null means "no translation needed" (id is "same", unknown, or missing).
export function resolveCaptionLanguageInstruction(id: string | undefined): string | null {
  const option = CAPTION_LANGUAGE_OPTIONS.find((o) => o.id === id);
  return option?.instruction || null;
}
