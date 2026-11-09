import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Clapperboard, Download, Film, Pause, Play, RotateCcw, Save } from 'lucide-react';
import './film.css';

const LENGTH = 17;
const FPS = 30;
const W = 720;
const H = 1280;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mix = (a, b, p) => a + (b - a) * p;
const ease = (p) => { const v = clamp(p, 0, 1); return v * v * (3 - 2 * v); };

function makeWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9ca6b4');
  scene.fog = new THREE.Fog('#a1a9b2', 22, 53);
  const camera = new THREE.PerspectiveCamera(38, W / H, .1, 110);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const hemi = new THREE.HemisphereLight('#dce8f9', '#65616b', 2.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffdfb5', 3);
  sun.position.set(-8, 14, -7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -19; sun.shadow.camera.right = 19;
  sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 48;
  sun.shadow.bias = -.0005;
  scene.add(sun);
  const mat = (hex, roughness = .9, metalness = 0) => new THREE.MeshStandardMaterial({ color: hex, roughness, metalness });
  const asphalt = mat('#363f48'), concrete = mat('#8b9299');
  const pale = mat('#d8d8d2'), black = mat('#242932');
  const amber = mat('#f1b777'), glass = new THREE.MeshStandardMaterial({ color:'#566b83', metalness:.38, roughness:.22, transparent:true, opacity:.78 });
  const box = (parent, w,h,d,x,y,z, material, cast=true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z);
    mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  };
  const sphere = (parent,r,x,y,z, material,scale=[1,1,1]) => {
    const obj = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), material);
    obj.scale.set(...scale); obj.position.set(x,y,z); obj.castShadow=true; parent.add(obj); return obj;
  };
  function label(text, x,y,z, width, height, bg, fg, size=66) {
    const canvas = document.createElement('canvas');
    canvas.width=1024; canvas.height=256;
    const c = canvas.getContext('2d');
    c.fillStyle=bg; c.fillRect(0,0,1024,256);
    c.fillStyle=fg; c.textAlign='center'; c.textBaseline='middle';
    c.font='900 '+size+'px Arial, sans-serif'; c.fillText(text,512,129,960);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({ map:texture, side:THREE.DoubleSide }));
    plane.position.set(x,y,z); scene.add(plane);
  }
  box(scene,45,.14,36,0,-.13,-3,mat('#627179'),false);
  box(scene,45,.025,12,0,.01,-6.3,asphalt,false);
  box(scene,45,.25,7,0,.04,3.1,concrete,false);
  box(scene,45,.2,.15,0,.17,-.58,pale,false);
  for(let x=-19;x<=19;x+=2.9) box(scene,1.4,.018,.14,x,.03,-6.25,mat('#e6d8ad'),false);
  // Crosswalk across the roadway: stripes parallel to traffic, walking direction is z.
  for(let z=-10.7;z<=-1.8;z+=1.05) box(scene,3.2,.019,.48,-1.0,.035,z,mat('#dbd8d0'),false);
  // Distinct sidewalk paving segments.
  for(let x=-20;x<20;x+=2.7) box(scene,.036,.015,6.8,x,.181,3,mat('#747c84'),false);
  // Facades: real storefront proportions, shop doors, windows and recessed entrance.
  const facadeColors = ['#596572','#8b796d','#b3a28c','#7f8b83','#7e7789'];
  for(let i=0;i<5;i++) {
    const x=-12+i*6;
    const height=[8,11,7.4,9.5,8.5][i];
    const front=5.1;
    box(scene,5.95,height,4.4,x,height/2+.14,front,mat(facadeColors[i]));
    box(scene,6.14,.27,4.6,x,height+.18,front,mat('#535963'));
    for(let floor=1;floor<Math.floor(height/2.2);floor++) {
      for(let win=-1;win<=1;win+=2){
        box(scene,1.1,1.25,.09,x+win*1.37,floor*2.22+1.3,2.84,glass);
        box(scene,1.21,.07,.15,x+win*1.37,floor*2.22+.65,2.76,mat('#343e48'));
      }
    }
    box(scene,5.35,2.63,.16,x,1.57,2.78,mat(i===1?'#2e333b':i===3?'#9c6545':'#414b53'));
    box(scene,2.85,2.15,.095,x-.7,1.40,2.665,mat(i===1?'#313b46':'#5a6a7a'));
    box(scene,.9,2.16,.1,x+1.72,1.39,2.64,mat('#333f4b'));
    box(scene,.72,1.82,.07,x+1.7,1.34,2.58,glass);
    box(scene,5.6,.15,.72,x,3.07,2.47,mat('#3c4147'));
    if(i===1) label('SEM DESTAQUE',x,3.48,2.48,4.7,.62,'#424852','#8d949d',62);
    if(i===3) {
      label('ABERTO',x,3.51,2.45,4.7,.73,'#ebc58b','#312b27',98);
      const windowGlow = new THREE.PointLight('#ffbf73',9,10,2);
      windowGlow.position.set(x,2.15,1.0);scene.add(windowGlow);
      box(scene,2.4,.12,.8,x-.65,.55,2.3,amber);
      box(scene,.6,1.5,.3,x-.75,1.2,2.35,mat('#c99b6b'));
    }
    if(i!==1 && i!==3) label(['LOJA','', 'CAFÉ','','ATELIÊ'][i],x,3.49,2.46,4.7,.64,'#4b565b','#d5d4c7',75);
  }
  // Streetlights and trees establish depth and a lived-in urban scene.
  for(const x of [-10,-1,8,17]) {
    box(scene,.12,4.5,.12,x,2.3,-.20,black);
    box(scene,.74,.12,.15,x-.34,4.5,-.20,black);
    sphere(scene,.18,x-.66,4.46,-.2,mat('#f4d7a3'));
    const lamp = new THREE.PointLight('#ffdfa7',1.5,5);lamp.position.set(x-.62,4.45,-.2);scene.add(lamp);
  }
  for(const x of [-15,13]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.14,.21,2,8),mat('#75604f'));
    trunk.position.set(x,1.25,.02); trunk.castShadow=true;scene.add(trunk);
    sphere(scene,1.2,x,2.7,.02,mat('#60796a'),[1,1.2,.9]);
    sphere(scene,.87,x-.45,2.35,.14,mat('#738971'));
  }
  const customer = new THREE.Group();scene.add(customer);
  const skin=mat('#c7906d'),hair=mat('#252c35'),shirt=mat('#333c51'),pants=mat('#515c68'),shoe=mat('#e4dfd4');
  const torso=box(customer,.77,1.15,.46,0,1.57,0,shirt);
  sphere(customer,.34,0,2.47,0,skin,[.93,1.12,.88]);
  sphere(customer,.34,0,2.68,-.07,hair,[1.02,.55,.99]);
  sphere(customer,.055,-.12,2.48,-.30,black);sphere(customer,.055,.12,2.48,-.30,black);
  const leftLeg=new THREE.Group();leftLeg.position.set(-.22,1.09,0);customer.add(leftLeg);
  box(leftLeg,.27,.82,.32,0,-.40,0,pants);box(leftLeg,.33,.14,.49,0,-.87,-.09,shoe);
  const rightLeg=new THREE.Group();rightLeg.position.set(.22,1.09,0);customer.add(rightLeg);
  box(rightLeg,.27,.82,.32,0,-.40,0,pants);box(rightLeg,.33,.14,.49,0,-.87,-.09,shoe);
  const leftArm=new THREE.Group();leftArm.position.set(-.53,2.01,0);customer.add(leftArm);
  box(leftArm,.26,.89,.28,0,-.45,0,shirt);sphere(leftArm,.16,0,-.94,0,skin);
  const rightArm=new THREE.Group();rightArm.position.set(.53,2.01,0);customer.add(rightArm);
  box(rightArm,.26,.89,.28,0,-.45,0,shirt);sphere(rightArm,.16,0,-.94,0,skin);
  // A car moves along x; properly aligned with lane direction.
  const car=new THREE.Group();scene.add(car);
  box(car,2.35,.59,1.22,0,.64,0,mat('#536b7f',.45,.13));
  box(car,1.25,.55,1.03,-.2,1.17,0,mat('#3c5364',.25,.2));
  for(const x of [-.76,.77]) for(const z of [-.62,.62]) {
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.29,.29,.16,16),black);
    wheel.rotation.x=Math.PI/2;wheel.position.set(x,.35,z);car.add(wheel);
  }
  for(const x of [-1.1,1.12]) box(car,.1,.17,.24,x,.63,-.37,x<0?mat('#e2c5a0'):mat('#a54748'));
  const extra = { customer,leftLeg,rightLeg,leftArm,rightArm,car };
  function animate(t) {
    const x = t < 3.4 ? mix(-7.2,-6.1,ease(t/3.4)) : t < 10.3 ? mix(-6.1,2.5,ease((t-3.4)/6.9)) : mix(2.5,6.4,ease((t-10.3)/4.5));
    customer.position.set(x,.18,-.08);
    customer.rotation.y = t<7 ? -.11 : t<10.3 ? -.23 : .23;
    const moving = t<2.8 || (t>3.4 && t<6.9) || (t>9.9 && t<14.3);
    const gait = moving ? Math.sin(t*9)*.46 : 0;
    leftLeg.rotation.x=gait;rightLeg.rotation.x=-gait;
    leftArm.rotation.x=-gait*.72;rightArm.rotation.x=gait*.72;
    torso.rotation.z = moving ? Math.sin(t*9)*.019 : 0;
    car.position.set(mix(-19,19,(t%11)/11),0,-8.95);
    const look = new THREE.Vector3();
    if(t<3.4){
      const p=ease(t/3.4);
      camera.position.set(mix(10.5,7.1,p),mix(7.5,6.2,p),mix(-18,-15,p));
      look.set(0,2.2,2.3);
    } else if(t<7.3){
      const p=ease((t-3.4)/3.9);
      camera.position.set(x+mix(4.4,2.9,p),mix(3.7,2.9,p),mix(-8.6,-5.4,p));
      look.set(x,1.8,1.5);
    } else if(t<10.3){
      const p=ease((t-7.3)/3);
      camera.position.set(mix(-.5,3.0,p),mix(4.1,3.4,p),mix(-10.4,-7.3,p));
      look.set(0.6,2.8,2.55);
    } else if(t<14.5){
      const p=ease((t-10.3)/4.2);
      camera.position.set(mix(9.5,6.9,p),mix(5.4,3.2,p),mix(-10.5,-5.3,p));
      look.set(mix(3.3,5.4,p),2,2.2);
    } else {
      camera.position.set(7.3,6.1,-14.1);look.set(0,2.6,2);
    }
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }
  return {renderer,scene,camera,animate,dispose:()=>{
    scene.traverse(obj=>{
      if(obj.geometry) obj.geometry.dispose();
      if(obj.material) (Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>{
        if(m.map) m.map.dispose();m.dispose();
      });
    });renderer.dispose();
  }};
}

function drawTitles(ctx,t,w,h){
  const s=w/W;
  const stage=t<3.4?0:t<7.3?1:t<10.3?2:t<14.5?3:4;
  const titles=[
    ['UM CLIENTE','ESTAVA CHEGANDO.'],
    ['MAS ELE','PASSOU DIRETO.'],
    ['NÃO FOI','POR ACASO.'],
    ['UM NEGÓCIO','FOI VISTO.'],
    ['VITOR','PRODUCTIONS']
  ];
  const subtitle=['','','','O outro ficou invisível.','3D · STORYTELLING'];
  // Contrast and subtle vignette within the exported frames.
  const gradient=ctx.createLinearGradient(0,h*.35,0,h);
  gradient.addColorStop(0,'rgba(6,10,17,0)');
  gradient.addColorStop(.7,'rgba(6,10,17,.28)');
  gradient.addColorStop(1,'rgba(6,10,17,.83)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  const current=stage===0?t:stage===1?t-3.4:stage===2?t-7.3:stage===3?t-10.3:t-14.5;
  let opacity=ease(current/.5);
  const till=[3.4,3.9,3,4.2,2.5][stage];
  opacity*=ease((till-current)/.45);
  if(stage===4){
    ctx.fillStyle='rgba(9,12,19,'+(ease(current/.6)*.86)+')';ctx.fillRect(0,0,w,h);
  }
  ctx.save();ctx.globalAlpha=opacity;ctx.textAlign='center';
  ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=18*s;
  const yy=stage===4?h*.48:h*.79;
  ctx.font='900 '+Math.round((stage===4?58:63)*s)+'px Arial, sans-serif';
  ctx.fillStyle='#fffdf7';
  ctx.fillText(titles[stage][0],w/2,yy,w*.9);
  ctx.fillStyle='#efc38a';
  ctx.fillText(titles[stage][1],w/2,yy+80*s,w*.91);
  if(subtitle[stage]){
    ctx.font='600 '+Math.round(23*s)+'px Arial, sans-serif';ctx.fillStyle='#dad7d0';
    ctx.fillText(subtitle[stage],w/2,yy+136*s,w*.85);
  }
  ctx.restore();
  // Subtle identity at the top without obscuring the animation.
  if(stage!==4){
    ctx.save();ctx.globalAlpha=.83;ctx.fillStyle='#fff';
    ctx.font='bold '+Math.round(17*s)+'px Arial, sans-serif';ctx.textAlign='left';
    ctx.fillText('VITOR PRODUCTIONS  /  ORIGINAL',40*s,65*s);
    ctx.restore();
  }
}

function audioTrack() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if(!AudioContext) return null;
  const context=new AudioContext();
  const target=context.createMediaStreamDestination();
  const master=context.createGain();master.gain.value=.48;
  master.connect(target);
  const base=context.currentTime+.07;
  function tone(freq,when,duration,volume,type='sine'){
    const osc=context.createOscillator(),gain=context.createGain();
    osc.type=type;osc.frequency.setValueAtTime(freq,when);
    gain.gain.setValueAtTime(.0001,when);
    gain.gain.exponentialRampToValueAtTime(volume,when+.022);
    gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
    osc.connect(gain);gain.connect(master);osc.start(when);osc.stop(when+duration+.04);
  }
  for(let b=0;b<29;b++) {
    const when=base+b*.55;
    tone(b%4===0?75:110,when,.16,b%4===0?.075:.035);
    if(b%4===2) tone(220,when,.26,.024,'triangle');
  }
  [[0,146.83],[3.4,174.61],[7.3,196],[10.3,220],[14.5,164.81]].forEach(([t,f])=>{
    tone(f,base+t,.9,.06,'triangle');tone(f*1.5,base+t+.08,1.1,.021,'sine');
  });
  return {context,target,stop:()=>context.close().catch(()=>{})};
}

export default function FilmStudio({onGenerated}) {
  const canvasRef=useRef(null);
  const engineRef=useRef(null);
  const clockRef=useRef({t:0,prev:0,playing:false});
  const [ready,setReady]=useState(false);
  const [playing,setPlaying]=useState(false);
  const [time,setTime]=useState(0);
  const [exporting,setExporting]=useState(false);
  const [progress,setProgress]=useState(0);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let active=true,raf=0;
    try {
      const engine=makeWorld();
      engineRef.current=engine;
      const output=canvasRef.current;
      output.width=W;output.height=H;
      const ctx=output.getContext('2d',{alpha:false});
      function frame(now){
        if(!active)return;
        const clock=clockRef.current;
        const delta=clock.prev?Math.min((now-clock.prev)/1000,.08):0;
        clock.prev=now;
        if(clock.playing){
          clock.t=Math.min(LENGTH,clock.t+delta);
          if(clock.t>=LENGTH){clock.playing=false;setPlaying(false);}
        }
        engine.animate(clock.t);
        engine.renderer.render(engine.scene,engine.camera);
        ctx.drawImage(engine.renderer.domElement,0,0,W,H);
        drawTitles(ctx,clock.t,W,H);
        if(!clock.lastUI || now-clock.lastUI>90){setTime(clock.t);clock.lastUI=now;}
        raf=requestAnimationFrame(frame);
      }
      raf=requestAnimationFrame(frame);
      setReady(true);
    }catch(err){setMessage('O navegador não conseguiu iniciar a cena 3D: '+err.message);}
    return()=>{active=false;cancelAnimationFrame(raf);clockRef.current.playing=false;engineRef.current?.dispose();engineRef.current=null;};
  },[]);
  function toggle(){
    if(!ready||exporting)return;
    const c=clockRef.current;
    if(c.t>=LENGTH)c.t=0;
    c.playing=!c.playing;c.prev=0;setPlaying(c.playing);
  }
  function seek(value){
    if(exporting)return;
    clockRef.current.t=Number(value);
    clockRef.current.prev=0;
    clockRef.current.playing=false;setPlaying(false);setTime(Number(value));
  }
  async function exportFilm(){
    if(!ready||exporting)return;
    if(typeof MediaRecorder==='undefined'||!canvasRef.current.captureStream){
      setMessage('Seu navegador não permite gravar Canvas. Use Chrome ou Edge atualizado.');
      return;
    }
    const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(s=>MediaRecorder.isTypeSupported(s));
    if(!mime){setMessage('Nenhum formato de gravação disponível neste navegador.');return;}
    setExporting(true);setPlaying(false);setProgress(0);setMessage('');
    let recorder,audio,stream,interval;
    try{
      const clock=clockRef.current;
      clock.playing=false;clock.t=0;clock.prev=0;
      // Recording is real-time; preserve each rendered frame and optional original soundtrack.
      stream=canvasRef.current.captureStream(FPS);
      audio=audioTrack();
      if(audio){
        await audio.context.resume();
        audio.target.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
      }
      const chunks=[];
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4_500_000});
      const stopped=new Promise((resolve,reject)=>{
        recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        recorder.onerror=()=>reject(new Error('Falha na gravação do navegador.'));
        recorder.onstop=()=>resolve();
      });
      recorder.start(250);
      clock.playing=true;
      interval=setInterval(()=>{
        setProgress(Math.min(99,Math.round(clock.t/LENGTH*100)));
        if(clock.t>=LENGTH&&!clock.playing&&recorder.state==='recording')recorder.stop();
      },140);
      // Browser throttling/suspended tab may affect capture, so keep this page visible.
      await stopped;
      if(!chunks.length)throw new Error('Gravação sem quadros.');
      const ext=mime.includes('mp4')?'mp4':'webm';
      const blob=new Blob(chunks,{type:mime});
      await onGenerated(blob,'VP_Cliente_Que_Passou_Direto.'+ext);
      setProgress(100);
      setMessage('Curta criado e salvo na biblioteca. Abra o Editor de vídeo para ajustar e baixar.');
    } catch(err){
      setMessage('Não foi possível finalizar: '+err.message);
    } finally {
      clearInterval(interval);
      if(recorder?.state==='recording')recorder.stop();
      stream?.getTracks().forEach(t=>t.stop());
      audio?.stop();
      clockRef.current.playing=false;clockRef.current.t=0;clockRef.current.prev=0;
      setExporting(false);setPlaying(false);
    }
  }
  return <section className="film-studio">
    <div className="page-heading">
      <div><div className="section-kicker">PRODUÇÃO ORIGINAL · CENA 3D</div>
        <h1>O cliente que <span className="studio-heading-accent">passou direto.</span></h1>
        <p>Curta original de 17 segundos: cidade, travessia, comércio, personagem animado, quatro ângulos e iluminação. Sem imagens estáticas geradas por IA.</p>
      </div>
    </div>
    <div className="film-layout">
      <div className="film-monitor">
        <div className="studio-panel-title">CÂMERA / PRÉ-VISUALIZAÇÃO 3D <span>{ready?'CENA CARREGADA':'PREPARANDO'}</span></div>
        <div className="film-canvas-box"><canvas ref={canvasRef} aria-label="Visualização do curta 3D original" /></div>
        <div className="film-controls">
          <button type="button" className="video-play" aria-label={playing?'Pausar':'Reproduzir'} onClick={toggle} disabled={!ready||exporting}>{playing?<Pause size={18}/>:<Play size={18}/>}</button>
          <span>{time.toFixed(1)}s</span>
          <input type="range" aria-label="Linha do tempo" min="0" max={LENGTH} step=".1" value={time} onChange={e=>seek(e.target.value)} disabled={!ready||exporting}/>
          <span>{LENGTH}s</span>
          <button type="button" className="studio-tool" onClick={()=>seek(0)} disabled={exporting}><RotateCcw size={15}/> Reiniciar</button>
        </div>
      </div>
      <aside className="film-inspector">
        <div className="studio-panel-title">DIREÇÃO · PROJETO 001</div>
        <h2>Uma decisão em segundos.</h2>
        <p>Um cliente chega a uma rua. Uma loja passa despercebida. Outra, com entrada visível, atrai sua atenção.</p>
        <div className="film-shot"><strong>01 · 0–3,4s</strong><span>Plano geral da cidade</span></div>
        <div className="film-shot"><strong>02 · 3,4–7,3s</strong><span>Travelling acompanhando o cliente</span></div>
        <div className="film-shot"><strong>03 · 7,3–10,3s</strong><span>Contraste entre fachadas</span></div>
        <div className="film-shot"><strong>04 · 10,3–14,5s</strong><span>Escolha e consequência</span></div>
        <div className="film-shot"><strong>05 · 14,5–17s</strong><span>Assinatura Vitor Productions</span></div>
        <div className="film-specs"><span>9:16 vertical</span><span>720 × 1280</span><span>30 FPS</span><span>Som original sintetizado</span></div>
        <button className="btn btn-primary film-render" disabled={!ready||exporting} onClick={exportFilm}>
          {exporting?<Save size={17}/>:<Clapperboard size={17}/>}
          {exporting?'Renderizando... '+progress+'%':'Gerar vídeo e abrir editor'}
        </button>
        {exporting&&<div className="video-export-progress"><span style={{width:progress+'%'}}/></div>}
        {message&&<p className="video-editor-message" role="status">{message}</p>}
        <p className="film-note">O curta é renderizado no seu navegador, preserva os materiais locais e entra no editor sem publicar nada. MP4 ou WebM depende dos codecs disponíveis. Mantenha a aba aberta durante a gravação.</p>
      </aside>
    </div>
  </section>;
}