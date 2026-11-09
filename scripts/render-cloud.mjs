// Pipeline reutilizável de vídeo 3D: renderiza quadros com tempo determinístico
// e gera um MP4 H.264 30fps com FFmpeg. Executado na nuvem (não no Mac).
// Pré-requisitos do ambiente: Playwright Chromium, FFmpeg, npm install, Vite online.
// Uso: FILM_FILE=video.json VOICE_FILE=eduardo.mp3 OUTPUT_FILE=filme.mp4
//      FFMPEG_BIN=/path/to/ffmpeg node scripts/render-cloud.mjs
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';

const filmPath = process.env.FILM_FILE || process.argv[2];
if (!filmPath) throw new Error('Informe FILM_FILE com o roteiro JSON.');
const film = JSON.parse(await fsp.readFile(filmPath, 'utf8'));
const fps = 30;
const duration = Number(film.duration) || 24;
const count = Math.round(duration * fps);
const voicePath = process.env.VOICE_FILE || '';
const target = process.env.OUTPUT_FILE || path.resolve('filme-final.mp4');
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const url = process.env.STUDIO_URL || 'http://127.0.0.1:4173';
const renderWidth = Number(process.env.RENDER_WIDTH) || 720;
const renderHeight = Math.round(renderWidth * (film.format === '16:9' ? 9 / 16 : film.format === '1:1' ? 1 : 16 / 9));
const exportWidth = film.format === '16:9' ? 1920 : 1080;
const exportHeight = film.format === '16:9' ? 1080 : film.format === '1:1' ? 1080 : 1920;

function createSoundtrack(shots, seconds, destination) {
  const sampleRate = 22050;
  const total = Math.round(seconds * sampleRate);
  const buffer = Buffer.alloc(44 + total * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(total * 2, 40);
  let random = 0xdeadbeef;
  const rnd = () => {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    return (random >>> 0) / 4294967295;
  };
  let elapsed = 0;
  const cues = [];
  for (let i = 0; i < shots.length - 1; i++) {
    elapsed += shots[i].duration;
    cues.push(elapsed);
  }
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    let sound = Math.sin(t * 16.8) * .004 + Math.sin(t * 24.1) * .003;
    for (const cue of cues) {
      const d = t - cue;
      if (d >= -.07 && d <= .23) {
        const phase = (d + .07) / .30;
        const envelope = Math.pow(Math.sin(Math.PI * phase), 1.4);
        sound += (rnd() - .5) * .075 * envelope +
          Math.sin(2 * Math.PI * (170 * phase + 190 * phase * phase)) * .017 * envelope;
      }
    }
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sound)) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(destination, buffer);
}

const sfxPath = path.join(os.tmpdir(), 'vp3d-sfx-' + process.pid + '.wav');
createSoundtrack(film.shots, duration, sfxPath);

const inputArgs = ['-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'mjpeg', '-i', 'pipe:0'];
if (voicePath) inputArgs.push('-i', voicePath);
inputArgs.push('-i', sfxPath);
const vfilter = '[0:v]scale=' + exportWidth + ':' + exportHeight +
  ':flags=lanczos,fps=' + fps + ',format=yuv420p[v]';
const audioFilter = voicePath
  ? '[1:a]volume=1.04[voice];[2:a]volume=.85[fx];[voice][fx]amix=inputs=2:duration=longest:normalize=0,apad,atrim=duration=' + duration + '[a]'
  : '[1:a]volume=.85,apad,atrim=duration=' + duration + '[a]';
inputArgs.push('-filter_complex', vfilter + ';' + audioFilter,
  '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast',
  '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps),
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', String(duration), target);

const encoder = spawn(ffmpeg, inputArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
let ffmpegOutput = '';
encoder.stderr.on('data', d => { ffmpegOutput += d.toString(); });
const done = new Promise((resolve, reject) => {
  encoder.once('error', reject);
  encoder.once('close', code => code === 0 ? resolve() : reject(new Error('FFmpeg ' + code + ': ' + ffmpegOutput.slice(-1800))));
});

let browser;
try {
  browser = await chromium.launch({ headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url + '/?studio=mcp', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.evaluate(async ({ film, w, h }) => {
    const [{ createFilmEngine }, { sanitizeFilm }] = await Promise.all([
      import('/src/filmEngine.js'), import('/src/filmSchema.js'),
    ]);
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '-10000px';
    document.body.appendChild(canvas);
    const engine = await createFilmEngine(canvas, sanitizeFilm(film), []);
    engine.resize(w, h);
    window.__cloudStudio = { canvas, engine };
  }, { film, w: renderWidth, h: renderHeight });

  for (let i = 0; i < count; i++) {
    const image = await page.evaluate((t) => {
      const { canvas, engine } = window.__cloudStudio;
      engine.render(t);
      return canvas.toDataURL('image/jpeg', .91).split(',')[1];
    }, i / fps);
    if (!encoder.stdin.write(Buffer.from(image, 'base64'))) await once(encoder.stdin, 'drain');
    if ((i + 1) % 120 === 0) console.log('RENDERED', i + 1, '/', count);
  }
  await page.evaluate(() => { window.__cloudStudio.engine.dispose(); window.__cloudStudio.canvas.remove(); });
  await page.close();
  if (errors.length) console.log('BROWSER_ERRORS', JSON.stringify(errors.slice(0, 5)));
  encoder.stdin.end();
  await done;
  const stat = await fsp.stat(target);
  if (stat.size < 30000) throw new Error('O MP4 está vazio ou incompleto.');
  console.log('VIDEO_READY', JSON.stringify({ target, bytes: stat.size, duration, fps, width: exportWidth, height: exportHeight }));
} finally {
  try { encoder.stdin.end(); } catch { /* ignored */ }
  try { await browser?.close(); } catch { /* ignored */ }
  await fsp.unlink(sfxPath).catch(() => {});
}
