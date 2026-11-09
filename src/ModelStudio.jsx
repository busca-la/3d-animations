import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Maximize2, Minimize2, MousePointer2,
  Pause, Play, Plus, RotateCcw, RotateCw, Sun, Moon
} from 'lucide-react';
import { fileKind, formatBytes } from './vault';

const CAMERA_VIEWS = [
  { id: 'perspectiva', label: 'Perspectiva', orbit: '35deg 65deg auto' },
  { id: 'frente', label: 'Frente', orbit: '0deg 90deg auto' },
  { id: 'lateral', label: 'Lateral', orbit: '90deg 90deg auto' },
  { id: 'topo', label: 'Superior', orbit: '0deg 0deg auto' },
];

export default function ModelStudio({ assets, activeId, onSelect, onImport, remoteCommand }) {
  const models = useMemo(() => assets.filter((asset) => fileKind(asset) === '3d'), [assets]);
  const selected = models.find((asset) => asset.id === activeId) || models[0] || null;
  const modelRef = useRef(null);
  const lastRemoteId = useRef(null);
  const [engine, setEngine] = useState('loading');
  const [preview, setPreview] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [autoRotate, setAutoRotate] = useState(false);
  const [lightBackground, setLightBackground] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState('perspectiva');
  const [animations, setAnimations] = useState([]);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let mounted = true;
    import('@google/model-viewer')
      .then(() => { if (mounted) setEngine('ready'); })
      .catch(() => { if (mounted) setEngine('error'); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setLoaded(false);
    setError('');
    setView('perspectiva');
    setPlaying(false);
    setAnimations([]);
    if (!(selected?.blob instanceof Blob)) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(selected.blob);
    setPreview({ id: selected.id, url });
    return () => URL.revokeObjectURL(url);
  }, [selected?.id, selected?.blob]);

  const source = preview?.id === selected?.id ? preview?.url : '';

  useEffect(() => {
    const viewer = modelRef.current;
    if (!viewer || !source || engine !== 'ready') return undefined;
    const handleLoad = () => {
      setLoaded(true);
      setError('');
      setAnimations(Array.from(viewer.availableAnimations || []));
      setPlaying(false);
    };
    const handleError = () => {
      setLoaded(false);
      setAnimations([]);
      setError('Este GLB não pôde ser exibido. Confira se o arquivo é válido e exportado com texturas incorporadas.');
    };
    viewer.addEventListener('load', handleLoad);
    viewer.addEventListener('error', handleError);
    if (viewer.loaded) handleLoad();
    return () => {
      viewer.removeEventListener('load', handleLoad);
      viewer.removeEventListener('error', handleError);
    };
  }, [engine, source]);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  useEffect(() => {
    if (!remoteCommand || remoteCommand.id === lastRemoteId.current) return;
    const payload = remoteCommand.payload || {};
    if (!selected || selected.id !== payload.assetId) return;
    const complete = (status, reason = '') => {
      lastRemoteId.current = remoteCommand.id;
      window.dispatchEvent(new CustomEvent('vp3d-remote-command-done', {
        detail: { id: remoteCommand.id, status, reason },
      }));
    };
    if (engine === 'error' || error) { complete('failed', error || 'Visualizador WebGL indisponível.'); return; }
    if (!loaded || !modelRef.current) return;
    const camera = CAMERA_VIEWS.find((item) => item.id === payload.view) || CAMERA_VIEWS[0];
    chooseView(camera);
    setAutoRotate(Boolean(payload.autoRotate));
    setLightBackground(Boolean(payload.lightBackground));
    complete('applied');
  }, [remoteCommand?.id, selected?.id, loaded, engine, error]);

  function chooseView(camera) {
    setView(camera.id);
    const viewer = modelRef.current;
    if (!viewer) return;
    viewer.setAttribute('camera-orbit', camera.orbit);
    viewer.setAttribute('camera-target', 'auto auto auto');
    viewer.jumpCameraToGoal?.();
  }

  function toggleAnimation() {
    const viewer = modelRef.current;
    if (!viewer || !animations.length || !loaded) return;
    if (playing) {
      viewer.pause?.();
      setPlaying(false);
    } else {
      viewer.animationName = animations[0];
      try {
        const result = viewer.play?.();
        result?.catch?.(() => { setPlaying(false); });
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    }
  }

  function resetViewer() {
    chooseView(CAMERA_VIEWS[0]);
    const viewer = modelRef.current;
    if (!viewer) return;
    viewer.setAttribute('field-of-view', 'auto');
    viewer.setAttribute('camera-target', 'auto auto auto');
    viewer.jumpCameraToGoal?.();
  }

  return (
    <section className="studio-page" aria-label="Visualizador de modelos 3D">
      <div className="page-heading studio-heading">
        <div>
          <div className="section-kicker">ESTÚDIO / MODELOS</div>
          <h1>Visualizador <span className="studio-heading-accent">3D</span></h1>
          <p>Inspecione personagens, cenários e objetos em três dimensões, diretamente no navegador.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={onImport}>
          <Plus size={17} /> Importar GLB
        </button>
      </div>

      {models.length === 0 ? (
        <div className="studio-empty panel">
          <div className="studio-empty-symbol"><Box size={42} strokeWidth={1.2} /></div>
          <h2>Nenhum modelo GLB na biblioteca</h2>
          <p>Adicione um arquivo <strong>.glb</strong> para visualizá-lo com rotação, zoom, câmera e iluminação. Modelos Blender (.blend) precisam ser exportados para GLB.</p>
          <button className="btn btn-primary" type="button" onClick={onImport}><Plus size={17} /> Adicionar modelo</button>
        </div>
      ) : (
        <div className={'studio-layout' + (expanded ? ' studio-expanded' : '')}>
          <div className="studio-stage-column">
            <div className={'studio-stage ' + (lightBackground ? 'studio-stage-light' : '')}>
              <div className="studio-stage-top">
                <span className="studio-live-indicator"><span /> VISUALIZAÇÃO INTERATIVA</span>
                <button className="studio-icon-button" type="button" onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Fechar tela cheia' : 'Expandir visualização'} title={expanded ? 'Fechar tela cheia' : 'Expandir visualização'}>
                  {expanded ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
                </button>
              </div>
              {source && engine === 'ready' && (
                <model-viewer
                  key={source}
                  ref={modelRef}
                  src={source}
                  alt={'Visualização tridimensional de ' + selected.name}
                  camera-controls=""
                  auto-rotate={autoRotate ? '' : undefined}
                  rotation-per-second="20deg"
                  camera-orbit="35deg 65deg auto"
                  camera-target="auto auto auto"
                  field-of-view="auto"
                  environment-image="neutral"
                  shadow-intensity="1"
                  shadow-softness="0.8"
                  exposure="1.1"
                  interaction-prompt="none"
                  loading="eager"
                  reveal="auto"
                  class="studio-model"
                />
              )}
              {(!source || engine !== 'ready' || (!loaded && !error)) && (
                <div className="studio-stage-state" role="status">
                  <Box size={38} strokeWidth={1.2} />
                  <strong>{engine === 'error' ? 'Visualizador indisponível' : !source ? 'Modelo indisponível' : 'Preparando modelo 3D...'}</strong>
                  <span>{engine === 'error' ? 'Não foi possível iniciar o mecanismo WebGL.' : 'Arquivos maiores podem demorar para carregar.'}</span>
                </div>
              )}
              {error && <div className="studio-error" role="alert">{error}</div>}
              <div className="studio-stage-bottom"><MousePointer2 size={15} /><span>Arraste para girar · Role ou use pinça para aproximar</span></div>
            </div>

            <div className="studio-toolbar" role="group" aria-label="Controles do visualizador">
              <button className={'studio-tool' + (autoRotate ? ' is-active' : '')} type="button" onClick={() => setAutoRotate(!autoRotate)} aria-pressed={autoRotate}>
                <RotateCw size={17} /><span>Giro automático</span>
              </button>
              <button className="studio-tool" type="button" onClick={resetViewer}><RotateCcw size={17} /><span>Redefinir câmera</span></button>
              <button className={'studio-tool' + (lightBackground ? ' is-active' : '')} type="button" onClick={() => setLightBackground(!lightBackground)} aria-pressed={lightBackground}>
                {lightBackground ? <Moon size={17} /> : <Sun size={17} />}<span>{lightBackground ? 'Fundo escuro' : 'Fundo claro'}</span>
              </button>
              {animations.length > 0 && (
                <button className={'studio-tool' + (playing ? ' is-active' : '')} type="button" onClick={toggleAnimation} aria-pressed={playing}>
                  {playing ? <Pause size={17} /> : <Play size={17} />}<span>{playing ? 'Pausar animação' : 'Reproduzir animação'}</span>
                </button>
              )}
            </div>
            <div className="studio-camera-panel">
              <div className="studio-panel-title">ÂNGULOS DE CÂMERA</div>
              <div className="studio-camera-buttons" role="group" aria-label="Ângulos de câmera">
                {CAMERA_VIEWS.map((camera) => (
                  <button key={camera.id} className={'studio-view-button' + (view === camera.id ? ' is-active' : '')} type="button" aria-pressed={view === camera.id} onClick={() => chooseView(camera)}>{camera.label}</button>
                ))}
              </div>
            </div>
          </div>

          <aside className="studio-aside" aria-label="Modelos disponíveis">
            <div className="studio-aside-heading">
              <div><div className="studio-panel-title">BIBLIOTECA 3D</div><h2>Seus modelos</h2></div>
              <span className="studio-count">{models.length}</span>
            </div>
            <div className="studio-model-list">
              {models.map((asset) => (
                <button key={asset.id} type="button" className={'studio-asset-item' + (selected?.id === asset.id ? ' is-active' : '')} onClick={() => { onSelect(asset.id); setExpanded(false); }}>
                  <span className="studio-asset-icon"><Box size={22} strokeWidth={1.6} /></span>
                  <span className="studio-asset-meta"><strong title={asset.name}>{asset.name}</strong><small>GLB · {formatBytes(asset.size)}</small></span>
                  {selected?.id === asset.id && <span className="studio-active-dot" />}
                </button>
              ))}
            </div>
            <div className="studio-aside-footnote">
              <strong>{selected?.name}</strong>
              <p>Modelo carregado localmente. Nenhum arquivo é enviado a um servidor para esta visualização.</p>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
