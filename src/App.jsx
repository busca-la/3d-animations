import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowDownToLine, ArrowRight, AudioLines, Box, Boxes, Building2,
  CalendarDays, Check, CheckCircle2, ChevronRight, Clapperboard, Clock3,
  CloudOff, Database, Download, FileArchive, FileBox, FileVideo, Film, Bot,
  Folder, FolderOpen, HardDrive, Image as ImageIcon, Info, Layers3,
  LayoutDashboard, Menu, MoreHorizontal, PackageOpen, Plus, Search, ShieldCheck,
  SlidersHorizontal, Sparkles, Trash2, Upload, UserRound, WandSparkles, X, Mic2
} from 'lucide-react';
import { getAll, remove, save, saveMany, storageEstimate } from './db';
import ModelStudio from './ModelStudio.jsx';
import VideoStudio from './VideoStudio.jsx';
import McpBridge from './McpBridge.jsx';
import FilmStudio from './FilmStudio.jsx';
import VoiceStudio from './VoiceStudio.jsx';
import { sanitizeFilm } from './filmSchema.js';
import {
  CATEGORIES, STATUSES, categoryFor, downloadBlob, fileExtension, fileKind,
  formatBytes, formatDate, makeBackup, makeId, parseBackup
} from './vault';

const CATEGORY_ICONS = {
  personagens: UserRound,
  cenarios: Building2,
  objetos: Box,
  animacoes: Clapperboard,
  texturas: ImageIcon,
  audio: AudioLines,
  videos: Film,
  'projetos-blender': Boxes,
  outros: Archive,
};

const NAV = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'library', label: 'Biblioteca', icon: Layers3 },
  { id: 'models', label: 'Visualizador 3D', icon: Box },
  { id: 'video-editor', label: 'Editor de vídeo', icon: Clapperboard },
  { id: 'film-studio', label: 'Diretor de filmes 3D', icon: Film },
  { id: 'voice-studio', label: 'Narração IA', icon: Mic2 },
  { id: 'mcp', label: 'ChatGPT MCP', icon: Bot },
  { id: 'projects', label: 'Projetos', icon: FolderOpen },
  { id: 'backups', label: 'Backups', icon: HardDrive },
];

const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label || 'Ideia';
const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || 'Outros';
const recentFirst = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

function AssetIcon({ asset, size = 22 }) {
  const kind = fileKind(asset);
  const Icon = kind === 'video' ? FileVideo : kind === 'image' ? ImageIcon :
    kind === 'audio' ? AudioLines : kind === '3d' ? Box : CATEGORY_ICONS[asset.category] || FileBox;
  return <Icon size={size} strokeWidth={1.7} />;
}

function AssetThumbnail({ asset, large = false }) {
  const [url, setUrl] = useState('');
  const kind = fileKind(asset);
  useEffect(() => {
    if (!asset?.blob || (kind !== 'image' && kind !== 'video')) return undefined;
    const objectUrl = URL.createObjectURL(asset.blob);
    setUrl(objectUrl);
    return () => { URL.revokeObjectURL(objectUrl); setUrl(''); };
  }, [asset?.id, asset?.blob, kind]);

  return (
    <div className={'asset-thumb ' + (large ? 'asset-thumb-large' : '') + ' kind-' + kind}>
      {kind === 'image' && url ? <img src={url} alt="" loading="lazy" /> :
       kind === 'video' && url ? <video src={url} muted playsInline preload="metadata" /> :
       <div className="asset-placeholder"><AssetIcon asset={asset} size={large ? 42 : 30} /></div>}
      <span className="file-extension">{fileExtension(asset.name)}</span>
    </div>
  );
}

function EmptyState({ icon: Icon = PackageOpen, title, description, action, actionLabel }) {
  return (
    <div className="empty-state">
      <div className="empty-symbol"><Icon size={28} strokeWidth={1.4} /></div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <button className="btn btn-secondary" onClick={action}><Plus size={16} />{actionLabel}</button>}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, width = 'normal' }) {
  useEffect(() => {
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={'modal modal-' + width} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-top">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState(() => {
    // Links diretos abrem a ferramenta sem pop-up, inclusive depois de atualizar o Safari.
    try {
      const requested = new URLSearchParams(window.location.search).get('studio');
      return NAV.some((entry) => entry.id === requested) ? requested : 'overview';
    } catch { return 'overview'; }
  });
  const [projects, setProjects] = useState([]);
  const [assets, setAssets] = useState([]);
  const [films, setFilms] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState('');
  const [offlineDemo, setOfflineDemo] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState([]);
  const [uploadCategory, setUploadCategory] = useState('auto');
  const [uploadProject, setUploadProject] = useState('');
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectEditId, setProjectEditId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectStatus, setProjectStatus] = useState('idea');
  const [selectedId, setSelectedId] = useState('');
  const [studioModelId, setStudioModelId] = useState('');
  const [studioVideoId, setStudioVideoId] = useState('');
  const [remoteCamera, setRemoteCamera] = useState(null);
  const [studioFilmId, setStudioFilmId] = useState('');
  const [remoteFilm, setRemoteFilm] = useState(null);
  const [preferredNarrationId, setPreferredNarrationId] = useState('');
  const [remoteNarration, setRemoteNarration] = useState(null);
  const [detailCategory, setDetailCategory] = useState('outros');
  const [detailProject, setDetailProject] = useState('');
  const [detailNotes, setDetailNotes] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [lastBackup, setLastBackup] = useState(() => {
    try { return localStorage.getItem('vp3d-last-backup') || ''; } catch { return ''; }
  });
  useEffect(() => {
    // Link direto: https://3d-animations-eta.vercel.app/?studio=film-studio
    // Preserva a tela ao atualizar e não cria novas janelas no Safari.
    const url = new URL(window.location.href);
    if (tab === 'overview') url.searchParams.delete('studio');
    else url.searchParams.set('studio', tab);
    window.history.replaceState({ tab }, '', url.pathname + url.search + url.hash);
  }, [tab]);

  const fileInputRef = useRef(null);
  const backupInputRef = useRef(null);

  const refresh = useCallback(async () => {
    // Nunca bloquear a biblioteca aguardando StorageManager. Safari pode demorar
    // indefinidamente ao estimar o espaço de Blobs grandes.
    const [allProjects, allAssets, allFilms] = await Promise.all([
      getAll('projects'), getAll('assets'), getAll('films'),
    ]);
    setProjects(allProjects.sort(recentFirst));
    setAssets(allAssets.sort(recentFirst));
    setFilms(allFilms.sort(recentFirst));
    storageEstimate().then(setEstimate).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    // Mesmo se uma API de armazenamento do Safari não responder, a tela
    // "Preparando seu estúdio" NÃO pode prender o usuário para sempre.
    const watchdog = window.setTimeout(() => {
      if (!active) return;
      setStorageError('O Safari demorou para abrir a biblioteca. Nenhum arquivo foi apagado.');
      setLoading(false);
    }, 11000);
    refresh().then(() => {
      if (active) setStorageError('');
    }).catch((error) => {
      if (active) setStorageError(error.message || 'O Safari não abriu a biblioteca local.');
    }).finally(() => {
      if (!active) return;
      window.clearTimeout(watchdog);
      setLoading(false);
    });
    return () => { active = false; window.clearTimeout(watchdog); };
  }, [refresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timeout);
  }, [toast]);

  const selected = assets.find((item) => item.id === selectedId);
  useEffect(() => {
    if (!selected) return undefined;
    setDetailCategory(selected.category);
    setDetailProject(selected.projectId || '');
    setDetailNotes(selected.notes || '');
    setModelReady(false);
    const url = URL.createObjectURL(selected.blob);
    setPreviewUrl(url);
    return () => { URL.revokeObjectURL(url); setPreviewUrl(''); };
  }, [selected?.id]);

  useEffect(() => {
    if (selected && fileKind(selected) === '3d' && !modelReady) {
      let active = true;
      import('@google/model-viewer').then(() => { if (active) setModelReady(true); })
        .catch(() => { if (active) setModelReady(false); });
      return () => { active = false; };
    }
    return undefined;
  }, [selected?.id, modelReady]);

  const totalSize = useMemo(() => assets.reduce((sum, a) => sum + (a.size || 0), 0), [assets]);
  const filteredAssets = useMemo(() => assets.filter((asset) => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    const project = projects.find((item) => item.id === asset.projectId);
    return (category === 'all' || asset.category === category) &&
      (projectFilter === 'all' || asset.projectId === projectFilter) &&
      (!query || (asset.name + ' ' + (asset.notes || '') + ' ' + (project?.name || '')).toLocaleLowerCase('pt-BR').includes(query));
  }), [assets, search, category, projectFilter, projects]);

  const filesByCategory = useMemo(() => Object.fromEntries(CATEGORIES.map(
    (item) => [item.id, assets.filter((asset) => asset.category === item.id).length]
  )), [assets]);

  const notice = (text, type = 'success') => setToast({ text, type });

  function selectLibrary(cat = 'all', project = 'all') {
    setCategory(cat);
    setProjectFilter(project);
    setTab('library');
  }

  function openUpload(files = []) {
    setQueuedFiles(Array.from(files));
    setUploadCategory('auto');
    setUploadProject(projectFilter === 'all' ? '' : projectFilter);
    setUploadOpen(true);
  }

  async function submitUpload(event) {
    event.preventDefault();
    if (!queuedFiles.length) return notice('Escolha pelo menos um arquivo.', 'error');
    setBusy('upload');
    try {
      const records = queuedFiles.map((file) => ({
        id: makeId(), name: file.name, mime: file.type || '',
        category: uploadCategory === 'auto' ? categoryFor(file.name) : uploadCategory,
        projectId: uploadProject, size: file.size, createdAt: new Date().toISOString(),
        notes: '', blob: file,
      }));
      await saveMany('assets', records);
      await refresh();
      setUploadOpen(false);
      setQueuedFiles([]);
      notice(records.length === 1 ? 'Arquivo adicionado à biblioteca.' : records.length + ' arquivos adicionados.');
      setTab('library');
      setCategory('all');
    } catch (error) { notice('Falha ao armazenar: ' + error.message, 'error'); }
    finally { setBusy(''); }
  }

  function openProject(project = null) {
    setProjectEditId(project?.id || '');
    setProjectName(project?.name || '');
    setProjectDescription(project?.description || '');
    setProjectStatus(project?.status || 'idea');
    setProjectOpen(true);
  }

  async function submitProject(event) {
    event.preventDefault();
    if (!projectName.trim()) return notice('Informe o nome do projeto.', 'error');
    setBusy('project');
    try {
      const original = projects.find((item) => item.id === projectEditId);
      const now = new Date().toISOString();
      await save('projects', {
        id: original?.id || makeId(),
        name: projectName.trim().slice(0, 180),
        description: projectDescription.trim().slice(0, 5000),
        status: projectStatus,
        createdAt: original?.createdAt || now,
        updatedAt: now,
      });
      await refresh();
      setProjectOpen(false);
      notice(original ? 'Projeto atualizado.' : 'Projeto criado.');
    } catch (error) { notice(error.message, 'error'); }
    finally { setBusy(''); }
  }

  async function submitAssetDetails(event) {
    event.preventDefault();
    if (!selected) return;
    setBusy('asset-detail');
    try {
      await save('assets', {
        ...selected, category: detailCategory, projectId: detailProject,
        notes: detailNotes.slice(0, 5000),
      });
      await refresh();
      notice('Detalhes salvos.');
    } catch (error) { notice(error.message, 'error'); }
    finally { setBusy(''); }
  }

  async function saveVideoEdit(id, videoEdit) {
    const asset = assets.find((item) => item.id === id);
    if (!asset) throw new Error('Vídeo não encontrado.');
    await save('assets', { ...asset, videoEdit });
    await refresh();
  }

  async function saveFilm(film) {
    const cleaned = sanitizeFilm(film);
    const now = new Date().toISOString();
    const old = films.find((f) => f.id === cleaned.id);
    const stored = { ...cleaned, id: old?.id || makeId(),
      createdAt: old?.createdAt || now, updatedAt: now };
    if (stored.modelAssetId && !assets.some(a => a.id === stored.modelAssetId && fileKind(a) === '3d')) {
      throw new Error('O modelo GLB escolhido não está disponível neste navegador.');
    }
    await save('films', stored);
    await refresh();
    return stored;
  }

  async function deleteFilm(id) {
    await remove('films', id);
    if (studioFilmId === id) setStudioFilmId('__new__');
    await refresh();
  }

  async function saveGeneratedNarration({ blob, filename, text, voiceId }) {
    if (!(blob instanceof Blob) || !/^audio\//.test(blob.type)) throw new Error('Arquivo de narração inválido.');
    const record = {
      id: makeId(), name: filename, mime: 'audio/wav', category: 'audio', projectId: '',
      size: blob.size, createdAt: new Date().toISOString(), notes: 'Narração criada com IA local · Piper',
      generatedBy: 'vp-native-piper', narrationText: String(text).slice(0, 3500),
      narrationVoice: String(voiceId), blob,
    };
    await save('assets', record);
    await refresh();
    notice('Narração criada e salva na biblioteca.');
    return record;
  }

  async function saveProducedVideo(blob, filename, film) {
    const record = {
      id: makeId(), name: filename, mime: blob.type || (filename.endsWith('.mp4') ? 'video/mp4' : 'video/webm'),
      category: 'videos', projectId: '', size: blob.size, createdAt: new Date().toISOString(),
      notes: 'Produzido no Diretor de Filmes 3D · ' + film.title, blob,
    };
    await save('assets', record);
    await refresh();
    notice('Filme produzido e salvo na biblioteca.');
    return record;
  }

  function openInStudio(asset) {
    if (fileKind(asset) === '3d') {
      setStudioModelId(asset.id);
      setTab('models');
    } else if (fileKind(asset) === 'video') {
      setStudioVideoId(asset.id);
      setTab('video-editor');
    }
    setSelectedId('');
  }

  const executeMcpCommand = useCallback(async (command) => {
    const { type, payload = {} } = command;
    const target = payload.assetId ? assets.find((item) => item.id === payload.assetId) : null;
    if (type === 'voice_generate') {
      setRemoteNarration({ id: command.id, payload });
      setTab('voice-studio');
      return { deferred: true };
    }
    if (type === 'open_asset') {
      if (!target) throw new Error('Arquivo não encontrado neste navegador.');
      if (fileKind(target) === '3d') { setStudioModelId(target.id); setTab('models'); }
      else if (fileKind(target) === 'video') { setStudioVideoId(target.id); setTab('video-editor'); }
      else throw new Error('Somente GLB e vídeos podem ser abertos pelos estúdios.');
      return { applied: true };
    }
    if (type === 'camera') {
      const model = target || assets.find((item) => item.id === studioModelId && fileKind(item) === '3d') ||
        assets.find((item) => fileKind(item) === '3d');
      if (!model || fileKind(model) !== '3d') throw new Error('Nenhum modelo GLB disponível para controlar.');
      setStudioModelId(model.id);
      setRemoteCamera({ id: command.id, payload: { ...payload, assetId: model.id } });
      setTab('models');
      return { deferred: true };
    }
    if (type === 'film_create') {
      const film = await saveFilm(payload.film);
      setStudioFilmId(film.id);
      setTab('film-studio');
      return { applied: true, filmId: film.id };
    }
    if (type === 'film_produce') {
      const film = await saveFilm(payload.film);
      setStudioFilmId(film.id);
      setRemoteFilm({ id: command.id, payload: { filmId: film.id } });
      setTab('film-studio');
      return { deferred: true };
    }
    if (type === 'film_export') {
      const film = films.find(f => f.id === payload.filmId);
      if (!film) throw new Error('Roteiro não encontrado no navegador.');
      setStudioFilmId(film.id);
      setRemoteFilm({ id: command.id, payload: { filmId: film.id } });
      setTab('film-studio');
      return { deferred: true };
    }
    if (type === 'video_edit') {
      if (!target || fileKind(target) !== 'video') throw new Error('Vídeo não encontrado neste navegador.');
      const clean = {
        ...target.videoEdit,
        start: Math.max(0, Number(payload.start) || 0),
        end: Math.max(0, Number(payload.end) || 0),
        speed: [0.5, 0.75, 1, 1.25, 1.5, 2].includes(Number(payload.speed)) ? Number(payload.speed) : 1,
        aspect: ['9:16', '16:9', 'original'].includes(payload.aspect) ? payload.aspect : '9:16',
        zoom: ['none', 'in', 'out'].includes(payload.zoom) ? payload.zoom : 'none',
        text: String(payload.text || '').slice(0, 120),
      };
      await save('assets', { ...target, videoEdit: clean });
      await refresh();
      setStudioVideoId(target.id);
      setTab('video-editor');
      return { applied: true };
    }
    throw new Error('Comando remoto desconhecido.');
  }, [assets, films, studioModelId, refresh]);

  function confirmAssetDelete(asset) {
    setConfirm({
      title: 'Excluir arquivo?',
      message: 'O arquivo "' + asset.name + '" será removido deste navegador. Essa ação não pode ser desfeita sem um backup.',
      execute: async () => { await remove('assets', asset.id); setSelectedId(''); await refresh(); notice('Arquivo excluído.'); },
    });
  }

  function confirmProjectDelete(project) {
    setConfirm({
      title: 'Excluir projeto?',
      message: 'O projeto "' + project.name + '" será excluído. Os arquivos permanecerão na biblioteca, sem vínculo.',
      execute: async () => {
        const linked = assets.filter((asset) => asset.projectId === project.id);
        await saveMany('assets', linked.map((asset) => ({ ...asset, projectId: '' })));
        await remove('projects', project.id);
        if (projectFilter === project.id) setProjectFilter('all');
        await refresh();
        notice('Projeto excluído. Arquivos preservados.');
      },
    });
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy('confirm');
    try { await confirm.execute(); setConfirm(null); }
    catch (error) { notice(error.message, 'error'); }
    finally { setBusy(''); }
  }

  async function exportBackup() {
    setBusy('backup');
    try {
      const date = await makeBackup(projects, assets, films);
      setLastBackup(date);
      try { localStorage.setItem('vp3d-last-backup', date); } catch { /* optional */ }
      notice('Backup ZIP gerado. Guarde o download em outro lugar.');
    } catch (error) { notice('Não foi possível gerar o ZIP: ' + error.message, 'error'); }
    finally { setBusy(''); }
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('restore');
    try {
      const parsed = await parseBackup(file);
      await saveMany('projects', parsed.projects);
      await saveMany('assets', parsed.assets);
      if (parsed.films?.length) await saveMany('films', parsed.films);
      await refresh();
      notice('Backup restaurado: ' + parsed.projects.length + ' projetos, ' + parsed.assets.length + ' arquivos e ' + (parsed.films?.length || 0) + ' filmes.');
      setTab('overview');
    } catch (error) { notice('Não foi possível importar: ' + error.message, 'error'); }
    finally { setBusy(''); }
  }

  function handleDrop(event) {
    event.preventDefault();
    if (event.dataTransfer?.files?.length && !uploadOpen && !projectOpen && !selected) {
      openUpload(event.dataTransfer.files);
    }
  }

  function statusCounts(status) { return projects.filter((project) => project.status === status).length; }

  async function retryLibrary() {
    setLoading(true);
    setStorageError('');
    try {
      await refresh();
      setOfflineDemo(false);
      notice('Biblioteca reaberta com sucesso.');
    } catch (error) {
      setStorageError(error.message || 'A biblioteca não respondeu.');
    } finally { setLoading(false); }
  }

  if (isLoading) {
    return <div className="boot-screen" role="status">
      <div className="brand-mark">V<span>·</span>P</div>
      <span>Preparando seu estúdio…</span>
      <small className="boot-subtitle">Abrindo seus projetos locais com segurança.</small>
    </div>;
  }

  if (storageError && !offlineDemo) {
    return <main className="storage-recovery" role="main">
      <div className="storage-recovery-card">
        <div className="brand-mark">V<span>·</span>P</div>
        <p className="section-kicker">VITOR PRODUCTIONS / DIAGNÓSTICO</p>
        <h1>O estúdio abriu. Sua biblioteca precisa de atenção.</h1>
        <p>{storageError}</p>
        <p><strong>Seus arquivos não foram excluídos.</strong> O Safari pode bloquear a abertura do IndexedDB durante uma atualização ou leitura de arquivos grandes.</p>
        <div className="storage-recovery-actions">
          <button className="btn btn-primary" onClick={retryLibrary}><Database size={18}/> Tentar abrir biblioteca</button>
          <button className="btn btn-secondary" onClick={() => {
            setOfflineDemo(true); setTab('film-studio');
          }}><Film size={18}/> Abrir Diretor 3D sem biblioteca</button>
        </div>
        <small>Não limpe os dados do site. O modo sem biblioteca permite visualizar e gerar um teste 3D, mas não acessa seus projetos salvos até o armazenamento voltar.</small>
      </div>
    </main>;
  }

  return (
    <div className="app-shell" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">V<span>·</span>P</div>
          <div className="brand-copy"><strong>VITOR PRODUCTIONS</strong><span>3D PRODUCTION VAULT</span></div>
        </div>
        <div className="nav-title">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Navegação principal">
          {NAV.map(({ id, label, icon: Icon }) =>
            <button key={id} onClick={() => setTab(id)} className={'nav-item ' + (tab === id ? 'active' : '')}>
              <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
              {id === 'library' && assets.length > 0 && <small>{assets.length}</small>}
            </button>
          )}
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-title">COLEÇÕES</div>
        <nav className="sidebar-nav categories-nav" aria-label="Categorias">
          {CATEGORIES.slice(0, 6).map((item) => {
            const Icon = CATEGORY_ICONS[item.id];
            return (
              <button className={'nav-item compact ' + (tab === 'library' && category === item.id ? 'active' : '')}
                key={item.id} onClick={() => selectLibrary(item.id)}>
                <Icon size={17} strokeWidth={1.7} /><span>{item.label}</span>
                <small>{filesByCategory[item.id] || 0}</small>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-label"><CloudOff size={16} /><span>Modo local · privado neste dispositivo</span></div>
          <p>Seus arquivos não são enviados para o GitHub nem para um servidor.</p>
          <button onClick={() => setTab('backups')}><ShieldCheck size={17} /> Proteger meus arquivos <ArrowRight size={15} /></button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><span className="mobile-logo">VP</span><b>3D VAULT</b></div>
          <div className="breadcrumb"><span>Vitor Productions</span><ChevronRight size={15} /><strong>{NAV.find((n) => n.id === tab)?.label}</strong></div>
          <div className="top-actions">
            <label className="global-search"><Search size={18} />
              <input aria-label="Buscar arquivos" value={search} placeholder="Buscar na biblioteca..."
                onChange={(e) => { setSearch(e.target.value); if (e.target.value) setTab('library'); }} />
              <kbd>⌕</kbd>
            </label>
            <button className="btn btn-top" onClick={() => openUpload()}><Plus size={18} /><span>Adicionar arquivos</span></button>
          </div>
        </header>

        <main className="main-content">
          {offlineDemo && <div className="storage-recovery-banner" role="alert">
            <Info size={17}/><span>Modo de recuperação: arquivos locais indisponíveis. O editor 3D funciona com o cenário de exemplo. Ao produzir, use Baixar vídeo para não perder o resultado.</span>
            <button className="btn btn-secondary" onClick={retryLibrary}>Reconectar biblioteca</button>
          </div>}
          {!offlineDemo && <McpBridge visible={tab === 'mcp'} assets={assets} projects={projects} films={films} onCommand={executeMcpCommand} />}
          {tab === 'models' && <ModelStudio assets={assets} activeId={studioModelId} onSelect={setStudioModelId} onImport={() => openUpload()} remoteCommand={remoteCamera} />}
          {tab === 'video-editor' && <VideoStudio assets={assets} activeId={studioVideoId} onSelect={setStudioVideoId} onImport={() => openUpload()} onSave={saveVideoEdit} />}
          {tab === 'film-studio' && <FilmStudio films={films} assets={assets} activeId={studioFilmId} onSelect={setStudioFilmId} onSave={saveFilm} onDelete={deleteFilm} onProduced={saveProducedVideo} remoteCommand={remoteFilm} preferredAudioId={preferredNarrationId} />}
          {tab === 'voice-studio' && <VoiceStudio assets={assets} storageAvailable={!offlineDemo} onGenerated={saveGeneratedNarration} onUseInFilm={(id) => { setPreferredNarrationId(id); setTab('film-studio'); }} remoteCommand={remoteNarration} />}
          {tab === 'overview' && <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow"><span className="live-dot" /> SEU ESTÚDIO DIGITAL</div>
                <h1>Tudo o que criamos.<br /><em>Em um só lugar.</em></h1>
                <p>Personagens, cidades, animações e projetos 3D organizados para a próxima produção.</p>
                <div className="hero-actions">
                  <button className="btn btn-primary" onClick={() => openUpload()}><Upload size={17} />Adicionar arquivos</button>
                  <button className="btn btn-ghost" onClick={() => setTab('film-studio')}><Film size={17} /> Produzir filme 3D <ArrowRight size={16} /></button>
                </div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orbit orbit-outer" /><div className="orbit orbit-middle" />
                <div className="hero-cube hero-cube-one"><Box size={40} strokeWidth={1.1} /></div>
                <div className="hero-cube hero-cube-two"><Layers3 size={34} strokeWidth={1.3} /></div>
                <div className="hero-cube hero-cube-three"><Film size={26} strokeWidth={1.3} /></div>
                <div className="art-cross cross-a">+</div><div className="art-cross cross-b">+</div>
              </div>
            </section>

            <div className="stats-grid">
              <div className="stat-card"><div className="stat-icon"><FileBox size={20} /></div><span>ARQUIVOS</span><strong>{assets.length}</strong><small>na biblioteca</small></div>
              <div className="stat-card"><div className="stat-icon"><FolderOpen size={20} /></div><span>PROJETOS</span><strong>{projects.length}</strong><small>organizados</small></div>
              <div className="stat-card"><div className="stat-icon"><Clapperboard size={20} /></div><span>EM PRODUÇÃO</span><strong>{statusCounts('production')}</strong><small>projetos ativos</small></div>
              <div className="stat-card"><div className="stat-icon"><Database size={20} /></div><span>ARQUIVOS SALVOS</span><strong className="value-size">{formatBytes(totalSize)}</strong><small>neste navegador</small></div>
            </div>

            <section className="section-block">
              <div className="section-heading"><div><div className="section-kicker">BIBLIOTECA</div><h2>Explore suas coleções</h2></div>
                <button className="text-action" onClick={() => selectLibrary()}>Ver tudo <ArrowRight size={16} /></button>
              </div>
              <div className="category-grid">
                {CATEGORIES.slice(0, 6).map((item, index) => {
                  const Icon = CATEGORY_ICONS[item.id];
                  return <button className={'category-card category-' + index} key={item.id} onClick={() => selectLibrary(item.id)}>
                    <span className="category-symbol"><Icon size={25} strokeWidth={1.5} /></span>
                    <span className="category-name">{item.label}</span>
                    <span className="category-count">{filesByCategory[item.id] || 0} arquivos <ArrowRight size={15} /></span>
                  </button>;
                })}
              </div>
            </section>

            <div className="two-column">
              <section className="section-block compact-section">
                <div className="section-heading"><div><div className="section-kicker">RECENTES</div><h2>Últimos arquivos</h2></div>
                  <button className="text-action" onClick={() => selectLibrary()}>Ver todos <ArrowRight size={16} /></button></div>
                <div className="panel-list">
                  {assets.length === 0 ?
                    <EmptyState icon={PackageOpen} title="Sua biblioteca começa aqui"
                      description="Adicione seu primeiro modelo 3D, vídeo ou arquivo Blender." action={() => openUpload()} actionLabel="Adicionar arquivo" /> :
                    assets.slice(0, 4).map((asset) => <button className="recent-file" key={asset.id} onClick={() => setSelectedId(asset.id)}>
                      <span className="mini-file-icon"><AssetIcon asset={asset} /></span>
                      <span className="recent-info"><b title={asset.name}>{asset.name}</b><small>{categoryLabel(asset.category)} · {formatBytes(asset.size)}</small></span>
                      <ChevronRight size={17} /></button>)
                  }
                </div>
              </section>
              <section className="section-block compact-section">
                <div className="section-heading"><div><div className="section-kicker">PRODUÇÕES</div><h2>Projetos</h2></div>
                  <button className="text-action" onClick={() => setTab('projects')}>Ver todos <ArrowRight size={16} /></button></div>
                <div className="panel-list">
                  {projects.length === 0 ?
                    <EmptyState icon={FolderOpen} title="Sem projetos ainda"
                      description="Crie um projeto para reunir todos os arquivos de um vídeo." action={() => openProject()} actionLabel="Criar projeto" /> :
                    projects.slice(0, 4).map((project) => <button className="recent-file" key={project.id} onClick={() => selectLibrary('all', project.id)}>
                      <span className="mini-file-icon project-mini"><Folder size={21} /></span>
                      <span className="recent-info"><b>{project.name}</b><small>{statusLabel(project.status)} · {assets.filter((a) => a.projectId === project.id).length} arquivos</small></span>
                      <ChevronRight size={17} /></button>)
                  }
                </div>
              </section>
            </div>
            <div className={'backup-reminder ' + (lastBackup ? 'has-backup' : '')}>
              <ShieldCheck size={20} />
              <p><strong>{lastBackup ? 'Último backup: ' + formatDate(lastBackup) : 'Seus arquivos merecem uma cópia de segurança.'}</strong>
                <span> O armazenamento deste navegador não substitui um backup externo.</span></p>
              <button onClick={() => setTab('backups')}>Gerenciar backup <ArrowRight size={16} /></button>
            </div>
          </>}

          {tab === 'library' && <>
            <div className="page-heading"><div><div className="section-kicker">ASSETS / ARQUIVOS</div><h1>Biblioteca <span className="heading-counter">{filteredAssets.length}</span></h1><p>Todos os elementos que fazem parte das suas produções.</p></div>
              <button className="btn btn-primary" onClick={() => openUpload()}><Plus size={18} />Adicionar arquivos</button></div>
            <div className="library-toolbar">
              <div className="filter-scroll">
                <button className={'filter-chip ' + (category === 'all' ? 'selected' : '')} onClick={() => setCategory('all')}>Todos</button>
                {CATEGORIES.map((item) => <button key={item.id}
                  className={'filter-chip ' + (category === item.id ? 'selected' : '')}
                  onClick={() => setCategory(item.id)}>{item.label}</button>)}
              </div>
              <label className="filter-select"><SlidersHorizontal size={16} />
                <select aria-label="Filtrar por projeto" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
                  <option value="all">Todos os projetos</option>
                  <option value="">Sem projeto</option>
                  {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
                </select>
              </label>
            </div>
            {filteredAssets.length === 0 ?
              <div className="panel large-empty"><EmptyState icon={assets.length ? Search : Layers3}
                title={assets.length ? 'Nenhum arquivo encontrado' : 'Sua biblioteca está vazia'}
                description={assets.length ? 'Experimente outra busca, categoria ou projeto.' : 'Importe arquivos .blend, .glb, texturas, vídeos, áudio e muito mais.'}
                action={assets.length ? () => { setSearch(''); setCategory('all'); setProjectFilter('all'); } : () => openUpload()}
                actionLabel={assets.length ? 'Limpar filtros' : 'Adicionar arquivos'} /></div> :
              <div className="asset-grid">
                {filteredAssets.map((asset) => <button key={asset.id} className="asset-card" onClick={() => setSelectedId(asset.id)}>
                  <AssetThumbnail asset={asset} />
                  <div className="asset-card-info"><strong title={asset.name}>{asset.name}</strong>
                    <span>{categoryLabel(asset.category)} <span className="mid-dot">·</span> {formatBytes(asset.size)}</span></div>
                </button>)}
              </div>}
            <p className="library-footnote"><CloudOff size={14} /> Os arquivos ficam neste navegador até serem exportados em um backup.</p>
          </>}

          {tab === 'projects' && <>
            <div className="page-heading"><div><div className="section-kicker">ORGANIZAÇÃO / PRODUÇÕES</div><h1>Projetos <span className="heading-counter">{projects.length}</span></h1><p>Da ideia ao vídeo final, tudo no mesmo projeto.</p></div>
              <button className="btn btn-primary" onClick={() => openProject()}><Plus size={18} />Novo projeto</button></div>
            {projects.length === 0 ?
              <div className="panel large-empty"><EmptyState icon={FolderOpen} title="Seu primeiro projeto começa aqui"
                description="Crie o espaço de uma produção. Depois, associe personagens, cidades, animações e vídeos." action={() => openProject()} actionLabel="Criar projeto" /></div> :
              <div className="projects-grid">{projects.map((project) => {
                const linked = assets.filter((asset) => asset.projectId === project.id);
                return <article className="project-card" key={project.id}>
                  <div className="project-card-top"><span className="project-folder"><Folder size={25} strokeWidth={1.5} /></span>
                    <span className={'status status-' + project.status}><span />{statusLabel(project.status)}</span></div>
                  <h3>{project.name}</h3><p>{project.description || 'Sem descrição por enquanto.'}</p>
                  <div className="project-meta"><span><FileBox size={15} />{linked.length} arquivos</span><span><CalendarDays size={15} />{formatDate(project.updatedAt)}</span></div>
                  <div className="project-actions"><button className="btn btn-secondary" onClick={() => selectLibrary('all', project.id)}>Abrir arquivos <ArrowRight size={16} /></button>
                    <button className="icon-button" title="Editar projeto" aria-label={'Editar ' + project.name} onClick={() => openProject(project)}><MoreHorizontal size={20} /></button>
                    <button className="icon-button danger-hover" title="Excluir projeto" aria-label={'Excluir ' + project.name} onClick={() => confirmProjectDelete(project)}><Trash2 size={17} /></button>
                  </div>
                </article>;
              })}</div>}
          </>}

          {tab === 'backups' && <>
            <div className="page-heading"><div><div className="section-kicker">SEGURANÇA / ARQUIVOS</div><h1>Backups e proteção</h1><p>Tenha controle sobre suas produções, mesmo fora deste dispositivo.</p></div></div>
            <div className="security-banner"><ShieldCheck size={28} /><div><strong>Seus arquivos ficam no seu navegador.</strong>
              <p>Este software não envia suas produções para a nuvem. Se os dados do navegador forem apagados, você pode perdê-los. Exporte backups ZIP e guarde cópias em outro lugar.</p></div></div>
            <div className="backup-grid">
              <section className="backup-card"><span className="backup-card-icon"><Download size={24} /></span><h2>Exportar biblioteca</h2>
                <p>Baixe um ZIP com os projetos, metadados e arquivos originais armazenados.</p>
                <div className="backup-detail"><span>Arquivos incluídos</span><strong>{assets.length}</strong></div>
                <div className="backup-detail"><span>Tamanho original</span><strong>{formatBytes(totalSize)}</strong></div>
                <div className="backup-detail"><span>Última exportação</span><strong>{lastBackup ? formatDate(lastBackup) : 'Nenhuma'}</strong></div>
                <button className="btn btn-primary full" disabled={Boolean(busy)} onClick={exportBackup}>
                  <ArrowDownToLine size={18} />{busy === 'backup' ? 'Preparando ZIP...' : 'Baixar backup ZIP'}</button>
              </section>
              <section className="backup-card"><span className="backup-card-icon alternate"><Upload size={24} /></span><h2>Restaurar backup</h2>
                <p>Recupere um ZIP exportado anteriormente. Projetos e arquivos existentes serão preservados, exceto IDs iguais, que serão atualizados.</p>
                <div className="restore-drop" onClick={() => backupInputRef.current?.click()} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') backupInputRef.current?.click(); }}>
                  <FileArchive size={32} strokeWidth={1.4} /><b>Escolher arquivo .zip</b><span>Selecione um backup da Vitor Productions</span>
                </div>
                <input className="visually-hidden" ref={backupInputRef} type="file" accept=".zip,application/zip"
                  onChange={importBackup} aria-label="Selecionar backup ZIP" />
                {busy === 'restore' && <div className="work-indicator">Restaurando arquivos...</div>}
              </section>
            </div>
            <div className="panel storage-panel"><div className="storage-top"><div><div className="section-kicker">ARMAZENAMENTO LOCAL</div>
              <h2>Espaço utilizado</h2></div><Database size={23} /></div>
              <div className="storage-values"><strong>{estimate?.usage != null ? formatBytes(estimate.usage) : formatBytes(totalSize)}</strong>
                <span>{estimate?.quota ? 'de ' + formatBytes(estimate.quota) + ' estimados para o navegador' : 'em arquivos da biblioteca'}</span></div>
              {estimate?.quota && <div className="storage-track"><div style={{ width: Math.min(100, estimate.usage / estimate.quota * 100) + '%' }} /></div>}
              <p>O uso estimado pode incluir outros dados do site. A capacidade depende do navegador e do dispositivo.</p>
            </div>
            <div className="backup-tips"><Info size={18} /><span>Recomendado: guarde pelo menos duas cópias do ZIP em locais diferentes. Arquivos 3D muito grandes podem exceder a memória disponível para criar um ZIP no navegador.</span></div>
          </>}
        </main>
        <footer className="site-footer"><span>© Vitor Productions · 3D Vault</span><span><span className="footer-dot" /> Armazenamento local · Versão 0.1</span></footer>
      </div>

      <nav className="mobile-nav" aria-label="Navegação do celular">
        {NAV.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
          <Icon size={20} /><span>{label}</span></button>)}
      </nav>

      {uploadOpen && <Modal title="Adicionar arquivos" subtitle="Importe seus materiais originais para a biblioteca." onClose={() => !busy && setUploadOpen(false)}>
        <form onSubmit={submitUpload}>
          <div className="modal-body">
            <div className="file-picker" onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') fileInputRef.current?.click(); }}>
              <Upload size={27} /><strong>Selecionar arquivos</strong><span>BLEND, GLB, FBX, imagens, vídeos, áudio, ZIP e outros formatos</span>
            </div>
            <input className="visually-hidden" type="file" ref={fileInputRef} multiple onChange={(e) => setQueuedFiles(Array.from(e.target.files || []))} />
            {queuedFiles.length > 0 && <div className="picked-files"><b>{queuedFiles.length} {queuedFiles.length === 1 ? 'arquivo escolhido' : 'arquivos escolhidos'}</b>
              <span>{formatBytes(queuedFiles.reduce((sum, f) => sum + f.size, 0))}</span>
              <div>{queuedFiles.slice(0, 5).map((file, i) => <small key={i}>{file.name}</small>)}{queuedFiles.length > 5 && <small>+ {queuedFiles.length - 5} arquivos</small>}</div>
            </div>}
            <div className="form-grid">
              <label className="form-label">Categoria
                <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
                  <option value="auto">Detectar automaticamente</option>{CATEGORIES.map((cat) => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                </select></label>
              <label className="form-label">Associar ao projeto
                <select value={uploadProject} onChange={(e) => setUploadProject(e.target.value)}><option value="">Nenhum projeto</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            </div>
            <p className="form-hint"><Info size={15} /> Arquivos são gravados neste navegador. Exporte um ZIP para protegê-los contra perda de dados.</p>
          </div>
          <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setUploadOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy === 'upload' || !queuedFiles.length}><Upload size={17} />
              {busy === 'upload' ? 'Salvando...' : 'Salvar ' + (queuedFiles.length || '') + ' arquivo' + (queuedFiles.length === 1 ? '' : 's')}</button></div>
        </form>
      </Modal>}

      {projectOpen && <Modal title={projectEditId ? 'Editar projeto' : 'Novo projeto'} subtitle="Organize uma produção do conceito até a entrega." onClose={() => !busy && setProjectOpen(false)}>
        <form onSubmit={submitProject}>
          <div className="modal-body">
            <label className="form-label">Nome do projeto <span className="required">*</span>
              <input autoFocus value={projectName} maxLength={180} placeholder="Ex.: O garoto que não tinha profundidade"
                onChange={(e) => setProjectName(e.target.value)} required /></label>
            <label className="form-label">Descrição
              <textarea rows={4} maxLength={5000} value={projectDescription}
                placeholder="Uma breve descrição desta produção..." onChange={(e) => setProjectDescription(e.target.value)} /></label>
            <label className="form-label">Etapa atual
              <select value={projectStatus} onChange={(e) => setProjectStatus(e.target.value)}>
                {STATUSES.map((status) => <option value={status.id} key={status.id}>{status.label}</option>)}
              </select></label>
          </div>
          <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setProjectOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={!projectName.trim() || Boolean(busy)}><Check size={17} />{busy === 'project' ? 'Salvando...' : 'Salvar projeto'}</button></div>
        </form>
      </Modal>}

      {selected && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(''); }}>
        <aside className="file-drawer" role="dialog" aria-modal="true" aria-label={'Arquivo ' + selected.name}>
          <div className="drawer-header"><span>DETALHES DO ARQUIVO</span><button className="icon-button" onClick={() => setSelectedId('')} aria-label="Fechar"><X size={20} /></button></div>
          <div className="drawer-scroll">
            <div className="drawer-preview">
              {fileKind(selected) === 'image' && previewUrl ? <img src={previewUrl} alt={selected.name} /> :
               fileKind(selected) === 'video' && previewUrl ? <video src={previewUrl} controls playsInline /> :
               fileKind(selected) === 'audio' && previewUrl ? <div className="audio-preview"><AudioLines size={52} /><audio src={previewUrl} controls /></div> :
               fileKind(selected) === '3d' && modelReady && previewUrl ?
                 <model-viewer src={previewUrl} camera-controls auto-rotate shadow-intensity="1"
                   camera-orbit="35deg 65deg auto" interaction-prompt="none" style={{ width: '100%', height: '100%', background: 'transparent' }} /> :
               <AssetIcon asset={selected} size={56} />}
            </div>
            <div className="drawer-title"><h2>{selected.name}</h2><span>{fileExtension(selected.name)} · {formatBytes(selected.size)}</span></div>
            <div className="drawer-info-row"><span>Data de inclusão</span><strong>{formatDate(selected.createdAt)}</strong></div>
            <form onSubmit={submitAssetDetails} className="details-form">
              <label className="form-label">Categoria<select value={detailCategory} onChange={(e) => setDetailCategory(e.target.value)}>
                {CATEGORIES.map((cat) => <option value={cat.id} key={cat.id}>{cat.label}</option>)}</select></label>
              <label className="form-label">Projeto<select value={detailProject} onChange={(e) => setDetailProject(e.target.value)}>
                <option value="">Sem projeto</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
              <label className="form-label">Observações<textarea rows={4} maxLength={5000}
                placeholder="Versão, usos, observações..." value={detailNotes} onChange={(e) => setDetailNotes(e.target.value)} /></label>
              <button type="submit" className="btn btn-secondary full" disabled={busy === 'asset-detail'}><Check size={16} />Salvar alterações</button>
            </form>
            {fileKind(selected) === '3d' && !modelReady && <p className="preview-help">Carregando visualização GLB… Se não abrir, baixe o modelo original.</p>}
            {fileExtension(selected.name) === 'BLEND' && <p className="preview-help">Arquivos Blender são preservados no formato original e podem ser baixados para edição.</p>}
          </div>
          <div className="drawer-actions">
            {(fileKind(selected) === '3d' || fileKind(selected) === 'video') && <button className="btn btn-secondary" onClick={() => openInStudio(selected)}>{fileKind(selected) === '3d' ? 'Visualizar em 3D' : 'Editar vídeo'}</button>}
            <button className="btn btn-primary" onClick={() => downloadBlob(selected.blob, selected.name)}><Download size={17} />Baixar original</button>
            <button className="icon-button danger-hover" title="Excluir arquivo" aria-label="Excluir arquivo" onClick={() => confirmAssetDelete(selected)}><Trash2 size={19} /></button></div>
        </aside>
      </div>}

      {confirm && <Modal title={confirm.title} subtitle={confirm.message} onClose={() => setConfirm(null)} width="small">
        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancelar</button>
          <button className="btn btn-danger" onClick={runConfirm} disabled={busy === 'confirm'}><Trash2 size={16} />{busy === 'confirm' ? 'Excluindo...' : 'Confirmar exclusão'}</button></div>
      </Modal>}

      {toast && <div className={'toast toast-' + toast.type} role="status">
        {toast.type === 'error' ? <Info size={19} /> : <CheckCircle2 size={19} />}<span>{toast.text}</span>
        <button onClick={() => setToast(null)} aria-label="Fechar aviso"><X size={16} /></button>
      </div>}
    </div>
  );
}
