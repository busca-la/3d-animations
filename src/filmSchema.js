// Especificação compartilhada entre o cliente 3D e o servidor MCP.
// Não interpreta código arbitrário: apenas dados e opções enumeradas.
export const CAMERA_MODES = ['abertura', 'rua', 'fachada', 'personagem', 'produto', 'alto', 'travelling'];
export const ACTIONS = ['caminhar', 'correr', 'parar', 'apontar', 'olhar', 'celebrar', 'produto', 'trafego'];
export const MOODS = ['dia', 'tarde', 'noite'];
export const SCENES = ['hamburgueria', 'cidade', 'estudio'];
export const FORMATS = ['9:16', '16:9', '1:1'];
const cleanText = (value, max = 120) => String(value || '').trim().slice(0, max);
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
const enumOr = (value, options, fallback) => options.includes(value) ? value : fallback;

export function demoFilm() {
  return {
    id: '', title: 'A fila muda tudo', scene: 'hamburgueria', mood: 'tarde',
    format: '9:16', duration: 24, fps: 30, accent: '#e6a14a',
    headline: 'Uma fila. Uma escolha.', narration: '',
    shots: [
      { duration: 4, camera: 'abertura', action: 'trafego', text: 'DUAS HAMBURGUERIAS.', move: 0.85 },
      { duration: 5, camera: 'rua', action: 'caminhar', text: 'O MESMO PRODUTO.', move: 0.7 },
      { duration: 5, camera: 'fachada', action: 'parar', text: 'MAS UMA ESTÁ CHEIA.', move: 0.8 },
      { duration: 5, camera: 'personagem', action: 'olhar', text: 'ONDE VOCÊ ENTRARIA?', move: 0.65 },
      { duration: 5, camera: 'produto', action: 'produto', text: 'PERCEPÇÃO MUDA TUDO.', move: 0.75 },
    ],
  };
}

export function sanitizeFilm(input = {}) {
  const data = input && typeof input === 'object' ? input : {};
  const duration = number(data.duration, 24, 5, 90);
  const requested = Array.isArray(data.shots) ? data.shots.slice(0, 18) : [];
  const fallback = demoFilm().shots;
  const source = requested.length ? requested : fallback;
  let shots = source.map((shot, i) => ({
    duration: number(shot.duration, duration / source.length, 0.5, 25),
    camera: enumOr(shot.camera, CAMERA_MODES, CAMERA_MODES[i % CAMERA_MODES.length]),
    action: enumOr(shot.action, ACTIONS, 'caminhar'),
    text: cleanText(shot.text, 85),
    move: number(shot.move, 0.6, 0, 1.5),
  }));
  const total = shots.reduce((sum, item) => sum + item.duration, 0) || 1;
  const factor = duration / total;
  shots = shots.map((shot) => ({ ...shot, duration: Math.round(shot.duration * factor * 1000) / 1000 }));
  const delta = duration - shots.reduce((sum, shot) => sum + shot.duration, 0);
  shots[shots.length - 1].duration = Math.max(0.01, shots[shots.length - 1].duration + delta);
  return {
    id: cleanText(data.id, 150),
    title: cleanText(data.title || 'Novo vídeo 3D', 100),
    scene: enumOr(data.scene, SCENES, 'hamburgueria'),
    mood: enumOr(data.mood, MOODS, 'tarde'),
    format: enumOr(data.format, FORMATS, '9:16'),
    duration, fps: 30,
    accent: /^#[0-9a-f]{6}$/i.test(String(data.accent || '')) ? data.accent : '#e6a14a',
    headline: cleanText(data.headline, 100),
    narration: cleanText(data.narration, 4000),
    modelAssetId: cleanText(data.modelAssetId, 150),
    audioAssetId: cleanText(data.audioAssetId, 150),
    shots,
  };
}

export function shotAt(film, time) {
  const t = Math.max(0, Math.min(film.duration - 0.0001, time));
  let offset = 0;
  for (let i = 0; i < film.shots.length; i++) {
    const duration = film.shots[i].duration;
    if (t < offset + duration || i === film.shots.length - 1) {
      return { shot: film.shots[i], index: i, local: (t - offset) / Math.max(0.01, duration), elapsed: t - offset };
    }
    offset += duration;
  }
  return { shot: film.shots.at(-1), index: film.shots.length - 1, local: 1, elapsed: film.duration };
}
