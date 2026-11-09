import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Blocks, Building2, Check, CircleAlert, CloudOff, Compass,
  Download, FileBox, Film, MapPin, RotateCcw, Save, Sparkles,
  Trees, WandSparkles, Layers3, CarFront, Sun, Moon, CloudRain, Mic, MicOff,
} from 'lucide-react';
import { CITY_PRESETS, cityName, interpretCityPrompt } from './cityPrompt.js';
import { downloadBlob, fileKind, formatBytes } from './vault';

const START_PROMPT = CITY_PRESETS[0].text;
const OPTIONS = {
  district: [['comercial','Comercial'],['residencial','Residencial'],['industrial','Industrial']],
  style: [['moderno','Moderno'],['retro','Retrô'],['futurista','Futurista']],
  time: [['dia','Dia'],['tarde','Fim de tarde'],['noite','Noite']],
  density: [['baixa','Baixa'],['media','Média'],['alta','Alta']],
};
const safePlan = (prompt, overrides = {}) => interpretCityPrompt(prompt, overrides);

export default function CityStudio({ assets = [], onGenerated, onUseInFilm, storageAvailable = true, remoteCommand = null }) {
  const [prompt, setPrompt] = useState(START_PROMPT);
  const [overrides, setOverrides] = useState({});
  const [spec, setSpec] = useState(() => safePlan(START_PROMPT));
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const [result, setResult] = useState(null);
  const [savedId, setSavedId] = useState('');
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const frameRef = useRef(null);
  const controlRef = useRef(null);
  const generatedId = useRef('');
  const lastRemote = useRef('');
  const specKey = JSON.stringify(spec);
  const cityAssets = useMemo(() => assets.filter(a => a.generator === 'vp-city-v1' && a.blob && fileKind(a) === '3d'), [assets]);

  useEffect(() => {
    let active = true;
    let controller;
    let renderer;
    let world;
    let observer;
    let latest=0;
    let frame;
    async function start(){
      setError(''); setState('loading');
      try {
        const [THREE, orbit, engine] = await Promise.all([
          import('three'), import('three/addons/controls/OrbitControls.js'), import('./cityWorld.js'),
        ]);
        if(!canvasRef.current) return;
        world = engine.createCityWorld(spec);
        if(!active){world.dispose();return;}
        renderer = new THREE.WebGLRenderer({canvas:canvasRef.current,antialias:true,powerPreference:'high-performance'});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
        renderer.shadowMap.enabled=true;
        renderer.shadowMap.type=THREE.PCFSoftShadowMap;
        renderer.toneMapping=THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure=1.15;
        renderer.outputColorSpace=THREE.SRGBColorSpace;
        const size=spec.blocks*21.5;
        const camera=new THREE.PerspectiveCamera(38,1,.1,400);
        camera.position.set(size*.86,size*.61,size*.84);
        camera.lookAt(0,0,0);
        controller = new orbit.OrbitControls(camera,renderer.domElement);
        controller.target.set(0,1.8,0);
        controller.enableDamping=true;controller.dampingFactor=.085;
        controller.maxPolarAngle=Math.PI*.48;
        controller.minDistance=8;controller.maxDistance=190;
        controller.enablePan=true;
        controller.update();
        worldRef.current={world,renderer,camera};
        controlRef.current=controller;
        const resize=()=>{
          const box=canvasRef.current?.parentElement?.getBoundingClientRect();
          if(!box)return;
          const width=Math.max(250,Math.round(box.width)),height=Math.max(280,Math.round(box.height));
          renderer.setSize(width,height,false);
          camera.aspect=width/height;camera.updateProjectionMatrix();
        };
        resize();
        if(typeof ResizeObserver!=='undefined'){
          observer=new ResizeObserver(resize);
          observer.observe(canvasRef.current.parentElement);
        }else window.addEventListener('resize',resize);
        let began=0;
        const animate=(now)=>{
          if(!active)return;
          if(!began)began=now;
          frame=requestAnimationFrame(animate);
          if(now-latest<28)return;
          latest=now;
          world.update((now-began)/1000);
          controller.update();
          renderer.render(world.scene,camera);
        };
        animate(performance.now());
        setState('ready');
      } catch(e){if(active){setError(e.message);setState('failed');}}
    }
    const timer=window.setTimeout(start,90);
    return ()=>{
      active=false;window.clearTimeout(timer);cancelAnimationFrame(frame);
      observer?.disconnect();
      controller?.dispose();
      if(worldRef.current?.world===world)worldRef.current=null;
      if(controlRef.current===controller)controlRef.current=null;
      world?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss?.();
    };
  },[specKey]);

  useEffect(() => () => { recognitionRef.current?.abort?.(); }, []);

  function speakCity() {
    if (listening) {
      recognitionRef.current?.stop?.();
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('O Safari deste dispositivo não disponibiliza reconhecimento de voz. Você pode descrever a cidade digitando.');
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = [...event.results].map(r => r[0]?.transcript || '').join(' ').trim();
        if (transcript.length < 8) {
          setError('Não entendi a descrição da cidade. Tente novamente com mais detalhes.');
          return;
        }
        setPrompt(transcript);
        generate(transcript, {});
      };
      recognition.onerror = (event) => {
        const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'O navegador não autorizou o microfone. Permita a gravação ou digite a descrição.'
          : 'Não foi possível reconhecer a fala: ' + (event.error || 'erro desconhecido');
        setError(message);
        setListening(false);
      };
      recognition.onend = () => { setListening(false); recognitionRef.current = null; };
      recognition.start();
      setError('');
      setListening(true);
    } catch (error) {
      setListening(false);
      setError('Não foi possível ativar o microfone: ' + error.message);
    }
  }

  function generate(description=prompt, choices=overrides) {
    setError(''); setStatus('');setResult(null);setSavedId('');
    try {
      const next=safePlan(description,choices);
      setState('loading');
      setSpec(next);
      setPrompt(next.prompt);
      setOverrides(choices);
      generatedId.current = '';
      setStatus('Cidade gerada. Gire com o mouse, aproxime e salve em GLB.');
    } catch(e){setError(e.message);}
  }

  async function exportCity({useFilm=false, remoteId='' } = {}) {
    if(exporting)return;
    setExporting(true);setError('');setStatus('Preparando geometria GLB…');
    const done=(status,reason='')=>{
      if(remoteId)window.dispatchEvent(new CustomEvent('vp3d-remote-command-done',{
        detail:{id:remoteId,status,reason},
      }));
    };
    try {
      const world=worldRef.current?.world;
      if(!world || JSON.stringify(world.spec)!==specKey) throw Error('A nova cidade ainda está sendo montada. Aguarde o cenário aparecer antes de salvar.');
      const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
      const exporter=new GLTFExporter();
      const exported=await exporter.parseAsync(world.root,{binary:true,maxTextureSize:1024,onlyVisible:true});
      if(!(exported instanceof ArrayBuffer)||exported.byteLength<1000)throw Error('Falha ao criar o modelo 3D.');
      const name='Vitor-Productions-Cidade-' + spec.style + '-' + spec.seed.toString(16) + '.glb';
      const blob=new Blob([exported],{type:'model/gltf-binary'});
      let saved=null;
      if(storageAvailable){
        try {
          saved=await onGenerated?.({blob,filename:name,spec});
        }catch(saveError){
          setStatus('GLB gerado, mas o Safari não conseguiu salvar na biblioteca. Use Baixar GLB.');
        }
      }
      if(!saved) {
        setStatus('Cidade exportada. Baixe o GLB para guardar: o arquivo não foi salvo na biblioteca.');
      }else{
        setSavedId(saved.id);
        setStatus('Cidade salva na biblioteca 3D. Pronta para usar em vídeo.');
      }
      setResult({blob,filename:name});
      if(useFilm && saved?.id)onUseInFilm?.(saved.id);
      done(saved?.id?'applied':'failed',saved?.id?'':'GLB gerado sem salvamento na biblioteca.');
    }catch(e){setError(e.message||'Falha ao exportar');done('failed',e.message||'Falha no GLB');}
    finally{setExporting(false);}
  }

  useEffect(()=>{
    if(!remoteCommand?.id || remoteCommand.id===lastRemote.current)return;
    if(state!=='ready')return;
    // O comando é interpretado no cliente, sem execução arbitrária de JS.
    lastRemote.current=remoteCommand.id;
    const next=safePlan(remoteCommand.payload?.prompt||START_PROMPT);
    setState('loading'); setSpec(next);setPrompt(next.prompt);setOverrides({});
    // A exportação automática acontece após o novo renderizador carregar.
    generatedId.current=remoteCommand.id;
  },[remoteCommand?.id,state]);
  useEffect(()=>{
    if(!generatedId.current||state!=='ready')return;
    const id=generatedId.current;
    if(remoteCommand?.id!==id)return;
    if(spec.prompt!==remoteCommand.payload?.prompt || worldRef.current?.world?.spec?.prompt!==spec.prompt || worldRef.current?.world?.spec?.seed!==spec.seed)return;
    generatedId.current='';
    exportCity({remoteId:id});
  },[state,specKey,remoteCommand?.id]);

  return <div className="city-page">
    <header className="city-header">
      <div>
        <div className="section-kicker">VITOR PRODUCTIONS / CITY ENGINE</div>
        <h1>Cidade 3D <span className="studio-heading-accent">por descrição</span></h1>
        <p>Descreva o cenário. Nosso gerador interpreta o pedido e constrói ruas, prédios e detalhes em três dimensões.</p>
      </div>
      <span className="city-tag"><Sparkles size={15}/> Geração local · sem créditos</span>
    </header>
    <div className="city-layout">
      <div className="city-main">
        <div className="city-preview">
          <canvas key={specKey} ref={canvasRef} aria-label="Prévia navegável da cidade tridimensional gerada"/>
          <div className="city-preview-label"><span className="city-live-dot"/> CIDADE 3D · {spec.style.toUpperCase()}</div>
          <div className="city-hint"><Compass size={15}/> Arraste para girar · role para aproximar</div>
          {state==='loading'&&<div className="city-preview-overlay">Construindo ruas e edifícios...</div>}
          {state==='failed'&&<div className="city-preview-overlay city-preview-error">{error||'Não foi possível carregar o WebGL.'}</div>}
        </div>
        <div className="city-stats">
          <span><Building2 size={15}/>{state==='ready' ? worldRef.current?.world?.stats.buildings||0 : '—'} edifícios</span>
          <span><Layers3 size={15}/>{spec.blocks**2} quarteirões</span>
          <span><Trees size={15}/>{state==='ready'?worldRef.current?.world?.stats.trees||0:'—'} árvores</span>
          <span><CarFront size={15}/>{state==='ready'?worldRef.current?.world?.stats.cars||0:'—'} carros</span>
        </div>
        <div className="city-explanation">
          <div className="city-section-heading"><h2>O que foi interpretado</h2><small>A descrição controla a geometria, a iluminação e o urbanismo.</small></div>
          <div className="city-chips">{spec.explanation.map((label,index)=><span key={label+'-'+index}><Check size={13}/>{label}</span>)}</div>
        </div>
      </div>
      <div className="city-panel">
        <div className="city-section-heading"><h2>Descreva sua cidade</h2><small>Em português · até 1.500 caracteres</small></div>
        <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={1500} className="city-prompt"
          placeholder="Ex.: bairro comercial de noite, com hamburgueria, avenida principal, árvores e pedestres..." rows={6} spellCheck lang="pt-BR"/>
        <div className="city-count">{prompt.length}/1500</div>
        <div className="city-section-heading"><h2>Começar com um estilo</h2></div>
        <div className="city-presets">{CITY_PRESETS.map(item=><button key={item.id} onClick={()=>{setPrompt(item.text);setOverrides({});generate(item.text,{});}}>{item.label}</button>)}</div>
        <div className="city-options">
          <label>Região<select value={overrides.district||''} onChange={e=>setOverrides(o=>({...o,district:e.target.value||undefined}))}>
            <option value="">Detectar do texto</option>{OPTIONS.district.map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label>
          <label>Arquitetura<select value={overrides.style||''} onChange={e=>setOverrides(o=>({...o,style:e.target.value||undefined}))}>
            <option value="">Detectar do texto</option>{OPTIONS.style.map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label>
          <label>Iluminação<select value={overrides.time||''} onChange={e=>setOverrides(o=>({...o,time:e.target.value||undefined}))}>
            <option value="">Detectar do texto</option>{OPTIONS.time.map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label>
          <label>Detalhamento<select value={overrides.blocks||''} onChange={e=>setOverrides(o=>({...o,blocks:e.target.value||undefined}))}>
            <option value="">Automático</option><option value="2">Bairro pequeno</option><option value="3">Distrito médio</option><option value="4">Distrito grande</option></select></label>
        </div>
        <div className="city-generate-actions">
          <button className="city-generate" onClick={()=>generate()} disabled={state==='loading'||exporting}>
            <WandSparkles size={18}/> GERAR CIDADE 3D
          </button>
          <button className={'city-microphone'+(listening?' is-listening':'')} aria-label={listening?'Parar gravação da cidade':'Descrever cidade pelo microfone'} title={listening?'Parar gravação':'Falar como quero a cidade'} onClick={speakCity}>
            {listening?<MicOff size={19}/>:<Mic size={19}/>}
          </button>
        </div>
        {listening&&<p className="city-speech-status" role="status">Ouvindo a descrição… A cidade será construída assim que você terminar de falar.</p>}
        <div className="city-divider"/>
        <div className="city-section-heading"><h2>Exportar cidade</h2><small>Modelo GLB, compatível com o nosso editor.</small></div>
        <button className="city-export" onClick={()=>exportCity()} disabled={state!=='ready'||exporting}>
          <Save size={17}/>{exporting?'GERANDO ARQUIVO GLB…':'SALVAR CIDADE 3D'}
        </button>
        {result&&<button className="city-download" onClick={()=>downloadBlob(result.blob,result.filename)}><Download size={16}/> Baixar GLB · {formatBytes(result.blob.size)}</button>}
        {savedId&&<button className="city-film" onClick={()=>onUseInFilm?.(savedId)}><Film size={16}/> Usar esta cidade no filme <ArrowRight size={15}/></button>}
        {error&&<p className="city-error" role="alert"><CircleAlert size={16}/>{error}</p>}
        {status&&<p className="city-status" role="status">{status}</p>}
        <p className="city-disclaimer">A primeira versão utiliza geração procedural interpretando texto ou voz transcrita pelo navegador, não um modelo de linguagem externo. O reconhecimento de fala pode usar serviços do próprio navegador. As cidades são editáveis, originais e utilizáveis no 3D Studio. Modelos muito grandes podem exigir mais memória no Safari.</p>
      </div>
    </div>
    <section className="city-library">
      <div className="city-section-heading"><h2>Cidades já criadas</h2><small>{cityAssets.length} cenário(s) no navegador</small></div>
      {cityAssets.length===0?<p>Gere e salve a primeira cidade para reutilizar nas produções.</p>:
        <div className="city-saved-list">{cityAssets.slice(0,9).map(asset=><div className="city-saved" key={asset.id}>
          <FileBox size={18}/><span>{asset.name}<small>{formatBytes(asset.size)}</small></span>
          <button onClick={()=>onUseInFilm?.(asset.id)}>Abrir no filme</button>
        </div>)}</div>}
    </section>
  </div>;
}
