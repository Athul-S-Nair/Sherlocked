// voice_style → delivery settings. This is the ONE file to tune James's voice by ear.
//
// eleven:  ElevenLabs voice_settings for Multilingual v2 / Flash models.
//          stability: lower = more emotional range and wobble, higher = steadier and flatter.
//          style:     style exaggeration (adds a little latency when non-zero).
//          speed:     1.0 normal (roughly 0.7 to 1.2 is safe).
// tag:     audio tag prefixed to the text ONLY for eleven_v3 / eleven_v4 models, which
//          ignore style/speed and take direction from tags instead. Never shown in subtitles.
// browser: SpeechSynthesis fallback (last resort). rate 0.1-10, pitch 0-2, volume 0-1.
//
// Shared by the server (api/tts) and the client (browser fallback), so it holds no secrets.
export const VOICE_STYLES = {
  formal_steady: {
    eleven: { stability: 0.72, similarity_boost: 0.8, style: 0.1, speed: 0.95 },
    tag: '',
    browser: { rate: 0.95, pitch: 0.9, volume: 1 },
  },
  stiff: {
    eleven: { stability: 0.65, similarity_boost: 0.8, style: 0.2, speed: 1.0 },
    tag: '[coldly]',
    browser: { rate: 1.0, pitch: 0.9, volume: 1 },
  },
  indignant: {
    eleven: { stability: 0.5, similarity_boost: 0.8, style: 0.4, speed: 1.0 },
    tag: '[indignant]',
    browser: { rate: 1.05, pitch: 0.95, volume: 1 },
  },
  uneasy: {
    eleven: { stability: 0.4, similarity_boost: 0.78, style: 0.45, speed: 1.05 },
    tag: '[nervously]',
    browser: { rate: 1.15, pitch: 1.1, volume: 1 },
  },
  strained: {
    eleven: { stability: 0.32, similarity_boost: 0.75, style: 0.55, speed: 1.08 },
    tag: '[tense, hurried]',
    browser: { rate: 1.15, pitch: 1.1, volume: 1 },
  },
  trembling: {
    eleven: { stability: 0.25, similarity_boost: 0.75, style: 0.65, speed: 0.92 },
    tag: '[shaky voice]',
    browser: { rate: 0.85, pitch: 1.0, volume: 0.75 },
  },
  broken_quiet: {
    eleven: { stability: 0.35, similarity_boost: 0.78, style: 0.5, speed: 0.88 },
    tag: '[quietly, ashamed]',
    browser: { rate: 0.8, pitch: 0.85, volume: 0.6 },
  },
};

// Sample lines for the voice test page, one per style, in James's register.
export const SAMPLE_LINES = {
  formal_steady: 'Mr. Holmes, sir. I served dinner all evening. I never went near the study.',
  stiff: 'Might I ask what you are suggesting, sir?',
  indignant: 'Twenty years I have served this family, sir. Twenty years.',
  uneasy: 'I assure you, sir, I was in the dining room the whole... the whole evening.',
  strained: 'The spare key? I— anyone might have taken it, sir. Anyone at all.',
  trembling: 'My boy is not a— he is a good lad, sir. I never meant... I never meant for it to come to this.',
  broken_quiet: 'I took it, sir... for my boy. It is in the wine cellar. I am so very sorry.',
};
