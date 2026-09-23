// Voice output.
//
// Three engines, tried in order, because a judge's laptop usually has no Arabic
// or Urdu voice installed and silence would look like a broken demo:
//
//   1. ElevenLabs, if an API key is provided in the voice panel. One multilingual
//      model speaks all three packs, which is what the Stage 2 build uses.
//   2. The browser's own voice for that language, when the machine has one.
//   3. The English line from the same approved template, clearly labelled as a
//      fallback. The words still come from the approved pack, never a translation.
//
// Whatever speaks, the text comes from the approved phrase pack.

const BROWSER_HINTS = {
  'en-AE': ['en-GB', 'en-US', 'en'],
  'ar-AE': ['ar-SA', 'ar-EG', 'ar-AE', 'ar'],
  'ur-AE': ['ur-PK', 'ur-IN', 'ur'],
};

const ELEVEN_API = 'https://api.elevenlabs.io/v1';
const MODELS = ['eleven_v3', 'eleven_multilingual_v2'];

const state = {
  enabled: true,
  key: '',
  voiceId: '',
  voices: [],
  model: MODELS[0],
  lastEngine: null,
  audio: null,
};

let chain = Promise.resolve();

export const voice = {
  get enabled() { return state.enabled; },
  get key() { return state.key; },
  get voices() { return state.voices; },
  get voiceId() { return state.voiceId; },
  get lastEngine() { return state.lastEngine; },

  setEnabled(value) {
    state.enabled = value;
    if (!value) this.stop();
  },

  stop() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (state.audio) {
      state.audio.pause();
      state.audio = null;
    }
  },

  setVoiceId(id) {
    state.voiceId = id;
    try { sessionStorage.setItem('rifq_voice_id', id); } catch { /* private mode */ }
  },

  /** Validates the key by listing voices. Returns { ok, voices, error }. */
  async connect(key) {
    try {
      const res = await fetch(`${ELEVEN_API}/voices`, { headers: { 'xi-api-key': key } });
      if (!res.ok) return { ok: false, error: res.status === 401 ? 'That key was rejected.' : `ElevenLabs replied ${res.status}.` };
      const data = await res.json();
      state.key = key;
      state.voices = (data.voices || []).map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels || {} }));
      const remembered = (() => { try { return sessionStorage.getItem('rifq_voice_id'); } catch { return null; } })();
      state.voiceId = remembered && state.voices.some((v) => v.id === remembered)
        ? remembered
        : state.voices[0]?.id || '';
      try { sessionStorage.setItem('rifq_eleven_key', key); } catch { /* ignore */ }
      return { ok: true, voices: state.voices };
    } catch (err) {
      return { ok: false, error: 'Could not reach ElevenLabs from this browser.' };
    }
  },

  disconnect() {
    state.key = '';
    state.voices = [];
    state.voiceId = '';
    try { sessionStorage.removeItem('rifq_eleven_key'); } catch { /* ignore */ }
  },

  restore() {
    try {
      const key = sessionStorage.getItem('rifq_eleven_key');
      if (key) return this.connect(key);
    } catch { /* ignore */ }
    return Promise.resolve({ ok: false });
  },

  /** Which engine would speak this locale right now, without speaking. */
  engineFor(locale) {
    if (state.key && state.voiceId) return { engine: 'elevenlabs', label: 'ElevenLabs' };
    const browserVoice = pickBrowserVoice(locale);
    if (browserVoice) return { engine: 'browser', label: `Browser voice (${browserVoice.name})` };
    if (locale === 'en-AE') return { engine: 'silent', label: 'No voice available on this device' };
    return { engine: 'english-fallback', label: 'English line from the same template' };
  },

  /**
   * Speaks one line. `enText` is the English rendering of the same approved
   * template, used only when the device has no voice for that language.
   */
  speak(text, locale, { enText, onStart, onEnd, onEngine } = {}) {
    if (!state.enabled) return chain;
    const plan = this.engineFor(locale);
    state.lastEngine = plan.engine;
    chain = chain.then(async () => {
      onEngine?.(plan);
      onStart?.();
      try {
        if (plan.engine === 'elevenlabs') await speakEleven(text, locale);
        else if (plan.engine === 'browser') await speakBrowser(text, locale);
        else if (plan.engine === 'english-fallback' && enText) await speakBrowser(enText, 'en-AE');
        else await pause(Math.min(2400, 400 + text.length * 18));
      } catch {
        await pause(600);
      }
      onEnd?.();
    });
    return chain;
  },
};

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickBrowserVoice(locale) {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  for (const hint of BROWSER_HINTS[locale] || ['en']) {
    const match = voices.find((v) => v.lang?.toLowerCase().replace('_', '-').startsWith(hint.toLowerCase()));
    if (match) return match;
  }
  return null;
}

function speakBrowser(text, locale) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const utter = new SpeechSynthesisUtterance(text);
    const v = pickBrowserVoice(locale);
    if (v) {
      utter.voice = v;
      utter.lang = v.lang;
    }
    utter.rate = 0.97;
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    utter.onend = done;
    utter.onerror = done;
    setTimeout(done, 1500 + text.length * 75);
    window.speechSynthesis.speak(utter);
  });
}

async function speakEleven(text, locale) {
  for (const model of [state.model, ...MODELS.filter((m) => m !== state.model)]) {
    const res = await fetch(`${ELEVEN_API}/text-to-speech/${state.voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': state.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: model,
        language_code: locale.slice(0, 2),
        voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.15, speed: 0.96 },
      }),
    });
    if (res.ok) {
      state.model = model; // remember what this account can actually use
      const blob = await res.blob();
      await playBlob(blob);
      return;
    }
    if (res.status === 401 || res.status === 429) break; // key or quota: stop trying
  }
  // Nothing from the API: fall back so the demo keeps moving.
  await speakBrowser(text, locale);
}

function playBlob(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    state.audio = audio;
    const done = () => { URL.revokeObjectURL(url); resolve(); };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  });
}

export function primeVoices() {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

/** For the voice panel: what each language would sound like right now. */
export function voiceReport() {
  return ['en-AE', 'ar-AE', 'ur-AE'].map((locale) => ({ locale, ...voice.engineFor(locale) }));
}
