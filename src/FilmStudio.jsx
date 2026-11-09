import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Play, Pause, Save, Film, Plus, Download, ChevronLeft, ChevronRight, Trash2, Video, Volume2, Settings2, Sparkles, Loader2 } from 'lucide-react';
import { CAMERA_MODES, ACTIONS, MOODS, SCENES, FORMATS, demoFilm, sanitizeFilm, shotAt } from './filmSchema';
import { downloadBlob, fileKind } from './vault';

const CAMERA_LABELS = {
  abertura: 'Plano geral', rua: 'Travessia', fachada: 'Fachada', personagem: 'Personagem',
  produto: 'Produto', alto: 'Aéreo', travelling: 'Travelling',
};
const ACTION_LABELS = {
  caminhar: 'Caminhar', correr: 'Correr', parar: 'Parar', apontar: 'Apontar',
  olhar: 'Olhar', celebrar: 'Celebrar', produto: 'Mostrar produto', trafego: 'Tráfego',
};

const audioChoices = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4',
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
];

function selectRecorderType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return audioChoices.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function makeSfx(ctx, dest, t, pitch = 320) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(pitch, t);
  osc.frequency.exponentialRampToValueAtTime(pitch * .6, t + .18);
  gain.gain.setValueAtTime(.0001, t);
  gain.gain.exponentialRampToValueAtTime(.052, t + .025);
  gain.gain.exponentialRampToValueAtTime(.0001, t + .22);
  osc.connect(gain); gain.connect(dest); osc.start(t); osc.stop(t + .24);
}

export default function FilmStudio({ films, assets, activeId, onSelect, onSave, onDelete, onProduced, remoteCommand }) {
  const selectedFilm = activeId === '__new__' ? null : (films.find((item) => item.id === activeId) || films[0] || null);
  const [draft, setDraft] = useState(() => sanitizeFilm(demoFilm()));
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [engineState, setEngineState] = useState('loading');
  const [engineSignature, setEngineSignature] = useState('');
  const [error, setError] = useState('');
  const [renderState, setRenderState] = useState('');
  const [resolution, setResolution] = useState(720);
  const [rendering, setRendering] = useState(false);
  const [lastOutput, setLastOutput] = useState(null);
  const [selectedShot, setSelectedShot] = useState(0);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const frameRef = useRef(null);
  const timelineRef = useRef({ playing: false, position: 0, started: 0 });
  const renderBusy = useRef(false);
  const lastRemote = useRef('');
  const lastSelected = useRef(null);
  const activeRenderId = useRef('');

  const glbAssets = useMemo(() => assets.filter((asset) => fileKind(asset) === '3d'), [assets]);
  const audioAssets = useMemo(() => assets.filter((asset) => fileKind(asset) === 'audio'), [assets]);
  const draftJSON = JSON.stringify(draft);

  useEffect(() => {
    if (lastSelected.current === selectedFilm?.id) return;
    lastSelected.current = selectedFilm?.id;
    setDraft(sanitizeFilm(selectedFilm || demoFilm()));
    setPosition(0); timelineRef.current.position = 0;
    setPlaying(false); timelineRef.current.playing = false;
    setSelectedShot(0);
    setLastOutput(null);
  }, [selectedFilm?.id]);

  // Cria o WebGL somente quando muda o roteiro / arquivo 3D, mantendo o preview dentro do site.
  useEffect(() => {
    if (renderBusy.current) return undefined;
    let active = true;
    let loaded = null;
    setEngineState('loading'); setEngineSignature(''); setError('');
    const start = async () => {
      try {
        const { createFilmEngine } = await import('./filmEngine.js');
        if (!canvasRef.current) return;
        const instance = await createFilmEngine(canvasRef.current, draft, assets);
        if (!active) { instance.dispose(); return; }
        loaded = instance; engineRef.current = instance;
        const sizes = previewSizes(draft.format);
        instance.resize(...sizes);
        instance.render(timelineRef.current.position);
        setEngineSignature(draftJSON);
        setEngineState('ready');
      } catch (e) { if (active) { setError(e.message); setEngineState('error'); } }
    };
    const timer = window.setTimeout(start, 180);
    return () => {
      active = false; window.clearTimeout(timer);
      if (loaded) loaded.dispose();
      if (engineRef.current === loaded) engineRef.current = null;
    };
  }, [draftJSON, assets]);

  useEffect(() => {
    const state = timelineRef.current;
    state.playing = playing;
    if (!playing || rendering) return undefined;
    state.started = performance.now() - state.position * 1000;
    let priorUpdate = 0;
    const tick = (now) => {
      const position = (now - state.started) / 1000;
      const t = Math.min(position, draft.duration);
      state.position = t;
      engineRef.current?.render(t);
      if (now - priorUpdate > 85) { setPosition(t); priorUpdate = now; }
      if (position >= draft.duration) { setPlaying(false); state.playing = false; return; }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [playing, draft.duration, rendering]);

  const seek = useCallback((seconds) => {
    const t = Math.max(0, Math.min(Number(seconds) || 0, draft.duration));
    timelineRef.current.position = t;
    setPosition(t);
    if (timelineRef.current.playing) timelineRef.current.started = performance.now() - t * 1000;
    engineRef.current?.render(t);
    const current = shotAt(draft, t);
    setSelectedShot(current.index);
  }, [draft]);

  function update(key, value) {
    if (rendering) return;
    setDraft((prev) => sanitizeFilm({ ...prev, [key]: value }));
  }

  function updateShot(index, key, value) {
    if (rendering) return;
    setDraft((prev) => {
      const shots = prev.shots.map((shot, i) => i === index ? { ...shot, [key]: value } : shot);
      return sanitizeFilm({ ...prev, shots });
    });
  }

  function addShot() {
    if (draft.shots.length >= 18 || rendering) return;
    const last = draft.shots[draft.shots.length - 1];
    setDraft((prev) => sanitizeFilm({ ...prev, shots: [...prev.shots, { ...last, text: 'NOVA CENA', camera: 'travelling' }] }));
    setSelectedShot(draft.shots.length);
  }

  function removeShot() {
    if (draft.shots.length <= 1 || rendering) return;
    setDraft((prev) => sanitizeFilm({ ...prev, shots: prev.shots.filter((_, i) => i !== selectedShot) }));
    setSelectedShot(Math.max(0, selectedShot - 1));
  }

  async function save() {
    try {
      const result = await onSave(sanitizeFilm(draft));
      if (result?.id) { setDraft(sanitizeFilm(result)); onSelect(result.id); }
      setRenderState('Roteiro salvo na biblioteca local.');
    } catch (e) { setRenderState('Não foi possível salvar: ' + e.message); }
  }

  async function exportVideo({ remoteId = '' } = {}) {
    if (renderBusy.current) return;
    renderBusy.current = true;
    setPlaying(false);
    timelineRef.current.playing = false;
    setRendering(true); setLastOutput(null); setRenderState('Preparando vídeo...');
    activeRenderId.current = remoteId;
    const complete = (status, reason = '') => {
      if (remoteId) window.dispatchEvent(new CustomEvent('vp3d-remote-command-done', {
        detail: { id: remoteId, status, reason },
      }));
    };
    let engine = engineRef.current;
    let audioContext = null, mediaStream = null, soundSource = null, recorder = null;
    try {
      const mtype = selectRecorderType();
      if (mtype === null) throw new Error('Este navegador não oferece MediaRecorder. Tente Chrome recente.');
      if (!engine || engineState !== 'ready') throw new Error('Cena 3D ainda não está pronta.');
      if (!canvasRef.current?.captureStream) throw new Error('O navegador não suporta gravação do canvas.');
      const sourceFilm = sanitizeFilm(draft);
      const w = sourceFilm.format === '16:9' ? Math.floor(resolution * 16 / 9)
        : sourceFilm.format === '1:1' ? resolution : resolution;
      const h = sourceFilm.format === '16:9' ? resolution
        : sourceFilm.format === '1:1' ? resolution : Math.floor(resolution * 16 / 9);
      engine.resize(w, h);
      engine.render(0);
      mediaStream = canvasRef.current.captureStream(sourceFilm.fps);
      let inputStream = mediaStream;
      // Uma chamada MCP não possui gesto de clique: no Safari, AudioContext.resume()
      // pode ficar suspenso indefinidamente. Grave o vídeo sem áudio nesta situação,
      // em vez de deixar a renderização presa na fila.
      if (!remoteId && (window.AudioContext || window.webkitAudioContext)) {
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          audioContext = new Ctx();
          await audioContext.resume();
          const dest = audioContext.createMediaStreamDestination();
          let elapsed = 0;
          sourceFilm.shots.forEach((shot, i) => {
            if (i > 0) makeSfx(audioContext, dest, audioContext.currentTime + elapsed + .03, 320 + i * 35);
            elapsed += shot.duration;
          });
          if (sourceFilm.audioAssetId) {
            const audio = assets.find((a) => a.id === sourceFilm.audioAssetId);
            if (audio?.blob) {
              const decoded = await audioContext.decodeAudioData(await audio.blob.arrayBuffer());
              soundSource = audioContext.createBufferSource();
              soundSource.buffer = decoded;
              const audioVolume = audioContext.createGain(); audioVolume.gain.value = .9;
              soundSource.connect(audioVolume); audioVolume.connect(dest);
            }
          }
          inputStream = new MediaStream([...mediaStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        } catch (error) {
          setRenderState('Áudio não disponível; renderizando imagem com efeitos de câmera.');
          if (audioContext) { await audioContext.close().catch(() => {}); audioContext = null; }
          inputStream = mediaStream;
        }
      }
      recorder = mtype ? new MediaRecorder(inputStream, { mimeType: mtype, videoBitsPerSecond: resolution >= 1080 ? 10_000_000 : 5_000_000 })
        : new MediaRecorder(inputStream);
      const clips = [];
      const finished = new Promise((resolve, reject) => {
        recorder.ondataavailable = (event) => { if (event.data?.size) clips.push(event.data); };
        recorder.onerror = (event) => reject(event.error || new Error('O gravador retornou um erro.'));
        recorder.onstop = () => clips.length ? resolve(new Blob(clips, { type: recorder.mimeType || mtype || 'video/webm' }))
          : reject(new Error('O navegador não retornou dados de vídeo.'));
      });
      recorder.start(1000);
      if (soundSource) soundSource.start(0);
      setRenderState('Gravando os quadros 3D e a trilha... mantenha esta aba aberta.');
      await new Promise((resolve, reject) => {
        const begin = performance.now();
        function recordFrame(now) {
          if (!renderBusy.current || !engineRef.current) { reject(new Error('Renderização interrompida.')); return; }
          const t = Math.min(sourceFilm.duration, (now - begin) / 1000);
          try { engineRef.current.render(t); } catch (e) { reject(e); return; }
          timelineRef.current.position = t;
          if (Math.floor(t * 3) !== Math.floor((t - 1 / sourceFilm.fps) * 3)) {
            setPosition(t); setRenderState('Renderizando: ' + Math.round((t / sourceFilm.duration) * 100) + '%');
          }
          if (t >= sourceFilm.duration) { resolve(); return; }
          frameRef.current = requestAnimationFrame(recordFrame);
        }
        frameRef.current = requestAnimationFrame(recordFrame);
      });
      if (recorder.state !== 'inactive') recorder.stop();
      const clip = await finished;
      if (!clip.size || clip.size < 500) throw new Error('O arquivo de vídeo ficou vazio.');
      const extension = clip.type.includes('mp4') ? 'mp4' : 'webm';
      const name = sourceFilm.title.replace(/[^\w\-À-ÿ ]/g, '').trim().replace(/\s+/g, '-') || 'filme-3d';
      const filename = name + '-' + new Date().toISOString().slice(0, 10) + '.' + extension;
      const result = await onProduced(clip, filename, sourceFilm);
      setLastOutput({ blob: clip, filename });
      setRenderState('Vídeo finalizado e salvo na biblioteca: ' + filename);
      complete('applied');
      return result;
    } catch (error) {
      setError(error.message);
      setRenderState('Falha ao produzir vídeo: ' + error.message);
      complete('failed', error.message);
    } finally {
      cancelAnimationFrame(frameRef.current);
      try { soundSource?.stop(); } catch { /* already ended */ }
      try { mediaStream?.getTracks().forEach((track) => track.stop()); } catch { /* ignored */ }
      try { await audioContext?.close(); } catch { /* ignored */ }
      renderBusy.current = false;
      setRendering(false);
      activeRenderId.current = '';
      const sizes = previewSizes(draft.format);
      try { engineRef.current?.resize(...sizes); engineRef.current?.render(timelineRef.current.position); } catch { /* ignored */ }
    }
  }

  useEffect(() => {
    if (!remoteCommand?.id || remoteCommand.id === lastRemote.current) return;
    // Aguarde o roteiro selecionado ser efetivamente carregado no motor WebGL.
    // Não renderize a cena padrão por engano antes de o filme remoto ser montado.
    if (remoteCommand.payload?.filmId !== draft.id) return;
    if (renderBusy.current) return;
    if (engineState === 'error') {
      lastRemote.current = remoteCommand.id;
      window.dispatchEvent(new CustomEvent('vp3d-remote-command-done', {
        detail: { id: remoteCommand.id, status: 'failed', reason: error || 'Motor 3D indisponível.' },
      }));
      return;
    }
    if (engineState !== 'ready' || engineSignature !== draftJSON || !engineRef.current) return;
    lastRemote.current = remoteCommand.id;
    exportVideo({ remoteId: remoteCommand.id });
  }, [remoteCommand?.id, engineState, engineSignature, draftJSON, draft.id, error]);

  const seconds = (value) => Number(value).toFixed(1) + 's';
  const selected = draft.shots[selectedShot] || draft.shots[0];
  const active = shotAt(draft, position);

  return <div className="film-page">
    <header className="film-header">
      <div><div className="section-kicker">STUDIO / 3D FILMMAKER</div><h1>Diretor de <span className="studio-heading-accent">filmes 3D</span></h1>
        <p>Crie cenas animadas, defina câmera e roteiro, produza um arquivo de vídeo e salve na biblioteca.</p></div>
      <div className="film-header-actions">
        <button className="btn btn-secondary" disabled={rendering} onClick={() => {
          const starter = sanitizeFilm(demoFilm()); starter.id = '';
          setDraft(starter); setPlaying(false); timelineRef.current.position = 0; setPosition(0); setSelectedShot(0);
          lastSelected.current = null; onSelect('__new__'); setRenderState('Novo roteiro: salve para guardar.');
        }}><Plus size={16}/> Novo</button>
        <button className="btn btn-secondary" disabled={rendering} onClick={save}><Save size={16}/> Salvar roteiro</button>
      </div>
    </header>

    <div className="film-layout">
      <main className="film-left">
        <div className="film-stage">
          <canvas ref={canvasRef} className="film-canvas" aria-label="Prévia 3D animada do filme" />
          <div className="film-stage-marker"><span className="film-active-dot"/> PRÉVIA 3D · {draft.format}</div>
          {engineState === 'loading' && <div className="film-stage-status"><Loader2 size={24}/> Criando cenário e câmeras...</div>}
          {engineState === 'error' && <div className="film-stage-status film-error">{error || 'Motor 3D indisponível.'}</div>}
          {rendering && <div className="film-stage-rendering"><Loader2 size={23} /> Gravando vídeo real · Não feche esta aba</div>}
        </div>
        <section className="film-playback">
          <button onClick={() => { if (position >= draft.duration) seek(0); setPlaying(v => !v); }}
            disabled={rendering || engineState !== 'ready'} className="film-play-button" title={playing ? 'Pausar' : 'Reproduzir'}>
            {playing ? <Pause size={19}/> : <Play size={19}/>}
          </button>
          <span className="film-time">{seconds(position)} / {seconds(draft.duration)}</span>
          <input aria-label="Linha do tempo" type="range" min="0" max={draft.duration} step=".03" value={position}
            disabled={rendering} onChange={(e) => seek(Number(e.target.value))} className="film-scrubber"/>
          <span className="film-shot-number">PLANO {active.index + 1}/{draft.shots.length}</span>
        </section>
        <section className="film-timeline">
          <div className="film-section-title"><h2>Sequência de planos</h2><button className="film-minibutton" onClick={addShot} disabled={rendering || draft.shots.length >= 18}><Plus size={15}/> Plano</button></div>
          <div className="film-shot-track">
            {draft.shots.map((shot, i) => <button key={i} className={'film-shot-item ' + (i === selectedShot ? 'is-selected' : '')}
              style={{ flex: Math.max(.4, shot.duration / draft.duration * 10) }} onClick={() => { setSelectedShot(i); const at = draft.shots.slice(0, i).reduce((s, c) => s + c.duration, 0); seek(at + .02); }}>
              <span className="film-shot-caption">{i + 1}. {CAMERA_LABELS[shot.camera]}</span>
              <small>{seconds(shot.duration)}</small></button>)}
          </div>
          <div className="film-shot-settings">
            <label>Ângulo de câmera<select disabled={rendering} value={selected.camera} onChange={(e) => updateShot(selectedShot, 'camera', e.target.value)}>
              {CAMERA_MODES.map((x) => <option key={x} value={x}>{CAMERA_LABELS[x]}</option>)}</select></label>
            <label>Movimento<select disabled={rendering} value={selected.action} onChange={(e) => updateShot(selectedShot, 'action', e.target.value)}>
              {ACTIONS.map((x) => <option key={x} value={x}>{ACTION_LABELS[x]}</option>)}</select></label>
            <label>Texto do plano<input disabled={rendering} value={selected.text} maxLength={85} onChange={(e) => updateShot(selectedShot, 'text', e.target.value)}/></label>
            <label>Duração relativa<input disabled={rendering} type="number" min=".5" max="25" step=".5" value={selected.duration.toFixed(1)}
              onChange={(e) => updateShot(selectedShot, 'duration', Number(e.target.value))}/></label>
            <label>Movimento da câmera<input disabled={rendering} type="range" min="0" max="1.5" step=".05" value={selected.move}
              onChange={(e) => updateShot(selectedShot, 'move', Number(e.target.value))}/></label>
            <button className="film-remove" disabled={rendering || draft.shots.length <= 1} onClick={removeShot}><Trash2 size={15}/> Remover plano</button>
          </div>
        </section>
      </main>
      <aside className="film-right">
        <h2>Produção</h2>
        <label>Roteiro salvo / projeto<select value={selectedFilm?.id || ''} disabled={rendering} onChange={e => onSelect(e.target.value)}>
          <option value="">Roteiro novo (não salvo)</option>{films.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}</select></label>
        <label>Título do filme<input value={draft.title} maxLength={100} disabled={rendering} onChange={e => update('title', e.target.value)}/></label>
        <div className="film-inline-fields">
          <label>Cenário<select value={draft.scene} disabled={rendering} onChange={e => update('scene', e.target.value)}>
            {SCENES.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
          <label>Iluminação<select value={draft.mood} disabled={rendering} onChange={e => update('mood', e.target.value)}>
            {MOODS.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        </div>
        <div className="film-inline-fields">
          <label>Formato<select value={draft.format} disabled={rendering} onChange={e => update('format', e.target.value)}>
            {FORMATS.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
          <label>Duração<input value={draft.duration} type="number" min="5" max="90" disabled={rendering}
            onChange={e => update('duration', Number(e.target.value))}/></label>
        </div>
        <label>Cidade / modelo GLB<select value={draft.modelAssetId || ''} disabled={rendering} onChange={e => update('modelAssetId', e.target.value)}>
          <option value="">Cidade 3D do estúdio (pronta para animar)</option>
          {glbAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>
        <p className="film-hint">A cidade 3D de demonstração inclui lojas, rua, pessoas, tráfego e um produto animado. Para usar a sua cidade do Blender, importe a versão <b>.glb</b> na biblioteca. Arquivos .blend não abrem diretamente no navegador.</p>
        <label>Narração / áudio local<select disabled={rendering} value={draft.audioAssetId || ''} onChange={e => update('audioAssetId', e.target.value)}>
          <option value="">Sem áudio importado (som de transição original)</option>
          {audioAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>
        <label>Resolução de exportação<select disabled={rendering} value={resolution} onChange={e => setResolution(Number(e.target.value))}>
          <option value={720}>720p — mais rápido</option><option value={1080}>1080p — melhor qualidade</option>
        </select></label>
        <button className="film-export-button" disabled={rendering || engineState !== 'ready'} onClick={() => exportVideo()}>
          {rendering ? <Loader2 size={20}/> : <Video size={20}/>}{rendering ? 'PRODUZINDO VÍDEO...' : 'PRODUZIR VÍDEO 3D'}
        </button>
        <p className="film-hint">Exportação real com câmera animada e vídeo gravado no navegador. O formato final depende do suporte a MP4/WebM do Safari ou Chrome. A guia deve permanecer ativa.</p>
        {lastOutput && <button className="btn btn-secondary film-download" onClick={() => downloadBlob(lastOutput.blob, lastOutput.filename)}>
          <Download size={16}/> Baixar {lastOutput.filename}</button>}
        {renderState && <div className="film-feedback" role="status">{renderState}</div>}
        {selectedFilm?.id && <button className="film-remove film-delete" disabled={rendering}
          onClick={() => { if (window.confirm('Excluir somente este roteiro de filme? Os vídeos exportados são preservados.')) onDelete(selectedFilm.id); }}>
          <Trash2 size={15}/> Excluir roteiro</button>}
      </aside>
    </div>
  </div>;
}

function previewSizes(format) {
  if (format === '16:9') return [960, 540];
  if (format === '1:1') return [640, 640];
  return [540, 960];
}
