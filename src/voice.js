// James's voice chain, client side:
//   1. fixed lines   -> static mp3 in /assets/audio/<line_id>.mp3
//   2. live lines    -> /api/tts (ElevenLabs), streamed so playback starts early
//   3. fallback      -> browser SpeechSynthesis. Used for a line if /api/tts errors or gives
//                       no audio within 4 s, and then for the rest of the session (sticky).
// speak() never rejects, so a voice failure can never block subtitles or the game.
// level() and progress() report on whatever is playing, for the mouth flap and for
// revealing subtitles in time with the audio.
import { VOICE_STYLES } from '../config/voice-styles.js';

const FIRST_AUDIO_TIMEOUT_MS = 4000;
const GB_MALE_NAMES = /george|ryan|thomas|daniel|arthur|oliver|male/i;

export class Voice {
  constructor({ ttsUrl = '/api/tts', audioBase = '/assets/audio/' } = {}) {
    this.ttsUrl = ttsUrl;
    this.audioBase = audioBase;
    this.useBrowser = false; // sticky after the first ElevenLabs failure
    this.fallbackReason = null;
    this.muted = false;
    this.browserVoice = null;
    this.gen = 0; // bumps on every speak/stop so stale playback cancels itself
    this.stopCurrent = null;
    if ('speechSynthesis' in window) {
      this.pickBrowserVoice();
      speechSynthesis.addEventListener('voiceschanged', () => this.pickBrowserVoice());
    }
  }

  // Preference: Google UK English Male, any en-GB (male names first), Microsoft Mark/David, default.
  pickBrowserVoice() {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    const gb = voices.filter((v) => /^en[-_]GB/i.test(v.lang));
    this.browserVoice =
      voices.find((v) => v.name === 'Google UK English Male') ||
      gb.find((v) => GB_MALE_NAMES.test(v.name)) ||
      gb[0] ||
      voices.find((v) => /Microsoft Mark/i.test(v.name)) ||
      voices.find((v) => /Microsoft David/i.test(v.name)) ||
      voices.find((v) => v.default) ||
      voices[0];
  }

  // Call from a click (e.g. Begin): browsers only start an AudioContext after a user gesture.
  // The context feeds an analyser that measures the voice's loudness for the mouth flap.
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.ctx.destination);
      this.levelBuf = new Uint8Array(this.analyser.fftSize);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Loudness of the current line, 0..1. Measured from the audio when it runs through the
  // analyser; otherwise (browser voice, or no AudioContext) a timed flap while speaking.
  level() {
    const c = this.current;
    if (!c) return 0;
    if (c.src) {
      this.analyser.getByteTimeDomainData(this.levelBuf);
      let sum = 0;
      for (const v of this.levelBuf) sum += ((v - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 5);
    }
    if (c.audio && c.audio.paused) return 0;
    const t = performance.now() / 1000;
    return Math.max(0, Math.sin(t * 13) * Math.sin(t * 4.7 + 1));
  }

  // { elapsed, duration } in seconds for the current line (duration null while a stream is
  // still arriving), or null before playback has started.
  progress() {
    const c = this.current;
    if (!c) return null;
    if (c.browser) return { elapsed: performance.now() / 1000 - c.start, duration: c.estimate };
    if (c.audio.paused && c.audio.currentTime === 0) return null;
    return { elapsed: c.audio.currentTime, duration: Number.isFinite(c.audio.duration) ? c.audio.duration : null };
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted) this.stop();
  }

  stop() {
    this.gen++;
    if (this.stopCurrent) this.stopCurrent();
    this.stopCurrent = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  /**
   * Speaks one line and resolves when it finishes: { engine, reason?, meta? }.
   * line: { text, voiceStyle, fixedLineId?, ttsBody? }
   *   ttsBody is what /api/tts receives: { stateToken } in the game.
   */
  async speak({ text, voiceStyle, fixedLineId, ttsBody }) {
    this.stop();
    const gen = this.gen;
    if (this.muted) return { engine: 'muted' };

    if (fixedLineId) {
      try {
        const meta = await this.playUrl(`${this.audioBase}${fixedLineId}.mp3`, gen);
        return { engine: 'fixed', meta };
      } catch (err) {
        if (gen !== this.gen) return { engine: 'stopped' };
        // A missing fixed file is not a TTS outage, so this does not make the fallback sticky.
        await this.speakBrowser(text, voiceStyle, gen);
        return { engine: 'browser', reason: `fixed file: ${err.message}` };
      }
    }

    if (!this.useBrowser && ttsBody) {
      try {
        const meta = await this.playTts(ttsBody, gen);
        return { engine: 'elevenlabs', meta };
      } catch (err) {
        if (gen !== this.gen) return { engine: 'stopped' };
        this.useBrowser = true;
        this.fallbackReason = err.message;
        console.warn('[voice] switching to browser voice for this session:', err.message);
      }
    }
    await this.speakBrowser(text, voiceStyle, gen);
    return { engine: 'browser', reason: this.fallbackReason };
  }

  playUrl(url, gen) {
    const started = performance.now();
    const audio = new Audio(url);
    return this.playElement(audio, gen, started);
  }

  async playTts(ttsBody, gen) {
    const started = performance.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FIRST_AUDIO_TIMEOUT_MS);
    let reader, first, res;
    try {
      res = await fetch(this.ttsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ttsBody),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      reader = res.body.getReader();
      first = await reader.read();
      if (first.done || !first.value?.length) throw new Error('empty audio');
    } catch (err) {
      throw new Error(err.name === 'AbortError' ? 'no audio within 4 s' : err.message);
    } finally {
      clearTimeout(timer);
    }
    if (gen !== this.gen) { reader.cancel(); throw new Error('stopped'); }

    const meta = {
      cache: res.headers.get('X-TTS-Cache'),
      chars: res.headers.get('X-TTS-Chars'),
      sessionUsed: res.headers.get('X-TTS-Session-Used'),
    };
    const audio = new Audio();

    if (window.MediaSource && MediaSource.isTypeSupported('audio/mpeg')) {
      // Stream: start playing after the first chunk while the rest downloads.
      const ms = new MediaSource();
      audio.src = URL.createObjectURL(ms);
      await new Promise((r) => ms.addEventListener('sourceopen', r, { once: true }));
      const sb = ms.addSourceBuffer('audio/mpeg');
      const append = (chunk) => new Promise((resolve, reject) => {
        sb.addEventListener('updateend', resolve, { once: true });
        sb.addEventListener('error', reject, { once: true });
        sb.appendBuffer(chunk);
      });
      await append(first.value);
      (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || gen !== this.gen) break;
          await append(value);
        }
        if (ms.readyState === 'open') ms.endOfStream();
      })().catch(() => { try { ms.endOfStream(); } catch { /* already closed */ } });
    } else {
      // No MSE for mp3 (e.g. Safari): download the whole clip, then play.
      const chunks = [first.value];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      audio.src = URL.createObjectURL(new Blob(chunks, { type: 'audio/mpeg' }));
    }
    return { ...meta, ...(await this.playElement(audio, gen, started)) };
  }

  // Plays an <audio> element; resolves when it ends (or is stopped), rejects if it can't start.
  playElement(audio, gen, started) {
    return new Promise((resolve, reject) => {
      let firstAudioMs = null;
      let done = false;
      const finish = (fn, arg) => {
        if (done) return;
        done = true;
        if (this.stopCurrent === stop) this.stopCurrent = null;
        if (this.current?.audio === audio) {
          this.current.src?.disconnect();
          this.current = null;
        }
        fn(arg);
      };
      const stop = () => {
        audio.pause();
        audio.removeAttribute('src');
        finish(resolve, { firstAudioMs, stopped: true });
      };
      this.stopCurrent = stop;
      audio.addEventListener('playing', () => {
        if (firstAudioMs === null) firstAudioMs = Math.round(performance.now() - started);
      });
      audio.addEventListener('ended', () => finish(resolve, { firstAudioMs }));
      audio.addEventListener('error', () => {
        const msg = audio.error?.code === 4 ? 'not found or unsupported' : `media error ${audio.error?.code}`;
        finish(firstAudioMs === null ? reject : resolve, firstAudioMs === null ? new Error(msg) : { firstAudioMs });
      });
      if (gen !== this.gen) return stop();
      this.meter(audio);
      audio.play().catch((err) => finish(reject, new Error(`play blocked: ${err.message}`)));
    });
  }

  // Routes an element through the analyser (only once the context is running; otherwise it
  // would play silently) so level() can measure it.
  meter(audio) {
    this.current = { audio };
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const src = this.ctx.createMediaElementSource(audio);
      src.connect(this.analyser);
      this.current.src = src;
    } catch { /* plays normally, with the timed flap */ }
  }

  // Browser fallback. Resolves when done; a safety timer covers engines that never fire onend.
  speakBrowser(text, voiceStyle, gen = this.gen) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window) || gen !== this.gen) return resolve();
      const cfg = (VOICE_STYLES[voiceStyle] || VOICE_STYLES.formal_steady).browser;
      const u = new SpeechSynthesisUtterance(text);
      if (this.browserVoice) u.voice = this.browserVoice;
      u.lang = this.browserVoice?.lang || 'en-GB';
      u.rate = cfg.rate;
      u.pitch = cfg.pitch;
      u.volume = cfg.volume;
      const words = text.split(/\s+/).length;
      const current = { browser: true, start: performance.now() / 1000, estimate: (words * 0.4) / cfg.rate };
      this.current = current;
      const done = () => {
        clearTimeout(safety);
        if (this.current === current) this.current = null;
        resolve();
      };
      const safety = setTimeout(done, 2000 + words * 700);
      u.onend = u.onerror = done;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    });
  }
}
