// ElevenLabs request building, shared by /api/tts and scripts/generate-fixed-audio.js.
import { VOICE_STYLES } from '../../config/voice-styles.js';

export const DEFAULT_TTS_MODEL = 'eleven_multilingual_v2';
const API = 'https://api.elevenlabs.io/v1/text-to-speech';
const OUTPUT_FORMAT = 'mp3_44100_128';

// v3/v4 take direction from audio tags and only accept stability/similarity.
export const usesAudioTags = (model) => /^eleven_v[34]/.test(model);

// Rough credit cost per character, for logging only.
export const creditRate = (model) => (/flash|turbo/.test(model) ? 0.5 : 1);

export function ttsModel() {
  return process.env.ELEVENLABS_MODEL || DEFAULT_TTS_MODEL;
}

export function buildTtsBody(text, voiceStyle, model) {
  const cfg = VOICE_STYLES[voiceStyle] || VOICE_STYLES.formal_steady;
  const s = cfg.eleven;
  if (usesAudioTags(model)) {
    // eleven_v3 only accepts stability 0 (creative), 0.5 (natural) or 1 (robust).
    const stability = model.startsWith('eleven_v3')
      ? (s.stability < 0.4 ? 0 : s.stability < 0.75 ? 0.5 : 1)
      : s.stability;
    return {
      text: cfg.tag ? `${cfg.tag} ${text}` : text,
      model_id: model,
      voice_settings: { stability, similarity_boost: s.similarity_boost },
    };
  }
  return {
    text,
    model_id: model,
    voice_settings: {
      stability: s.stability,
      similarity_boost: s.similarity_boost,
      style: s.style,
      speed: s.speed,
      use_speaker_boost: true,
    },
  };
}

/** Calls ElevenLabs and returns the raw fetch Response (streaming or whole-file). */
export function requestSpeech({ voiceId, body, stream, signal }) {
  const url = `${API}/${encodeURIComponent(voiceId)}${stream ? '/stream' : ''}?output_format=${OUTPUT_FORMAT}`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
    },
    body: JSON.stringify(body),
    signal,
  });
}

/** Turns a failed ElevenLabs response into a short error code and message. */
export async function describeFailure(res) {
  const text = await res.text().catch(() => '');
  let status = '';
  try { status = JSON.parse(text)?.detail?.status || ''; } catch { /* not JSON */ }
  const quota = status === 'quota_exceeded' || /quota/i.test(text);
  return {
    code: quota ? 'quota_exceeded' : res.status === 401 ? 'unauthorized' : res.status === 429 ? 'busy' : 'upstream_error',
    message: `ElevenLabs HTTP ${res.status}: ${text.slice(0, 300)}`,
  };
}
