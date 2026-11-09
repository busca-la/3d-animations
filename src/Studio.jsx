import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Film, Play, Pause, Download, Save, RotateCcw, Video, AlertCircle } from 'lucide-react';
import { fileKind, downloadBlob } from './vault';
import './studio.css';
import '@google/model-viewer';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '00:00';
  const total = Math.floor(seconds);
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
};
const safeFilename = (name) => (name || 'video').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 64);
const mimeForRecording = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  return [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'
  ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

export default function Studio({ assets, onSaved, onUpload }) {
  const [mode, setMode] = useState('video');
  const [selectedId, setSelectedId] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [zoom, setZoom] = useState(100);
  const [speed, setSpeed] = useState(1);
  const [title, setTitle] = useState('');
  const [titleY, setTitleY] = useState(78);
  const [resolution, setResolution] = useState(720);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [rotate, setRotate] = useState(false);
  const [animations, setAnimations] = useState([]);
  const [selectedAnimation, setSelectedAnimation] = useState('');
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelRef = useRef(null);
  const recorderRef = useRef(null);
  const exportingRef = useRef(false);
  const audioRef = useRef(null);
  const rafRef = useRef(0);

  const choices = useMemo(() => assets.filter((asset) =>
    mode === 'video' ? fileKind(asset) === 'video' : fileKind(asset) === '3d'
  ), [assets, mode]);
  const selected = choices.find((item) => item.id === selectedId) || null;

  useEffect(() => {
    if (!choices.some((a) => a.id === selectedId)) setSelectedId(choices[0]?.id || '');
  }, [choices, selectedId]);

  useEffect(() => {
    setSourceUrl('');
    setMessage('');
    setDuration(0);
    setCurrent(0);
    setTrimStart(0);
    setTrimEnd(0);
    setAnimations([]);
    setSelectedAnimation('');
    if (!selected?.blob) return undefined;
    const url = URL.createObjectURL(selected.blob);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selected]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || mode !== 'model') return undefined;
    const onLoad = () => {
      const names = Array.from(model.availableAnimations || []);
      setAnimations(names);
      setSelectedAnimation(names[0] || '');
      if (names.length) model.animationName = names[0];
    };
    const onError = () => setMessage('Não foi possível carregar este GLB. Confira o arquivo original.');
    model.addEventListener('load', onLoad);
    model.addEventListener('error', onError);
    model.autoRotate = rotate;
    model.timeScale = animationSpeed;
    if (model.loaded) onLoad();
    return () => {
      model.removeEventListener('load', onLoad);
      model.removeEventListener('error', onError);
    };
  }, [sourceUrl, mode]);

  useEffect(() => {
    if (modelRef.current) modelRef.current.autoRotate = rotate;
  }, [rotate]);
  useEffect(() => {
    if (modelRef.current) modelRef.current.timeScale = animationSpeed;
  }, [animationSpeed]);

  const drawVideo = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#11141b';
    ctx.fillRect(0, 0, width, height);
    if (video && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
      const factor = Math.max(width / video.videoWidth, height / video.videoHeight) * zoom / 100;
      const drawWidth = video.videoWidth * factor;
      const drawHeight = video.videoHeight * factor;
      ctx.save();
      ctx.filter = 'brightness(' + brightness + '%) contrast(' + contrast + '%) saturate(' + saturation + '%)';
      ctx.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      ctx.restore();
    }
    const words = title.trim();
    if (words) {
      const fontSize = Math.round(width * 0.061);
      ctx.font = '800 ' + fontSize + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const lines = [];
      let line = '';
      for (const word of words.split(/\s+/)) {
        const next = line ? line + ' ' + word : word;
        if (ctx.measureText(next).width > width * .86 && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      if (line) lines.push(line);
      const visible = lines.slice(0, 4);
      const lineHeight = fontSize * 1.2;
      const baseline = height * titleY / 100 - (visible.length - 1) * lineHeight / 2;
      visible.forEach((text, index) => {
        const y = baseline + index * lineHeight;
        ctx.lineWidth = Math.max(4, width * .011);
        ctx.strokeStyle = 'rgba(0,0,0,.88)';
        ctx.strokeText(text, width / 2, y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, width / 2, y);
      });
    }
  };

  useEffect(() => {
    if (mode !== 'video') return undefined;
    let active = true;
    const frame = () => {
      if (!active) return;
      drawVideo();
      rafRef.current = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [mode, sourceUrl, brightness, contrast, saturation, zoom, title, titleY, resolution]);

  function onMetadata() {
    const d = videoRef.current?.duration;
    if (!Number.isFinite(d) || d <= 0) {
      setMessage('O navegador não conseguiu ler a duração deste arquivo.');
      return;
    }
    setDuration(d);
    setTrimStart(0);
    setTrimEnd(d);
    setCurrent(0);
    setMessage('');
  }

  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    setCurrent(video.currentTime);
    if (exportingRef.current) {
      setExportProgress(Math.round(100 * clamp((video.currentTime - trimStart) / Math.max(.1, trimEnd - trimStart), 0, 1)));
      if (video.currentTime >= trimEnd - .06 || video.ended) {
        video.pause();
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      }
    } else if (video.currentTime >= trimEnd && trimEnd > 0) {
      video.pause();
      setPlaying(false);
    }
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video || !duration) return;
    if (!video.paused) return video.pause();
    if (video.currentTime < trimStart || video.currentTime >= trimEnd - .05) video.currentTime = trimStart;
    video.playbackRate = speed;
    try { await video.play(); }
    catch (error) { setMessage('Não foi possível reproduzir: ' + error.message); }
  }

  function seek(next) {
    const seconds = Number(next);
    if (videoRef.current) videoRef.current.currentTime = seconds;
    setCurrent(seconds);
    drawVideo();
  }

  async function exportVideo() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const mimeType = mimeForRecording();
    if (!selected || !video || !canvas || !mimeType || !canvas.captureStream) {
      setMessage('A exportação não é suportada neste navegador. Experimente Chrome ou Safari atualizado.');
      return;
    }
    if (trimEnd <= trimStart + .1) {
      setMessage('Defina um intervalo de pelo menos 0,1 segundo.');
      return;
    }
    setMessage('');
    setExportProgress(0);
    setExporting(true);
    exportingRef.current = true;
    try {
      canvas.width = resolution;
      canvas.height = Math.round(resolution * 16 / 9);
      video.pause();
      video.playbackRate = speed;
      video.currentTime = trimStart;
      await new Promise((resolve) => {
        if (!video.seeking) return resolve();
        const timeout = setTimeout(resolve, 1200);
        video.addEventListener('seeked', () => { clearTimeout(timeout); resolve(); }, { once: true });
      });
      drawVideo();
      const stream = canvas.captureStream(30);
      // Web Audio retains the original soundtrack. Browser codec support varies.
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!audioRef.current) {
          const context = new AudioCtx();
          const source = context.createMediaElementSource(video);
          const destination = context.createMediaStreamDestination();
          source.connect(destination);
          source.connect(context.destination);
          audioRef.current = { context, destination };
        }
        await audioRef.current.context.resume();
        audioRef.current.destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track.clone()));
      } else {
        setMessage('Aviso: este navegador pode exportar sem o áudio original.');
      }
      const chunks = [];
      const recorder = new MediaRecorder(stream, {
        mimeType, videoBitsPerSecond: resolution === 1080 ? 10000000 : 5500000
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = () => setMessage('Ocorreu um erro durante a gravação.');
      recorder.onstop = async () => {
        video.pause();
        stream.getTracks().forEach((track) => track.stop());
        exportingRef.current = false;
        setExporting(false);
        recorderRef.current = null;
        const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
        if (!blob.size) {
          setMessage('O navegador não gerou o arquivo. Tente outra resolução.');
          return;
        }
        const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const filename = safeFilename(selected.name) + '-editado.' + extension;
        try {
          await onSaved(blob, filename);
          setMessage('Vídeo editado e salvo na biblioteca: ' + filename);
        } catch (error) {
          setMessage('Exportado, mas não foi possível salvar na biblioteca: ' + error.message);
          downloadBlob(blob, filename);
        }
      };
      recorder.start(200);
      await video.play();
    } catch (error) {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      else {
        exportingRef.current = false;
        setExporting(false);
      }
      setMessage('Falha na exportação: ' + error.message);
    }
  }

  async function saveModelScreenshot() {
    const model = modelRef.current;
    if (!model?.loaded || !model.toDataURL) return setMessage('O modelo precisa terminar de carregar.');
    try {
      const data = await model.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = data;
      link.download = safeFilename(selected?.name) + '-camera.png';
      link.click();
      setMessage('Imagem da câmera 3D preparada.');
    } catch (error) { setMessage('Não foi possível capturar a imagem: ' + error.message); }
  }

  return (
    <section className="vp-studio">
      <div className="studio-heading">
        <div><span className="studio-eyebrow">VITOR PRODUCTIONS / PRODUÇÃO</span><h1>Estúdio</h1><p>Visualize modelos 3D e faça edições reais nos seus vídeos, diretamente neste dispositivo.</p></div>
        <div className="studio-modes">
          <button className={mode === 'video' ? 'active' : ''} disabled={exporting} onClick={() => setMode('video')}><Film size={17} /> Vídeo</button>
          <button className={mode === 'model' ? 'active' : ''} disabled={exporting} onClick={() => setMode('model')}><Box size={17} /> 3D</button>
        </div>
      </div>
      <div className="studio-project-bar">
        <label>Arquivo da biblioteca
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={exporting}>
            {!choices.length && <option value="">Nenhum {mode === 'video' ? 'vídeo' : 'GLB'} importado</option>}
            {choices.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
        <button className="btn btn-secondary" onClick={onUpload} disabled={exporting}>Adicionar arquivo</button>
      </div>
      {!selected ? (
        <div className="studio-empty"><Video size={36} /><h2>Nenhum arquivo compatível</h2>
          <p>Adicione {mode === 'video' ? 'um MP4, MOV ou WebM' : 'um modelo GLB'} à biblioteca para começar.</p>
          <button className="btn btn-primary" onClick={onUpload}>Importar arquivo</button>
        </div>
      ) : mode === 'video' ? (
        <div className="studio-grid">
          <div className="studio-preview-panel">
            <div className="studio-portrait"><canvas ref={canvasRef} width={resolution} height={Math.round(resolution * 16 / 9)} aria-label="Pré-visualização do vídeo editado" /></div>
            <video ref={videoRef} className="studio-hidden-source" src={sourceUrl} playsInline preload="metadata"
              onLoadedMetadata={onMetadata} onTimeUpdate={onTimeUpdate} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
              onEnded={onTimeUpdate} onError={() => setMessage('Este codec de vídeo não é reproduzível neste navegador.')} />
            <div className="studio-player"><button onClick={togglePlayback} disabled={!duration || exporting} aria-label={playing ? 'Pausar' : 'Reproduzir'}>{playing ? <Pause size={19} /> : <Play size={19} />}</button>
              <span>{formatTime(current)}</span><input aria-label="Posição na linha do tempo" type="range" min={0} max={duration || 0} step=".033" value={current}
                onChange={(event) => seek(event.target.value)} disabled={!duration || exporting} /><span>{formatTime(duration)}</span></div>
            <div className="studio-range-track">
              <div className="studio-range-fill" style={{ left: (duration ? 100 * trimStart / duration : 0) + '%', width: (duration ? 100 * (trimEnd - trimStart) / duration : 0) + '%' }} />
              <div className="studio-range-playhead" style={{ left: (duration ? 100 * current / duration : 0) + '%' }} />
            </div>
            <p className="studio-tip">Prévia vertical 9:16 · corte central automático em vídeos horizontais. Arquivo original preservado.</p>
          </div>
          <div className="studio-controls">
            <h2>Montagem</h2>
            <div className="studio-two">
              <label>Início (segundos)<input type="number" min="0" step=".1" max={Math.max(0, trimEnd - .1)} value={Number(trimStart.toFixed(1))}
                disabled={exporting} onChange={(event) => { const v = clamp(Number(event.target.value), 0, Math.max(0, trimEnd - .1)); setTrimStart(v); seek(v); }} /></label>
              <label>Fim (segundos)<input type="number" min={trimStart + .1} step=".1" max={duration} value={Number(trimEnd.toFixed(1))}
                disabled={exporting} onChange={(event) => setTrimEnd(clamp(Number(event.target.value), trimStart + .1, duration))} /></label>
            </div>
            <label>Velocidade <strong>{speed.toFixed(2)}×</strong><input type="range" min=".5" max="2" step=".05" value={speed} disabled={exporting}
              onChange={(event) => { const next = Number(event.target.value); setSpeed(next); if (videoRef.current) videoRef.current.playbackRate = next; }} /></label>
            <h2>Imagem</h2>
            {[
              ['Brilho', brightness, setBrightness, 50, 160],
              ['Contraste', contrast, setContrast, 50, 160],
              ['Saturação', saturation, setSaturation, 0, 180],
              ['Zoom', zoom, setZoom, 100, 170]
            ].map(([label, value, setValue, min, max]) => <label key={label}>{label} <strong>{value}%</strong>
              <input type="range" min={min} max={max} value={value} onChange={(event) => setValue(Number(event.target.value))} disabled={exporting} /></label>)}
            <h2>Texto sobre o vídeo</h2>
            <label>Legenda / título<textarea rows={2} maxLength={130} placeholder="Escreva uma frase curta…" value={title}
              onChange={(event) => setTitle(event.target.value)} disabled={exporting} /></label>
            <label>Posição vertical <strong>{titleY}%</strong><input type="range" min="14" max="86" value={titleY} disabled={exporting}
              onChange={(event) => setTitleY(Number(event.target.value))} /></label>
            <div className="studio-two"><label>Resolução de saída<select value={resolution} onChange={(event) => setResolution(Number(event.target.value))} disabled={exporting}>
              <option value={720}>720 × 1280</option><option value={1080}>1080 × 1920</option></select></label>
              <button className="btn btn-secondary studio-reset" onClick={() => { setBrightness(100); setContrast(100); setSaturation(100); setZoom(100); setSpeed(1); setTitle(''); }} disabled={exporting}>
                <RotateCcw size={15} /> Limpar efeitos</button></div>
            <button className="btn btn-primary studio-export" onClick={exportVideo} disabled={!duration || exporting}>
              {exporting ? <><Save size={17} /> Exportando {exportProgress}%</> : <><Download size={17} /> Exportar e salvar na biblioteca</>}
            </button>
            <p className="studio-tip">A exportação processa o vídeo em tempo real no navegador. O formato MP4 ou WebM depende do suporte disponível; ela não substitui um editor profissional multicamadas.</p>
          </div>
        </div>
      ) : (
        <div className="studio-grid studio-model-layout">
          <div className="studio-model-panel">
            {sourceUrl && <model-viewer ref={modelRef} src={sourceUrl} camera-controls interaction-prompt="none" shadow-intensity="1"
              camera-orbit="35deg 65deg auto" exposure="1" style={{ width: '100%', height: '100%' }} />}
          </div>
          <div className="studio-controls">
            <h2>Visualização 3D</h2>
            <p className="studio-tip">Arraste para girar a câmera, aproxime com a roda do mouse ou gesto de pinça.</p>
            <label className="studio-toggle"><input type="checkbox" checked={rotate} onChange={(event) => setRotate(event.target.checked)} /> Rotação automática</label>
            <h2>Animações do modelo</h2>
            <label>Clipe GLB<select value={selectedAnimation} onChange={(event) => {
              const name = event.target.value;
              setSelectedAnimation(name);
              if (modelRef.current) { modelRef.current.animationName = name; modelRef.current.play(); }
            }} disabled={!animations.length}>
              {!animations.length && <option value="">Sem animação incorporada</option>}
              {animations.map((item) => <option key={item} value={item}>{item}</option>)}
            </select></label>
            <label>Velocidade <strong>{animationSpeed.toFixed(1)}×</strong><input type="range" min=".2" max="2" step=".1" value={animationSpeed}
              onChange={(event) => setAnimationSpeed(Number(event.target.value))} /></label>
            <div className="studio-two">
              <button className="btn btn-secondary" disabled={!animations.length} onClick={() => modelRef.current?.play()}><Play size={15} /> Reproduzir</button>
              <button className="btn btn-secondary" disabled={!animations.length} onClick={() => modelRef.current?.pause()}><Pause size={15} /> Pausar</button>
            </div>
            <button className="btn btn-primary studio-export" onClick={saveModelScreenshot}><Download size={16} /> Capturar câmera PNG</button>
            <p className="studio-tip">Suporta GLB e suas animações internas. Não modifica malhas, materiais, rigs ou arquivos .blend; essas operações exigem um editor 3D.</p>
          </div>
        </div>
      )}
      {message && <div className="studio-message" role="status"><AlertCircle size={17} /><span>{message}</span></div>}
    </section>
  );
}
