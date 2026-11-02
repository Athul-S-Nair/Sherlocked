// Push-to-talk speech input using the browser's SpeechRecognition (Chrome/Edge). Free: no
// API key or credits. Check `supported` and hide the mic button when it is false.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const ERRORS = {
  'not-allowed': 'Microphone permission was denied.',
  'service-not-allowed': 'Speech recognition is blocked in this browser.',
  'no-speech': 'No speech heard.',
  'audio-capture': 'No microphone found.',
  network: 'Speech recognition needs an internet connection.',
};

/**
 * onInterim(text): live transcript while holding.
 * onFinal(text):   final transcript after release (may be '').
 * onError(msg):    human-readable error.
 */
export function createPushToTalk({ onInterim, onFinal, onError, lang = 'en-IN' }) {
  if (!Recognition) return { supported: false, start() {}, stop() {} };

  let rec = null;
  let finalText = '';
  let interimText = '';

  function start() {
    if (rec) return;
    finalText = '';
    interimText = '';
    rec = new Recognition();
    rec.lang = lang;
    rec.continuous = true; // keep listening while the button is held
    rec.interimResults = true;
    rec.onresult = (e) => {
      interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      onInterim?.((finalText + interimText).trim());
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted') onError?.(ERRORS[e.error] || `Speech recognition error: ${e.error}`);
    };
    rec.onend = () => {
      rec = null;
      // Some engines drop the last interim result on stop; keep it rather than lose words.
      onFinal?.((finalText || interimText).trim());
    };
    rec.start();
  }

  function stop() {
    if (rec) rec.stop();
  }

  return { supported: true, start, stop };
}
