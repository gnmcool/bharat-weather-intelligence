# Local languages & voice

**Languages:** English, हिन्दी, ગુજરાતી, मराठी, ਪੰਜਾਬੀ, বাংলা, தமிழ், తెలుగు, ಕನ್ನಡ, മലയാളം, ଓଡ଼ିଆ
(picker in the top bar; remembered per device). Strings live in `frontend/src/lib/i18n.ts`.

**Status: machine-drafted.** Before public release, have every language reviewed by a native
speaker and, for farm terms (crop stages, advisories), by the State Agriculture Department / KVK.
Hindi and Gujarati are the most complete; other languages fall back to English for detailed
screens (risk rules, methodology text).

## Built for farmers who can't read comfortably
* **Farmer → simple view** (default for non-English): big 🔊 *Listen* button, danger icons with
  traffic-light colours, a 7-day picture strip (sky icon, max/min, 💧 rain mm, ✅ good spray day).
* **🔊 Listen** reads today's temperature, rain chance, the week's rain, active dangers, good
  spray days, official-warning notice and a reminder to follow the KVK advisory — in the chosen
  language, using the device's text-to-speech.

## Voices
Speech uses the browser/OS voices:
* **Microsoft Edge (Windows)** — best choice: online "Natural" voices for most Indian languages.
* **Chrome on Android** — Google TTS covers all listed languages (Settings › Text-to-speech).
* **Chrome on Windows** — Hindi usually available; other languages need Windows voice packs
  (Settings › Time & language › Speech › Add voices).
If no voice exists the app says so instead of failing silently.

## Next steps (not built)
* Recorded audio by a native speaker for the fixed phrases (works offline, clearer than TTS).
* Server-side neural TTS (e.g. AI4Bharat Indic-TTS) for devices without voices.
* WhatsApp / IVR voice-call delivery (Missed-call → daily forecast) for feature phones.
* Translate backend explanations (risk rules) via reviewed templates, not machine translation.
