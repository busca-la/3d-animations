import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, CheckCircle2, Film, Loader2, Mic, MicOff, Plus, Send, Sparkles, Video, WandSparkles, X } from 'lucide-react';
import FluxLines from './components/FluxLines.jsx';
import { compileVideoPrompt, isCityRequest } from './filmPrompt.js';
import { interpretCityPrompt } from './cityPrompt.js';
import { downloadBlob } from './vault.js';

const CHOICES = [
  'Crie um vídeo 3D de 15 segundos sobre uma hamburgueria numa rua movimentada, com clientes e câmeras diferentes.',
  'Uma cidade 3D moderna à noite, com prédios altos, carros e pedestres. Vídeo vertical de 20 segundos.',
  'Um vídeo cinematográfico de 12 segundos mostrando um produto em um estúdio escuro.',
];

const chooseVideoType = () => {
  if (typeof MediaRecorder === 'undefined') return null;
  const formats = ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  return formats.find(v => MediaRecorder.isTypeSupported(v)) || '';
};
const waitFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
const filenameFor = film => film.title
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-_ ]/g,'')
  .trim().replace(/\s+/g,'-').slice(0,55) || 'video-vp-studio';

export default function ChatStudio({assets=[],onGeneratedCity,onSaveFilm,onProduced,onOpenDirector}) {
  const [prompt,setPrompt] = useState('');
  const [history,setHistory] = useState([]);
  const [busy,setBusy] = useState(false);
  const [stage,setStage] = useState('');
  const [progress,setProgress] = useState(0);
  const [error,setError] = useState('');
  const [film,setFilm] = useState(null);
  const [finished,setFinished] = useState(null);
  const [listening,setListening] = useState(false);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const recognitionRef = useRef(null);
  const cancelRef = useRef(false);
  const currentBlobUrl = useRef(null);
  const runRef = useRef(false);
  const variantRef = useRef(0);
  const messagesRef = useRef(null);

  useEffect(() => {
    if(messagesRef.current) messagesRef.current.scrollTo({top:messagesRef.current.scrollHeight,behavior:'smooth'});
  },[history,stage,finished]);
  useEffect(() => () => {
    cancelRef.current=true;
    recognitionRef.current?.abort?.();
    engineRef.current?.dispose?.();
    if(currentBlobUrl.current) URL.revokeObjectURL(currentBlobUrl.current);
  },[]);

  const addMessage = (role,text,kind='text') => {
    setHistory(prev=>[...prev,{id:(Date.now()+Math.random()).toString(36),role,text,kind}]);
  };

  async function recordFilm(instance,model,outputCanvas) {
    if(!outputCanvas?.captureStream) throw new Error('O navegador não permite gravar o canvas. Teste no Chrome ou Safari atualizado.');
    const type = chooseVideoType();
    if(type===null) throw new Error('MediaRecorder não está disponível neste navegador. A prévia 3D ainda pode ser editada no Diretor.');
    const width=model.format==='16:9'?960:model.format==='1:1'?720:540;
    const height=model.format==='16:9'?540:model.format==='1:1'?720:960;
    instance.resize(width,height);
    instance.render(0);
    const stream=outputCanvas.captureStream(model.fps||30);
    const chunks=[];
    const recorder=type?new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:4800000}):new MediaRecorder(stream);
    let settled=false;
    const recorded=new Promise((resolve,reject)=>{
      recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
      recorder.onerror=e=>reject(e.error||new Error('O gravador interrompeu a produção.'));
      recorder.onstop=()=>chunks.length?
        resolve(new Blob(chunks,{type:recorder.mimeType||type||'video/webm'})):
        reject(new Error('O navegador não retornou quadros do vídeo.'));
    });
    try{
      recorder.start(500);
      setStage('Gravando as cenas e os movimentos de câmera…');
      const begin=performance.now();
      await new Promise((resolve,reject)=>{
        function frame(now){
          if(cancelRef.current){reject(new Error('Produção interrompida.'));return;}
          const t=Math.min(model.duration,(now-begin)/1000);
          try{instance.render(t);}catch(e){reject(e);return;}
          setProgress(Math.floor(t/model.duration*100));
          if(t>=model.duration){resolve();return;}
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
      if(recorder.state!=='inactive')recorder.stop();
      const result=await recorded;
      if(result.size<500)throw new Error('O vídeo gerado ficou vazio.');
      return result;
    }finally{
      try{if(recorder.state!=='inactive')recorder.stop();}catch{/* already stopped */}
      for(const track of stream.getTracks())track.stop();
    }
  }

  async function generate(request=prompt) {
    const description=String(request||'').trim();
    if(runRef.current)return;
    if(description.length<12){setError('Descreva um vídeo em pelo menos 12 caracteres.');return;}
    runRef.current=true;cancelRef.current=false;
    setBusy(true);setError('');setFinished(null);setFilm(null);setProgress(0);
    if(currentBlobUrl.current){URL.revokeObjectURL(currentBlobUrl.current);currentBlobUrl.current=null;}
    setPrompt('');
    addMessage('user',description);
    let instance;
    try{
      setStage('Interpretando seu pedido e montando o roteiro…');
      engineRef.current?.dispose?.();
      engineRef.current=null;
      let planned=compileVideoPrompt(description);
      let activeAssets=assets.slice();
      await waitFrame();

      if(isCityRequest(description,planned)){
        setStage('Construindo um cenário 3D novo a partir da descrição…');
        const cityPrompt=description+' cidade urbana com ruas, calçadas e fachadas';
        const spec=interpretCityPrompt(cityPrompt,{},++variantRef.current);
        const [{createCityWorld},{GLTFExporter}]=await Promise.all([
          import('./cityWorld.js'),import('three/addons/exporters/GLTFExporter.js'),
        ]);
        const world=createCityWorld(spec);
        try{
          // Modelo real e independente do prompt: exportável e recuperável no Diretor 3D.
          const buffer=await new GLTFExporter().parseAsync(world.root,{
            binary:true,onlyVisible:true,maxTextureSize:1024,
          });
          const blob=new Blob([buffer],{type:'model/gltf-binary'});
          const filename='VP-Studio-Cidade-'+spec.seed.toString(16)+'.glb';
          let saved;
          try{saved=await onGeneratedCity?.({blob,filename,spec});}
          catch(saveError){setStage('Cidade criada. Biblioteca indisponível; produzindo prévia temporária…');}
          const asset=saved||{
            id:'temporary-city-'+spec.seed, name:filename, mime:'model/gltf-binary',
            generator:'vp-city-v1',citySpec:spec,blob,
          };
          activeAssets.push(asset);
          planned={...planned,modelAssetId:asset.id};
        }finally{world.dispose();}
      }
      // Salvar roteiro se a biblioteca local estiver operante; sem perder a gravação em falhas do Safari.
      let savedFilm=planned;
      try{savedFilm=await onSaveFilm?.(planned)||planned;}
      catch{setStage('Prévia temporária: o roteiro não foi salvo no navegador.');}
      setFilm(savedFilm);
      setStage('Montando as câmeras e os objetos do filme…');
      await waitFrame();await waitFrame();
      if(!canvasRef.current)throw new Error('O canvas do vídeo não pôde ser inicializado.');
      const {createFilmEngine}=await import('./filmEngine.js');
      instance=await createFilmEngine(canvasRef.current,savedFilm,activeAssets);
      if(cancelRef.current){instance.dispose();return;}
      engineRef.current=instance;
      instance.resize(savedFilm.format==='16:9'?960:savedFilm.format==='1:1'?720:540,
        savedFilm.format==='16:9'?540:savedFilm.format==='1:1'?720:960);
      instance.render(0);
      setStage('Produzindo vídeo 3D no navegador…');
      const video=await recordFilm(instance,savedFilm,canvasRef.current);
      if(cancelRef.current)return;
      const ext=video.type.includes('mp4')?'mp4':'webm';
      const name=filenameFor(savedFilm)+'-'+new Date().toISOString().slice(0,10)+'.'+ext;
      let stored=false;
      try{await onProduced?.(video,name,savedFilm);stored=true;}catch{/* output remains downloadable */}
      const url=URL.createObjectURL(video);
      currentBlobUrl.current=url;
      setFinished({blob:video,name,url,stored,filmId:savedFilm.id||''});
      setProgress(100);
      setStage('');
      addMessage('assistant',stored?
        'Vídeo 3D produzido e salvo na biblioteca. Assista abaixo ou baixe o arquivo.' :
        'Vídeo 3D produzido. A biblioteca não conseguiu salvá-lo; baixe o arquivo para não perder.', 'ready');
    }catch(e){
      setStage('');
      setError(e.message||'Não foi possível gerar este vídeo.');
      addMessage('assistant','Não consegui concluir este vídeo: '+(e.message||'erro desconhecido')+'. Você pode ajustar o pedido ou abrir o Diretor de filmes.','error');
    }finally{
      runRef.current=false;
      setBusy(false);
    }
  }

  function speak(){
    if(listening){recognitionRef.current?.stop?.();return;}
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition){setError('Este navegador não oferece ditado por voz. Digite a descrição ou use outro navegador com reconhecimento de fala.');return;}
    try{
      const recognition=new SpeechRecognition();
      recognitionRef.current=recognition;
      recognition.lang='pt-BR';
      recognition.continuous=false;
      recognition.interimResults=false;
      recognition.onresult=event=>{
        const text=Array.from(event.results).map(x=>x[0]?.transcript||'').join(' ').trim();
        if(text.length>=12){setPrompt(text);generate(text);}
        else setError('Não entendi o vídeo. Fale novamente com mais detalhes.');
      };
      recognition.onerror=event=>{
        setError(event.error==='not-allowed'?'Autorize o microfone nas permissões do navegador.':'Microfone: '+(event.error||'falha no reconhecimento.'));
        setListening(false);
      };
      recognition.onend=()=>{setListening(false);recognitionRef.current=null;};
      recognition.start();setListening(true);setError('');
    }catch(e){setListening(false);setError('Falha no microfone: '+e.message);}
  }

  function reset(){
    if(busy)return;
    engineRef.current?.dispose?.();engineRef.current=null;
    if(currentBlobUrl.current){URL.revokeObjectURL(currentBlobUrl.current);currentBlobUrl.current=null;}
    setHistory([]);setFilm(null);setFinished(null);setPrompt('');setError('');setStage('');setProgress(0);
  }

  return <div className="vp-chat-page">
    <div className="vp-flux-layer" aria-hidden="true">
      <FluxLines
        colors={['#ffffff','#ffffff','#ffffff']}
        glow={2} rimWidth={0.2} lineWidth={1}
        flowDirection="down" mouseInteraction clickSwirl dpr={1}
      />
    </div>
    <div className="vp-chat-gradient" aria-hidden="true"/>
    <header className="vp-chat-top">
      <div className="vp-chat-brand"><img src="/vp-mark.svg" alt="Vitor Productions"/><span>VP <strong>Studio</strong><small>CREATE IN MOTION</small></span></div>
      <button className="vp-chat-clear" disabled={busy} onClick={reset}><Plus size={17}/> Nova criação</button>
    </header>
    <div className="vp-chat-feed" ref={messagesRef} role="log" aria-live="polite" aria-label="Conversas e produções">
      {history.length===0 && <div className="vp-chat-welcome">
        <div className="vp-welcome-mark"><img src="/vp-mark.svg" alt="Símbolo Vitor Productions"/></div>
        <div className="vp-welcome-eyebrow">VITOR PRODUCTIONS / VP STUDIO</div>
        <h1>Imagine. <em>Descreva.</em> Crie.</h1>
        <p>Transforme sua ideia em uma animação 3D. Conte o que deve acontecer ou use a voz.</p>
        <div className="vp-chat-suggestions">{CHOICES.map((idea,i)=><button key={idea} onClick={()=>{setPrompt(idea);}} disabled={busy}><span>{['01','02','03'][i]}</span>{idea}<ArrowRight size={15}/></button>)}</div>
      </div>}
      {history.map(item=><div key={item.id} className={'vp-chat-message vp-message-'+item.role+(item.kind==='error'?' vp-message-error':'')}>
        {item.role==='assistant'&&<div className="vp-message-icon"><img src="/vp-mark.svg" alt=""/></div>}
        <div className="vp-message-body">{item.text}</div>
      </div>)}
      {busy && <div className="vp-chat-processing" role="status">
        <span className="vp-pulse-ring"><Loader2 size={18}/></span>
        <div><strong>{stage||'Criando produção…'}</strong><small>{progress>0?'Gravando vídeo '+progress+'% · mantenha a aba aberta':'Gerando cenário, movimentos e ângulos de câmera.'}</small></div>
        {progress>0&&<div className="vp-processing-bar"><span style={{width:progress+'%'}}/></div>}
      </div>}
      {film && <div className="vp-chat-output">
        <div className="vp-output-top"><span><Video size={16}/> SEU VÍDEO 3D</span><span>{film.duration}s · {film.format} · 30 FPS</span></div>
        <div className={'vp-video-frame vp-format-'+film.format.replace(':','-')}>
          <canvas ref={canvasRef} className="vp-video-canvas" aria-label="Renderização 3D da produção"/>
          {finished&&<video src={finished.url} controls playsInline preload="metadata" className="vp-video-playback" aria-label="Vídeo 3D finalizado"/>}
        </div>
        <div className="vp-output-actions">
          {finished&&<button className="vp-download-button" onClick={()=>downloadBlob(finished.blob,finished.name)}><ArrowDownToLine size={17}/> Baixar vídeo {finished.name.endsWith('mp4')?'MP4':'WebM'}</button>}
          <button className="vp-edit-button" onClick={()=>onOpenDirector?.(film.id||'')} disabled={busy}><Film size={17}/> Editar no Diretor 3D <ArrowRight size={15}/></button>
        </div>
        {!finished&&!busy&&<small className="vp-output-note">A prévia foi montada. Se o navegador não conseguiu gravar, você ainda pode editar ou exportar pelo Diretor 3D.</small>}
        {finished&&<small className="vp-output-note">Produção gerada com geometria procedural e câmera animada no navegador. O formato é definido pelo suporte do dispositivo. Narração opcional pelo Estúdio de Voz.</small>}
      </div>}
      {error && <p className="vp-chat-error" role="alert"><X size={16}/>{error}</p>}
    </div>
    <div className="vp-chat-compose-wrap">
      <form className="vp-chat-composer" onSubmit={event=>{event.preventDefault();generate();}}>
        <textarea aria-label="Descreva o vídeo que deseja criar" value={prompt} onChange={event=>setPrompt(event.target.value)}
          placeholder="Descreva o vídeo que você quer criar…" maxLength={1800} rows={2}
          onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();generate();}}}
          disabled={busy} lang="pt-BR"/>
        <div className="vp-composer-footer">
          <span className="vp-compose-hint"><Sparkles size={14}/> Texto ou voz · animação real 3D</span>
          <div className="vp-compose-controls">
            <button type="button" className={'vp-mic'+(listening?' active':'')} onClick={speak} aria-label={listening?'Parar gravação de voz':'Descrever por voz'} title={listening?'Parar de ouvir':'Usar microfone'} disabled={busy}>{listening?<MicOff size={19}/>:<Mic size={19}/>}</button>
            <button className="vp-send" type="submit" disabled={busy||prompt.trim().length<12} aria-label="Gerar vídeo 3D"><Send size={18}/></button>
          </div>
        </div>
      </form>
      <p className="vp-chat-disclaimer">Geração procedural local, sem créditos externos. Recursos avançados dependem das capacidades do navegador. Guarde os vídeos baixados.</p>
    </div>
  </div>;
}
