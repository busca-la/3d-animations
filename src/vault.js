import JSZip from 'jszip';

export const CATEGORIES = [
  { id: 'personagens', label: 'Personagens' },
  { id: 'cenarios', label: 'Cenários' },
  { id: 'objetos', label: 'Objetos' },
  { id: 'animacoes', label: 'Animações' },
  { id: 'texturas', label: 'Texturas' },
  { id: 'audio', label: 'Áudio' },
  { id: 'videos', label: 'Vídeos' },
  { id: 'projetos-blender', label: 'Projetos Blender' },
  { id: 'outros', label: 'Outros' },
];

export const STATUSES = [
  { id: 'idea', label: 'Ideia' },
  { id: 'production', label: 'Em produção' },
  { id: 'review', label: 'Em revisão' },
  { id: 'done', label: 'Finalizado' },
];

export const makeId = () => {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
};

export function categoryFor(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (['blend', 'blend1'].includes(ext)) return 'projetos-blender';
  if (['glb', 'gltf', 'fbx', 'obj', 'stl', 'usd', 'usdz', 'dae', 'abc'].includes(ext)) return 'objetos';
  if (['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)) return 'videos';
  if (['mp3', 'wav', 'ogg', 'flac', 'aiff', 'm4a'].includes(ext)) return 'audio';
  if (['png', 'jpg', 'jpeg', 'webp', 'exr', 'hdr', 'tif', 'tiff', 'svg'].includes(ext)) return 'texturas';
  if (['bvh', 'fbxanim'].includes(ext)) return 'animacoes';
  return 'outros';
}

export function fileKind(asset) {
  if (!asset) return 'file';
  const ext = (asset.name?.split('.').pop() || '').toLowerCase();
  if (ext === 'glb') return '3d';
  if (/^image\//.test(asset.mime || '') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
  if (/^video\//.test(asset.mime || '') || ['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video';
  if (/^audio\//.test(asset.mime || '') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
  return 'file';
}

export function fileExtension(name) {
  const tokens = (name || '').split('.');
  return tokens.length > 1 ? tokens.at(-1).toUpperCase() : 'ARQUIVO';
}

export function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const number = bytes / 1024 ** exponent;
  return (number >= 10 || exponent === 0 ? number.toFixed(0) : number.toFixed(1)).replace('.', ',') + ' ' + units[exponent];
}

export function formatDate(date) {
  if (!date) return '—';
  try { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date)); }
  catch { return '—'; }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000 * 30);
}

export async function makeBackup(projects, assets) {
  const zip = new JSZip();
  const now = new Date().toISOString();
  const manifest = {
    format: 'vitor-productions-3d-vault',
    schema: 1,
    exportedAt: now,
    projects,
    assets: assets.map(({ blob, ...metadata }) => metadata),
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  for (const asset of assets) {
    if (!(asset.blob instanceof Blob)) throw new Error('Arquivo indisponível: ' + asset.name);
    zip.file('files/' + asset.id, asset.blob);
  }
  const archive = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
  const stamp = now.slice(0, 10);
  downloadBlob(archive, 'vitor-productions-3d-backup-' + stamp + '.zip');
  return now;
}

export async function parseBackup(file) {
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file('manifest.json');
  if (!entry) throw new Error('Backup inválido: manifest.json não encontrado.');
  let manifest;
  try { manifest = JSON.parse(await entry.async('string')); }
  catch { throw new Error('Backup inválido: manifest.json corrompido.'); }

  if (manifest.format !== 'vitor-productions-3d-vault' || manifest.schema !== 1 ||
      !Array.isArray(manifest.projects) || !Array.isArray(manifest.assets)) {
    throw new Error('Este ZIP não é um backup compatível com a biblioteca.');
  }

  const cleanProjects = manifest.projects.map((project) => {
    if (!project || typeof project.id !== 'string' || typeof project.name !== 'string') {
      throw new Error('O backup contém um projeto inválido.');
    }
    return {
      id: project.id,
      name: project.name.slice(0, 180),
      description: String(project.description || '').slice(0, 5000),
      status: STATUSES.some((status) => status.id === project.status) ? project.status : 'idea',
      createdAt: project.createdAt || new Date().toISOString(),
      updatedAt: project.updatedAt || new Date().toISOString(),
    };
  });

  const cleanAssets = [];
  for (const asset of manifest.assets) {
    if (!asset || typeof asset.id !== 'string' || !/^[a-z0-9-]{1,128}$/i.test(asset.id) ||
        typeof asset.name !== 'string') {
      throw new Error('O backup contém metadados de arquivo inválidos.');
    }
    const zippedFile = zip.file('files/' + asset.id);
    if (!zippedFile) throw new Error('O ZIP está incompleto: ' + asset.name);
    const contents = await zippedFile.async('blob');
    const mime = typeof asset.mime === 'string' ? asset.mime : '';
    cleanAssets.push({
      id: asset.id,
      name: asset.name.slice(0, 255),
      category: CATEGORIES.some((item) => item.id === asset.category) ? asset.category : 'outros',
      projectId: typeof asset.projectId === 'string' ? asset.projectId : '',
      notes: String(asset.notes || '').slice(0, 5000),
      mime,
      size: contents.size,
      createdAt: asset.createdAt || new Date().toISOString(),
      videoEdit: asset.videoEdit && typeof asset.videoEdit === 'object' ? {
        start: Number.isFinite(asset.videoEdit.start) ? Math.max(0, asset.videoEdit.start) : 0,
        end: Number.isFinite(asset.videoEdit.end) ? Math.max(0, asset.videoEdit.end) : 0,
        speed: [0.5, 0.75, 1, 1.25, 1.5, 2].includes(asset.videoEdit.speed) ? asset.videoEdit.speed : 1,
        aspect: ['9:16', '16:9', 'original'].includes(asset.videoEdit.aspect) ? asset.videoEdit.aspect : '9:16',
        resolution: [720, 1080].includes(asset.videoEdit.resolution) ? asset.videoEdit.resolution : 720,
        fit: ['contain', 'cover'].includes(asset.videoEdit.fit) ? asset.videoEdit.fit : 'cover',
        zoom: ['none', 'in', 'out'].includes(asset.videoEdit.zoom) ? asset.videoEdit.zoom : 'none',
        text: String(asset.videoEdit.text || '').slice(0, 120),
        textPosition: ['center', 'bottom'].includes(asset.videoEdit.textPosition) ? asset.videoEdit.textPosition : 'bottom',
      } : undefined,
      blob: new Blob([contents], { type: mime }),
    });
  }
  return { projects: cleanProjects, assets: cleanAssets };
}
