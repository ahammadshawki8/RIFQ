// Voice output for the prototype.
//
// The browser's own speech synthesis is used here so the demo runs anywhere with
// no keys and no cost. In the build, Eleven v3 speaks the same approved phrase
// packs: the text comes from the pack either way, which is the part that matters
// for conduct. See docs/architecture.md.

const VOICE_HINTS = {
  'en-AE': ['en-GB', 'en-US', 'en'],
  'ar-AE': ['ar-SA', 'ar-EG', 'ar'],
  'ur-AE': ['ur-PK', 'ur', 'hi-IN'],
};

let enabled = true;
let queue = Promise.resolve();

export function setVoiceEnabled(value) {
  enabled = value;
  if (!value && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function voiceAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice(locale) {
  const voices = window.speechSynthesis.getVoices();
  for (const hint of VOICE_HINTS[locale] || ['en']) {
    const match = voices.find((v) => v.lang?.toLowerCase().startsWith(hint.toLowerCase()));
    if (match) return match;
  }
  return null;
}

/** Speaks one line and resolves when it finishes. Calls are queued in order. */
export function speak(text, locale, { onStart, onEnd } = {}) {
  if (!enabled || !voiceAvailable()) {
    onStart?.();
    queue = queue.then(() => new Promise((r) => setTimeout(() => { onEnd?.(); r(); }, Math.min(2600, 380 + text.length * 22))));
    return queue;
  }
  queue = queue.then(
    () => new Promise((resolve) => {
      const utter = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(locale);
      if (voice) utter.voice = voice;
      utter.lang = voice?.lang || (locale === 'ar-AE' ? 'ar' : locale === 'ur-AE' ? 'ur' : 'en-GB');
      utter.rate = 0.98;
      utter.pitch = 1;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        onEnd?.();
        resolve();
      };
      utter.onstart = () => onStart?.();
      utter.onend = done;
      utter.onerror = done;
      // Some browsers never fire onend for long strings; keep the demo moving.
      setTimeout(done, 1200 + text.length * 70);
      window.speechSynthesis.speak(utter);
    }),
  );
  return queue;
}

export function primeVoices() {
  if (!voiceAvailable()) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}
