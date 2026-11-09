import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Film, Pause, Play, Plus, Save, Scissors, Download } from 'lucide-react';
import { fileKind, formatBytes } from './vault';

const INITIAL = {
  start: 0, end: 0, speed: 1, aspect: '9:16',
  resolution: 720, fit: 'cover', zoom: 'none', text: '', textPosition: 'bottom',
};
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function timeLabel(seconds) {
  if (!Number.isFinite(seconds)) return '00:00';
  const s = Math.max(0, seconds);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0') + '.' + String(Math.round((s % 1) * 10) % 10);
}
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function cleanSettings(input) {
  const values = input && typeof input === 'object' ? input : {};
  return {
    start: Number.isFinite(values.start) ? Math.max(0, values.start) : 0,
    end: Number.isFinite(values.end) ? Math.max(0, values.end) : 0,
    speed: SPEEDS.includes(values.speed) ? values.speed : 1,
    aspect: ['9:16', '16:9', 'original'].includes(values.aspect) ? values.aspect : '9:16',
    resolution: [720, 1080].includes(values.resolution) ? values.resolution : 720,
    fit: ['cover', 'contain'].includes(values.fit) ? values.fit : 'cover',
    zoom: ['none', 'in', 'out'].includes(values.zoom) ? values.zoom : 'none',
    text: String(values.text || '').slice(0, 120),
    textPosition: ['center', 'bottom'].includes(values.textPosition) ? values.textPosition : 'bottom',
  };
}
function scaleFor(zoom, progress) {
  if (zoom === 'in') return 1 + 0.14 * progress;
  if (zoom === 'out') return 1.14 - 0.14 * progress;
  return 1;
}
function dimensions(settings, video) {
  const size = settings.resolution;
  if (settings.aspect === '9:16') return [size, Math.round(size * 16 / 9)];
  if (settings.aspect === '16:9') return [Math.round(size * 16 / 9), size];
  const vw = video?.videoWidth || 16, vh = video?.videoHeight || 9;
  const factor = size / Math.min(vw, vh);
  return [Math.round(vw * factor), Math.round(vh * factor)];
}
function renderFrame(ctx, video, settings, progress, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#11141b';
  ctx.fillRect(0, 0, width, height);
  const vw = video.videoWidth || width, vh = video.videoHeight || height;
  const factor = settings.fit === 'contain' ? Math.min(width / vw, height / vh) : Math.max(width / vw, height / vh);
  const dw = vw * factor, dh = vh * factor;
  const zoom = scaleFor(settings.zoom, progress);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(zoom, zoom);
  ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  if (settings.text.trim()) {
    const base = width / 720;
    const font = Math.round(44 * base);
    const lineHeight = font * 1.2;
    ctx.font = '800 ' + font + 'px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const words = settings.text.trim().split(/\s+/);
    const lines = [];
    let line = '';
    const maxWidth = width * 0.83;
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    const total = lines.length * lineHeight;
    const centerY = settings.textPosition === 'center' ? height / 2 : height * 0.8;
    const alphaIn = clamp(progress * 8, 0, 1);
    const alphaOut = clamp((1 - progress) * 8, 0, 1);
    ctx.globalAlpha = Math.min(alphaIn, alphaOut);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, 8 * base);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillStyle = '#ffffff';
    lines.forEach((text, index) => {
      const y = centerY - total / 2 + (index + 0.5) * lineHeight;
      ctx.strokeText(text, width / 2, y, maxWidth);
      ctx.fillText(text, width / 2, y, maxWidth);
    });
    ctx.globalAlpha = 1;
  }
}

export default function VideoStudio({ assets, activeId, onSelect, onImport, onSave }) {
  const videos = useMemo(() => assets.filter((asset) => fileKind(asset) === 'video'), [assets]);
  const selected = videos.find((asset) => asset.id === activeId) || videos[0] || null;
  const videoRef = useRef(null);
  const cancelExportRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [settings, setSettings] = useState(INITIAL);
  const [duration, setDuration] = useState(0);
  const [aspectOriginal, setAspectOriginal] = useState('16 / 9');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSettings(cleanSettings(selected?.videoEdit));
    setDuration(0); setTime(0); setPlaying(false); setMessage('');
    if (!(selected?.blob instanceof Blob)) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(selected.blob);
    setPreview({ id: selected.id, url });
    return () => URL.revokeObjectURL(url);
  }, [selected?.id, selected?.blob]);

  useEffect(() => () => { cancelExportRef.current?.(); }, []);

  const source = preview?.id === selected?.id ? preview.url : '';
  const start = clamp(settings.start, 0, duration);
  const end = clamp(settings.end || duration, start, duration);
  const length = Math.max(0, end - start);
  const relativeProgress = length > 0 ? clamp((time - start) / length, 0, 1) : 0;
  const zoom = scaleFor(settings.zoom, relativeProgress);
  const shownAspect = settings.aspect === 'original' ? aspectOriginal : settings.aspect.replace(':', ' / ');

  function patch(change) { setSettings((current) => ({ ...current, ...change })); setMessage(''); }
  function onMetadata(event) {
    const v = event.currentTarget;
    const d = Number.isFinite(v.duration) ? v.duration : 0;
    setDuration(d);
    setAspectOriginal((v.videoWidth || 16) + ' / ' + (v.videoHeight || 9));
    const initialStart = clamp(settings.start, 0, d);
    v.currentTime = initialStart;
    v.playbackRate = settings.speed;
    setTime(initialStart);
  }
  function onTimeUpdate(event) {
    const current = event.currentTarget.currentTime;
    if (current >= end - 0.04 && end > start) {
      event.currentTarget.pause();
      setPlaying(false);
      event.currentTarget.currentTime = start;
      setTime(start);
      return;
    }
    setTime(current);
  }
  function seek(next) {
    const value = clamp(next, start, end);
    if (videoRef.current) videoRef.current.currentTime = value;
    setTime(value);
  }
  function togglePlay() {
    const v = videoRef.current;
    if (!v || !duration) return;
    if (!v.paused) { v.pause(); setPlaying(false); return; }
    if (v.currentTime >= end - 0.04) v.currentTime = start;
    v.play().then(() => setPlaying(true)).catch(() => setMessage('Não foi possível reproduzir este vídeo. Verifique o codec.'));
  }
  function changeStart(value) {
    const next = clamp(Number(value), 0, Math.max(0, end - 0.1));
    patch({ start: next });
    if (videoRef.current && videoRef.current.currentTime < next) { videoRef.current.currentTime = next; setTime(next); }
  }
  function changeEnd(value) {
    const next = clamp(Number(value), start + 0.1, duration);
    patch({ end: next });
    if (videoRef.current && videoRef.current.currentTime > next) { videoRef.current.currentTime = next; setTime(next); }
  }
  async function saveChanges() {
    if (!selected) return;
    setSaving(true);
    try { await onSave(selected.id, { ...settings, start, end }); setMessage('Edição salva neste navegador. O original foi preservado.'); }
    catch (error) { setMessage('Erro ao salvar edição: ' + error.message); }
    finally { setSaving(false); }
  }

  async function exportVideo() {
    if (!selected || !source || !duration || length < 0.1 || exporting) return;
    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      setMessage('Este navegador não permite exportar vídeo diretamente. Experimente Chrome ou Edge no computador.');
      return;
    }
    setExporting(true);
    setProgress(0);
    setMessage('');
    let recorder, audio, media, raf, exportVideoElement, combined, stopped = false;
    let resolveDone;
    let rejectDone;
    const finished = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
    const cleanUp = () => {
      cancelAnimationFrame(raf);
      if (combined) combined.getTracks().forEach((track) => track.stop());
      try { exportVideoElement?.pause(); } catch { /* optional */ }
      try { audio?.close(); } catch { /* optional */ }
      if (exportVideoElement) exportVideoElement.removeAttribute('src');
      exportVideoElement?.load?.();
      cancelExportRef.current = null;
      setExporting(false);
    };
    try {
      exportVideoElement = document.createElement('video');
      exportVideoElement.src = source;
      exportVideoElement.preload = 'auto';
      exportVideoElement.playsInline = true;
      exportVideoElement.crossOrigin = 'anonymous';
      exportVideoElement.playbackRate = settings.speed;
      await new Promise((resolve, reject) => {
        if (exportVideoElement.readyState >= 1) return resolve();
        exportVideoElement.addEventListener('loadedmetadata', resolve, { once: true });
        exportVideoElement.addEventListener('error', () => reject(new Error('Não foi possível abrir o vídeo.')), { once: true });
        exportVideoElement.load();
      });
      exportVideoElement.currentTime = start;
      if (start > 0) await new Promise((resolve) => exportVideoElement.addEventListener('seeked', resolve, { once: true }));
      const [width, height] = dimensions(settings, exportVideoElement);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas indisponível.');
      renderFrame(ctx, exportVideoElement, settings, 0, width, height);
      const visual = canvas.captureStream(30);
      const tracks = [...visual.getVideoTracks()];
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        try {
          audio = new AudioContextClass();
          const sourceNode = audio.createMediaElementSource(exportVideoElement);
          const destination = audio.createMediaStreamDestination();
          sourceNode.connect(destination);
          await audio.resume();
          tracks.push(...destination.stream.getAudioTracks());
        } catch { /* keep silent export if audio capture unsupported */ }
      }
      combined = new MediaStream(tracks);
      const candidates = [
        'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ];
      const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      recorder = new MediaRecorder(combined, mimeType ? { mimeType, videoBitsPerSecond: 5_000_000 } : { videoBitsPerSecond: 5_000_000 });
      const chunks = [];
      recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener('error', () => rejectDone(new Error('O navegador falhou ao gravar o vídeo.')));
      recorder.addEventListener('stop', () => resolveDone(chunks));
      cancelExportRef.current = () => {
        stopped = true;
        if (recorder?.state === 'recording') recorder.stop();
        rejectDone(new Error('Exportação interrompida.'));
      };
      recorder.start(250);
      await exportVideoElement.play();
      function draw() {
        if (stopped) return;
        const elapsed = Math.max(0, exportVideoElement.currentTime - start);
        const p = clamp(elapsed / length, 0, 1);
        renderFrame(ctx, exportVideoElement, settings, p, width, height);
        setProgress(Math.round(p * 100));
        if (exportVideoElement.ended || exportVideoElement.currentTime >= end - 0.02) {
          stopped = true;
          if (recorder.state === 'recording') recorder.stop();
          return;
        }
        raf = requestAnimationFrame(draw);
      }
      raf = requestAnimationFrame(draw);
      const data = await finished;
      if (!data.length) throw new Error('Nenhum quadro foi gravado.');
      const actualMime = recorder.mimeType || mimeType || 'video/webm';
      const extension = actualMime.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(data, { type: actualMime });
      const outputUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = outputUrl;
      link.download = selected.name.replace(/\.[^.]+$/, '') + '-editado.' + extension;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(outputUrl), 60_000);
      setProgress(100);
      setMessage('Vídeo exportado como .' + extension + '. Guarde o arquivo baixado.');
    } catch (error) {
      setMessage('Exportação não concluída: ' + (error?.message || 'erro desconhecido') + '. Tente Chrome ou Edge se o navegador não suportar esta função.');
      if (recorder?.state === 'recording') recorder.stop();
    } finally { cleanUp(); }
  }

  return (
    <section className="video-editor-page">
      <div className="page-heading video-page-heading">
        <div><div className="section-kicker">ESTÚDIO / PÓS-PRODUÇÃO</div><h1>Editor de <span className="studio-heading-accent">vídeo</span></h1><p>Corte, enquadre, ajuste a velocidade e crie animações simples sem alterar o original.</p></div>
        <button className="btn btn-primary" type="button" onClick={onImport}><Plus size={17} /> Importar vídeo</button>
      </div>
      {videos.length === 0 ? (
        <div className="studio-empty panel"><Clapperboard size={42} strokeWidth={1.3} /><h2>Nenhum vídeo importado</h2><p>Importe MP4 ou WebM para montar e exportar sua primeira edição. Outros formatos dependem dos codecs do navegador.</p><button className="btn btn-primary" type="button" onClick={onImport}><Plus size={17} /> Adicionar vídeo</button></div>
      ) : (
        <div className="video-editor-layout">
          <div className="video-editor-main">
            <div className="video-preview-shell">
              <div className="studio-panel-title">MONITOR DE PRÉ-VISUALIZAÇÃO</div>
              <div className="video-preview-holder">
                <div className="video-preview-frame" style={{ aspectRatio: shownAspect }}>
                  {source && <video
                    key={source} ref={videoRef} src={source} playsInline preload="metadata"
                    onLoadedMetadata={onMetadata} onTimeUpdate={onTimeUpdate}
                    onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)}
                    onError={() => setMessage('Formato ou codec não suportado neste navegador.')}
                    style={{ objectFit: settings.fit, transform: 'scale(' + zoom + ')' }}
                  />}
                  {settings.text.trim() && (
                    <div className={'video-preview-text video-text-' + settings.textPosition}
                      style={{ opacity: Math.min(clamp(relativeProgress * 8, 0, 1), clamp((1 - relativeProgress) * 8, 0, 1)) }}>{settings.text}</div>
                  )}
                </div>
              </div>
              <div className="video-play-controls">
                <button type="button" className="video-play" onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Reproduzir'}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
                <span>{timeLabel(time)}</span>
                <input aria-label="Posição do vídeo" type="range" min={start} max={end || 0.1} step="0.05" value={clamp(time, start, end)} onChange={(event) => seek(Number(event.target.value))} />
                <span>{timeLabel(end)}</span>
              </div>
            </div>

            <div className="video-timeline-panel">
              <div className="studio-panel-title">LINHA DO TEMPO · CORTES</div>
              <div className="video-timeline-bar"><span style={{ left: duration ? start / duration * 100 + '%' : 0, width: duration ? length / duration * 100 + '%' : '100%' }} /></div>
              <div className="video-trim-inputs">
                <label>Início <strong>{timeLabel(start)}</strong><input type="range" min="0" max={duration || 0.1} step="0.1" value={start} onChange={(event) => changeStart(event.target.value)} disabled={!duration} /></label>
                <label>Fim <strong>{timeLabel(end)}</strong><input type="range" min="0" max={duration || 0.1} step="0.1" value={end} onChange={(event) => changeEnd(event.target.value)} disabled={!duration} /></label>
              </div>
              <p><Scissors size={15} /> Trecho selecionado: {timeLabel(length)} · resultado aproximado: {timeLabel(length / settings.speed)}</p>
            </div>

            <div className="video-editor-actions">
              <button className="btn btn-secondary" type="button" onClick={saveChanges} disabled={saving || exporting}><Save size={17} />{saving ? 'Salvando...' : 'Salvar edição'}</button>
              <button className="btn btn-primary" type="button" onClick={exportVideo} disabled={!duration || length < 0.1 || exporting}><Download size={17} />{exporting ? 'Exportando... ' + progress + '%' : 'Exportar vídeo editado'}</button>
            </div>
            {exporting && <div className="video-export-progress"><span style={{ width: progress + '%' }} /></div>}
            {message && <p className="video-editor-message" role="status">{message}</p>}
            <p className="video-editor-notice">A exportação grava em tempo real e usa o formato que o navegador suporta (WebM ou MP4). O áudio é mantido quando a captura é suportada. Algumas combinações de navegador, arquivo e codec podem falhar.</p>
          </div>

          <aside className="video-editor-sidebar">
            <div className="studio-panel-title">VÍDEOS IMPORTADOS <span className="studio-count">{videos.length}</span></div>
            <div className="studio-model-list">
              {videos.map((asset) => <button key={asset.id} type="button" className={'studio-asset-item' + (selected?.id === asset.id ? ' is-active' : '')} onClick={() => onSelect(asset.id)}>
                <span className="studio-asset-icon"><Film size={19} /></span><span className="studio-asset-meta"><strong title={asset.name}>{asset.name}</strong><small>{formatBytes(asset.size)} · {asset.videoEdit ? 'Edição salva' : 'Original'}</small></span>
              </button>)}
            </div>
            <div className="video-settings-panel">
              <div className="studio-panel-title">ENQUADRAMENTO</div>
              <label className="form-label">Formato
                <select value={settings.aspect} onChange={(event) => patch({ aspect: event.target.value })}>
                  <option value="9:16">9:16 · Reels / Shorts</option><option value="16:9">16:9 · Horizontal</option><option value="original">Original</option>
                </select>
              </label>
              <label className="form-label">Encaixe
                <select value={settings.fit} onChange={(event) => patch({ fit: event.target.value })}>
                  <option value="cover">Preencher · cortar bordas</option><option value="contain">Mostrar tudo · com barras</option>
                </select>
              </label>
              <label className="form-label">Resolução de saída
                <select value={settings.resolution} onChange={(event) => patch({ resolution: Number(event.target.value) })}>
                  <option value={720}>720p · leve</option><option value={1080}>1080p · alta qualidade</option>
                </select>
              </label>
              <div className="studio-panel-title">MOVIMENTO E TEMPO</div>
              <label className="form-label">Velocidade
                <select value={settings.speed} onChange={(event) => { patch({ speed: Number(event.target.value) }); if (videoRef.current) videoRef.current.playbackRate = Number(event.target.value); }}>
                  {SPEEDS.map((value) => <option value={value} key={value}>{value}×</option>)}
                </select>
              </label>
              <label className="form-label">Animação de zoom
                <select value={settings.zoom} onChange={(event) => patch({ zoom: event.target.value })}>
                  <option value="none">Sem zoom</option><option value="in">Aproximar suavemente</option><option value="out">Afastar suavemente</option>
                </select>
              </label>
              <div className="studio-panel-title">TEXTO ANIMADO</div>
              <label className="form-label">Texto sobre o vídeo
                <textarea rows={3} maxLength={120} value={settings.text} onChange={(event) => patch({ text: event.target.value })} placeholder="Escreva um título curto..." />
              </label>
              <label className="form-label">Posição do texto
                <select value={settings.textPosition} onChange={(event) => patch({ textPosition: event.target.value })}>
                  <option value="bottom">Parte inferior</option><option value="center">Centro</option>
                </select>
              </label>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
