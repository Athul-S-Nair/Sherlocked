// One-off: pre-generates the fixed lines (data/fixed-lines.json) as public/assets/audio/<line_id>.mp3.
// Skips files that already exist, so credits are never spent twice. Delete a file to regenerate it.
//
//   npm run audio:fixed
//
// Needs ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID (James) and ELEVENLABS_HOLMES_VOICE_ID (Holmes).
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import {
  buildTtsBody, requestSpeech, describeFailure, ttsModel, creditRate,
} from '../api/_lib/elevenlabs.js';

const LINES = new URL('../data/fixed-lines.json', import.meta.url);
const OUT_DIR = new URL('../public/assets/audio/', import.meta.url);

const exists = (url) => access(url).then(() => true, () => false);

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is not set');
  const voices = {
    james: process.env.ELEVENLABS_VOICE_ID,
    holmes: process.env.ELEVENLABS_HOLMES_VOICE_ID,
  };
  const model = ttsModel();
  const lines = JSON.parse(await readFile(LINES, 'utf8'));
  await mkdir(OUT_DIR, { recursive: true });

  let credits = 0;
  for (const line of lines) {
    const file = new URL(`${line.line_id}.mp3`, OUT_DIR);
    if (await exists(file)) { console.log(`skip     ${line.line_id} (exists)`); continue; }
    const voiceId = voices[line.speaker];
    if (!voiceId) {
      console.warn(`MISSING  ${line.line_id}: no voice ID for "${line.speaker}" (set ELEVENLABS_${line.speaker === 'holmes' ? 'HOLMES_' : ''}VOICE_ID)`);
      continue;
    }
    const body = buildTtsBody(line.text, line.voice_style || 'formal_steady', model);
    const res = await requestSpeech({ voiceId, body, stream: false });
    if (!res.ok) {
      const fail = await describeFailure(res);
      console.error(`FAILED   ${line.line_id}: ${fail.message}`);
      if (fail.code === 'quota_exceeded' || fail.code === 'unauthorized') break;
      continue;
    }
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    const chars = Number(res.headers.get('x-character-count')) || body.text.length;
    credits += chars * creditRate(model);
    console.log(`wrote    ${line.line_id}.mp3 (${chars} chars, ${model})`);
  }
  console.log(`done. ~${Math.round(credits)} credits used this run.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
