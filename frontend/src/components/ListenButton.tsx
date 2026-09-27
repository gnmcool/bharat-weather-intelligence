import { Square, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { speak, stopSpeaking, useT } from "../lib/i18n";
import { useApp } from "../lib/store";

/** Reads `text` aloud in the selected language (browser/OS text-to-speech). */
export default function ListenButton({ text, size = "sm" }: { text: string; size?: "sm" | "lg" }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const [on, setOn] = useState(false);
  const [noVoice, setNoVoice] = useState(false);
  useEffect(() => () => {
    stopSpeaking();
  }, []);
  useEffect(() => {
    stopSpeaking();
    setOn(false);
    setNoVoice(false);
  }, [lang, text]);
  const click = () => {
    if (on) {
      stopSpeaking();
      setOn(false);
      return;
    }
    const ok = speak(lang, text, () => setOn(false));
    setOn(ok);
    setNoVoice(!ok);
  };
  return (
    <span className="relative inline-flex">
      <button onClick={click} aria-label={on ? t("stop") : t("listen")} title={on ? t("stop") : t("listen")}
        className={`inline-flex items-center gap-1.5 rounded-full font-semibold text-white shadow ${on ? "animate-pulse bg-red-500" : "bg-sky-500 hover:bg-sky-400"} ${size === "lg" ? "px-4 py-2 text-[14px]" : "px-3 py-1 text-[12px]"}`}>
        {on ? <Square size={size === "lg" ? 16 : 12} fill="white" /> : <Volume2 size={size === "lg" ? 18 : 14} />}
        {on ? t("stop") : t("listen")}
      </button>
      {noVoice && <span className="absolute left-0 top-full z-10 mt-1 w-64 rounded-lg bg-black/80 p-2 text-[10.5px] text-amber-200">{t("no_voice")}</span>}
    </span>
  );
}
