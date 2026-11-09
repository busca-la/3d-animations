import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { get, list, put } from '@vercel/blob';
import { sanitizeFilm } from '../src/filmSchema.js';

const TTL = 1000 * 60 * 60 * 24 * 7;
const PREFIX = 'vp3d-mcp-v1';

function signingKey() {
  const key = process.env.VP_MCP_SIGNING_SECRET;
  if (!key || key.length < 32) throw new Error('Pareamento MCP não configurado na Vercel.');
  return key;
}

function hmac(value) {
  return createHmac('sha256', signingKey()).update(value).digest('hex');
}

export function createPairCode() {
  const id = randomBytes(18).toString('hex');
  const expires = Date.now() + TTL;
  const payload = id + '.' + expires;
  return payload + '.' + hmac(payload);
}

export function verifyPairCode(code) {
  if (typeof code !== 'string' || code.length > 180) throw new Error('Código de pareamento inválido.');
  const parts = code.split('.');
  if (parts.length !== 3 || !/^[a-f0-9]{36}$/.test(parts[0]) || !/^\d{13}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) {
    throw new Error('Código de pareamento inválido.');
  }
  const expected = Buffer.from(hmac(parts[0] + '.' + parts[1]), 'hex');
  const submitted = Buffer.from(parts[2], 'hex');
  if (expected.length !== submitted.length || !timingSafeEqual(expected, submitted)) throw new Error('Código de pareamento inválido.');
  const expires = Number(parts[1]);
  if (expires <= Date.now() || expires > Date.now() + TTL) throw new Error('Código expirado. Gere um novo no site.');
  return { id: parts[0], expires };
}

const pathOf = (id, name) => PREFIX + '/' + id + '/' + name;

async function readJson(path) {
  const result = await get(path, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const payload = await new Response(result.stream).text();
  if (payload.length > 120000) throw new Error('Registro remoto muito grande.');
  return JSON.parse(payload);
}

async function writeNew(path, value) {
  return put(path, JSON.stringify(value), {
    access: 'private', addRandomSuffix: false,
    contentType: 'application/json', cacheControlMaxAge: 60,
  });
}

export async function startPairing() {
  const pairCode = createPairCode();
  const { id, expires } = verifyPairCode(pairCode);
  await writeNew(pathOf(id, 'session.json'), { createdAt: Date.now(), expires });
  return { pairCode, expires };
}

export async function authorize(code) {
  const { id, expires } = verifyPairCode(code);
  const session = await readJson(pathOf(id, 'session.json'));
  if (!session || session.expires !== expires) throw new Error('Pareamento inexistente ou inválido.');
  const revoked = await readJson(pathOf(id, 'revoked.json'));
  if (revoked) throw new Error('Este pareamento foi desconectado. Gere outro código.');
  return { id, expires };
}

export async function revokePairing(code) {
  const { id } = await authorize(code);
  await writeNew(pathOf(id, 'revoked.json'), { revokedAt: new Date().toISOString() });
}

export async function syncCatalog(code, assets, projects, films = []) {
  const { id } = await authorize(code);
  if (!Array.isArray(assets) || assets.length > 300 || !Array.isArray(projects) || projects.length > 100 ||
      !Array.isArray(films) || films.length > 100) {
    throw new Error('Limite de catálogo excedido.');
  }
  const cleanAssets = assets.map((asset) => ({
    id: String(asset.id || '').slice(0, 150),
    name: String(asset.name || '').slice(0, 240),
    kind: ['3d', 'video', 'image', 'audio', 'file'].includes(asset.kind) ? asset.kind : 'file',
    projectId: String(asset.projectId || '').slice(0, 150),
  })).filter((asset) => asset.id && asset.name);
  const cleanProjects = projects.map((project) => ({
    id: String(project.id || '').slice(0, 150),
    name: String(project.name || '').slice(0, 180),
  })).filter((project) => project.id && project.name);
  const cleanFilms = films.map((f) => ({
    id: String(f.id || '').slice(0, 150),
    title: String(f.title || '').slice(0, 100),
    duration: Math.min(90, Math.max(5, Number(f.duration) || 24)),
    format: ['9:16', '16:9', '1:1'].includes(f.format) ? f.format : '9:16',
  })).filter((f) => f.id && f.title);
  await put(pathOf(id, 'catalog.json'), JSON.stringify({
    assets: cleanAssets, projects: cleanProjects, films: cleanFilms, syncedAt: new Date().toISOString(),
  }), { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60 });
  return { assets: cleanAssets.length, projects: cleanProjects.length, films: cleanFilms.length };
}

export async function readCatalog(code) {
  const { id } = await authorize(code);
  return await readJson(pathOf(id, 'catalog.json')) || { assets: [], projects: [], films: [], syncedAt: null };
}

const COMMANDS = new Set(['open_asset', 'camera', 'video_edit', 'film_create', 'film_export', 'film_produce']);

export async function queueCommand(code, type, payload) {
  const { id } = await authorize(code);
  if (!COMMANDS.has(type)) throw new Error('Ação não autorizada.');
  const catalog = await readCatalog(code);
  if (type === 'open_asset' || type === 'video_edit' || (type === 'camera' && payload.assetId)) {
    const asset = catalog.assets.find((item) => item.id === payload.assetId);
    if (!asset) throw new Error('Arquivo não encontrado no catálogo sincronizado.');
    if (type === 'video_edit' && asset.kind !== 'video') throw new Error('O arquivo não é um vídeo editável.');
    if (type === 'camera' && asset.kind !== '3d') throw new Error('O arquivo não é um modelo GLB.');
  }
  if (type === 'film_export') {
    if (!payload || !(catalog.films || []).some((film) => film.id === payload.filmId)) {
      throw new Error('Roteiro não encontrado na lista sincronizada. Abra o site antes de renderizar.');
    }
  }
  if (type === 'film_create' || type === 'film_produce') {
    if (!payload || !payload.film || typeof payload.film !== 'object') throw new Error('Roteiro inválido.');
    const cleanFilm = sanitizeFilm(payload.film);
    cleanFilm.id = '';
    if (cleanFilm.modelAssetId && !catalog.assets.some((asset) =>
      asset.id === cleanFilm.modelAssetId && asset.kind === '3d')) {
      throw new Error('Modelo não encontrado no catálogo. Use um GLB real ou deixe vazio para usar a cidade do estúdio.');
    }
    payload = { film: cleanFilm };
  }
  const commandId = randomBytes(12).toString('hex');
  const command = { id: commandId, type, payload, createdAt: new Date().toISOString() };
  await writeNew(pathOf(id, 'commands/' + commandId + '.json'), command);
  return { commandId, status: 'queued', note: 'Ação enviada. O site precisa estar aberto e pareado para executá-la.' };
}

export async function listPending(code, seen = []) {
  const { id } = await authorize(code);
  const known = new Set(Array.isArray(seen) ? seen.slice(-150) : []);
  const result = await list({ prefix: pathOf(id, 'commands/'), limit: 100 });
  const files = result.blobs.filter((blob) => /commands\/[a-f0-9]{24}\.json$/.test(blob.pathname))
    .filter((blob) => !known.has(blob.pathname.split('/').pop().replace('.json', '')))
    .sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime())
    .slice(0, 15);
  const commands = (await Promise.all(files.map((blob) => readJson(blob.pathname)))).filter(Boolean);
  return { commands };
}

export async function acknowledge(code, commandId, status, reason = '') {
  const { id } = await authorize(code);
  if (!/^[a-f0-9]{24}$/.test(String(commandId))) throw new Error('Comando inválido.');
  if (!['applied', 'failed'].includes(status)) throw new Error('Status inválido.');
  const path = pathOf(id, 'acks/' + commandId + '.json');
  try {
    await writeNew(path, { status, reason: String(reason).slice(0, 300), at: new Date().toISOString() });
  } catch (error) {
    if (!/already exists|conflict|409/i.test(error.message)) throw error;
  }
}

export async function commandStatus(code, commandId) {
  const { id } = await authorize(code);
  if (!/^[a-f0-9]{24}$/.test(String(commandId))) throw new Error('Comando inválido.');
  const command = await readJson(pathOf(id, 'commands/' + commandId + '.json'));
  if (!command) throw new Error('Comando não encontrado.');
  const ack = await readJson(pathOf(id, 'acks/' + commandId + '.json'));
  return { commandId, status: ack?.status || 'queued', reason: ack?.reason || null, at: ack?.at || command.createdAt };
}
