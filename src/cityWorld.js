import * as THREE from 'three';

const palettes = {
  moderno: {
    buildings: ['#a2a8a7','#8f999d','#c2b3a5','#7c8b91','#bbb8ad','#8d9287'],
    accent: ['#ad8065','#5e7778','#a99268','#5d697a'],
    glass:'#476674', road:'#363c43', sidewalk:'#b4b6b3', lawn:'#617a60',
  },
  retro: {
    buildings: ['#b8a08a','#a87762','#c5b59a','#8a8f77','#c4a78a','#837c71'],
    accent: ['#9b604c','#7d5a4b','#a68c57','#676958'],
    glass:'#4c626b', road:'#4a4845', sidewalk:'#c9b9aa', lawn:'#718062',
  },
  futurista: {
    buildings: ['#637888','#566578','#88979e','#38475c','#74838a','#536572'],
    accent: ['#3b8ca1','#a17ca4','#667ca2','#8d879d'],
    glass:'#405e7e', road:'#2e3544', sidewalk:'#8e9ea4', lawn:'#506e76',
  },
};

const DEFAULT_STORES = {
  comercial:['HAMBURGUERIA','CAFETERIA','MERCADO','FARMÁCIA','PADARIA','LOJA'],
  residencial:['CASA','CASA','CASA','CAFETERIA','MERCADO'],
  industrial:['GALPÃO','OFICINA','DEPÓSITO','FÁBRICA'],
};

const STORE_LABELS = {
  hamburgueria:'HAMBURGUERIA', cafeteria:'CAFETERIA', padaria:'PADARIA',
  mercado:'MERCADO', restaurante:'RESTAURANTE', cinema:'CINEMA',
  farmacia:'FARMÁCIA', loja:'LOJA', galpao:'GALPÃO',
  escola:'ESCOLA', hospital:'HOSPITAL', posto:'POSTO', hotel:'HOTEL',
  igreja:'IGREJA', shopping:'SHOPPING', biblioteca:'BIBLIOTECA', estadio:'ESTÁDIO',
};
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
const sinus = (x) => (Math.sin(x)+1)/2;
const rng = (seed) => { let s=(seed || 4571)>>>0; return () => { s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; }; };

export function createCityWorld(spec) {
  const p = palettes[spec.style] || palettes.moderno;
  const rand = rng(spec.seed);
  const root = new THREE.Group();
  root.name = 'Cidade — Vitor Productions';
  const scene = new THREE.Scene();
  const night = spec.time === 'noite';
  const dusk = spec.time === 'tarde';
  const wet = spec.weather === 'chuva';
  const foggy = spec.weather !== 'limpo';
  scene.background = new THREE.Color(night ? '#161d31' : dusk ? '#c7b5a4' : '#b5ccd6');
  scene.fog = new THREE.Fog(scene.background, foggy ? 32 : 48, foggy ? 105 : 175);
  scene.add(root);

  const materials = new Map(), shapes = new Map(), dynamic = [], cars = [], pedestrians = [];
  const stats = { buildings:0, shops:0, roads:0, trees:0, cars:0, pedestrians:0, blocks:spec.blocks**2 };
  const defaultRoughness = wet ? .48 : .88;
  const getMat = (color, variant = '') => {
    const key = color + variant;
    if (!materials.has(key)) {
      const opts = {color, roughness:variant==='glass'?.23:variant==='road'&&wet?.32:defaultRoughness,metalness:variant==='glass'?.25:variant==='road'&&wet?.12:.02};
      if(variant==='glow') { opts.emissive=new THREE.Color(color); opts.emissiveIntensity=night?.55:.17; }
      materials.set(key,new THREE.MeshStandardMaterial(opts));
    }
    return materials.get(key);
  };
  const geom=(type,...params)=>{
    const key=type+':'+params.join(',');
    if(!shapes.has(key))shapes.set(key,new THREE[type](...params));
    return shapes.get(key);
  };
  function mesh(parent,name,shape,material,position,scale=[1,1,1],rotation=null){
    const m=new THREE.Mesh(shape,material);
    m.name=name;
    m.position.set(...position);
    m.scale.set(...scale);
    if(rotation)m.rotation.set(...rotation);
    m.castShadow=position[1]>.32&&name!=='Janela';
    m.receiveShadow=true;
    parent.add(m); return m;
  }
  const box=(par,name,x,y,z,w,h,d,col,variant='')=>mesh(par,name,geom('BoxGeometry',1,1,1),getMat(col,variant),[x,y,z],[w,h,d]);
  const cylinder=(par,name,x,y,z,r,h,col,sides=8)=>mesh(par,name,geom('CylinderGeometry',r,r,h,sides),getMat(col),[x,y,z]);
  const sphere=(par,name,x,y,z,r,col,scale=[1,1,1])=>mesh(par,name,geom('IcosahedronGeometry',1,1),getMat(col),[x,y,z],scale.map(t=>t*r));
  const sidewalks = spec.sidewalks !== false;
  const roadWidth=clamp(Number(spec.roadWidth)||7.6,5.4,9.0), spacing=21.5;
  const N=clamp(Number(spec.blocks)||3,2,4);
  const roadNodes=Array.from({length:N+1},(_,i)=>(i-N/2)*spacing);
  const min=roadNodes[0],max=roadNodes[N],total=max-min+roadWidth+14;
  const axis=(a,b,i)=>a+(b-a)*i;
  const timeLight=new THREE.HemisphereLight(night?'#a1bbda':dusk?'#fff0d5':'#ecf4ff',night?'#2b3441':'#69746a',night?2:2.7);
  scene.add(timeLight);
  const sun=new THREE.DirectionalLight(night?'#a6bbeb':dusk?'#ffdfb4':'#fff1db',night?1.6:3.1);
  sun.position.set(-26,34,20);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  sun.shadow.camera.left=-100;sun.shadow.camera.right=100;
  sun.shadow.camera.top=100;sun.shadow.camera.bottom=-100;
  sun.shadow.camera.far=190;sun.shadow.bias=-.0004;
  scene.add(sun);
  const fill=new THREE.DirectionalLight('#b1cbdc',.65);fill.position.set(16,15,-24);scene.add(fill);

  box(root,'Terreno',0,-.23,0,total,.42,total,p.lawn);
  for(const z of roadNodes){
    box(root,'Avenida leste-oeste',0,.02,z,total-.8,.065,roadWidth,p.road,'road');stats.roads++;
  }
  for(const x of roadNodes){
    box(root,'Avenida norte-sul',x,.038,0,roadWidth,.065,total-.8,p.road,'road');stats.roads++;
  }
  for(let zi=0;zi<roadNodes.length;zi++){
    for(let xi=0;xi<roadNodes.length;xi++){
      const x=roadNodes[xi],z=roadNodes[zi];
      // Faixas atravessam os eixos certos; nenhuma faixa flutua ou cobre calçadas.
      if(spec.crossing!==false){
        const stripeCount=Math.max(5, Math.floor(roadWidth/.75));
        for(let k=0;k<stripeCount;k++){
          const offset=(k-(stripeCount-1)/2)*.75;
          if(xi<N){
            box(root,'Faixa pedestre transversal',x+roadWidth/2+1.65,.090,z+offset,2.6,.012,.40,'#e9e9e3');
          }
          if(zi<N){
            box(root,'Faixa pedestre longitudinal',x+offset,.094,z+roadWidth/2+1.65,.40,.012,2.6,'#e9e9e3');
          }
        }
      }
      if(xi<N){
        const next=roadNodes[xi+1],mid=(x+next)/2;
        for(const offset of [-2.8,2.8]){
          box(root,'Linha eixo',mid,.082,z+offset,3.2,.016,.08,'#ded6a3');
        }
      }
      if(zi<N){
        const next=roadNodes[zi+1],mid=(z+next)/2;
        for(const offset of [-2.8,2.8])box(root,'Linha via',x+offset,.086,mid,.08,.016,3.2,'#e7d59c');
      }
    }
  }
  const blocks=[];
  for(let iz=0;iz<N;iz++)for(let ix=0;ix<N;ix++){
    const x=(roadNodes[ix]+roadNodes[ix+1])/2;
    const z=(roadNodes[iz]+roadNodes[iz+1])/2;
    const available=spacing-roadWidth;
    const sidewalkSpan=available-.18;
    const background=spec.district==='industrial'?'#a4a8a5':p.sidewalk;
    box(root,'Quarteirão',x,.185,z,sidewalkSpan,.26,sidewalkSpan,background);
    if(sidewalks){
      box(root,'Guia norte',x,.325,z-sidewalkSpan/2+.12,sidewalkSpan,.13,.25,'#e7e1d8');
      box(root,'Guia sul',x,.325,z+sidewalkSpan/2-.12,sidewalkSpan,.13,.25,'#e7e1d8');
      box(root,'Guia oeste',x-sidewalkSpan/2+.12,.325,z,.25,.13,sidewalkSpan,'#e7e1d8');
      box(root,'Guia leste',x+sidewalkSpan/2-.12,.325,z,.25,.13,sidewalkSpan,'#e7e1d8');
    }
    blocks.push({x,z,ix,iz,available:sidewalkSpan});
  }

  // Fachadas com janelas, entradas e placas em posições coerentes.
  const labelMaterialCache = [];
  function labelTexture(label, color = '#282d39') {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=112;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=color;ctx.fillRect(0,0,512,112);
    ctx.fillStyle='#f2e9d3';ctx.font='700 46px system-ui,Arial';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(label.slice(0,18),256,59,480);
    const tex=new THREE.CanvasTexture(canvas);
    tex.colorSpace=THREE.SRGBColorSpace;
    labelMaterialCache.push(tex);
    return tex;
  }
  function sign(x,y,z,w,title,colour) {
    const texture=labelTexture(title,colour);
    const face=new THREE.Mesh(geom('PlaneGeometry',1,1),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
    face.name='Placa: '+title;face.position.set(x,y,z);face.scale.set(w,.95,1);
    root.add(face);
    dynamic.push({kind:'textureMaterial',material:face.material});
  }
  function building(x,z,w,d,storeLabel,baseHeight,isFocus=false){
    const commercial=storeLabel && storeLabel!=='CASA' && spec.district!=='industrial';
    const h=baseHeight;
    const side=(rand()-.5)*.6, front=z+d/2;
    const wall=p.buildings[Math.floor(rand()*p.buildings.length)];
    const trim=p.accent[Math.floor(rand()*p.accent.length)];
    box(root,isFocus?'Comércio principal':'Edifício',x,.35+h/2,z,w,h,d,wall);
    box(root,'Cobertura',x,.37+h,z,w+.28,.28,d+.28,storeLabel==='CASA'?'#725b54':'#454f56');
    if(storeLabel==='CASA') {
      // Telhado próprio de casa: um prisma triangular contínuo, não um bloco genérico.
      const geometry=geom('CylinderGeometry',.95,.95,1,3);
      const roof=mesh(root,'Telhado da casa',geometry,getMat('#835f52'),
        [x,h+.9,z],[d*.74,Math.max(1.8,w*.62),d*.74],[Math.PI/2,Math.PI/2,0]);
      roof.castShadow=true;
      // Jardim na entrada, contido no lote.
      box(root,'Jardim da casa',x,.36,z+d/2+.38,Math.min(w-1,.95),.06,.55,p.lawn);
    }
    if(storeLabel==='HOSPITAL') {
      box(root,'Cruz hospitalar vertical',x,Math.min(4.7,h+.2),front+.25,.25,.95,.08,'#b94545');
      box(root,'Cruz hospitalar horizontal',x,Math.min(4.7,h+.2),front+.25,.82,.25,.09,'#b94545');
    }
    box(root,'Fachada térrea',x,1.6,z+d/2+.06,w-.16,2.5,.12,commercial?'#677b7d':wall);
    // Porta alinhada com o pavimento da calçada, sem degrau impossível.
    box(root,'Porta',x,1.48,front+.14,1.35,2.3,.18,commercial?'#343c42':'#6b5750');
    box(root,'Vidro da porta',x,1.52,front+.244,1.0,1.7,.03,p.glass,'glass');
    box(root,'Puxador',x+.43,1.47,front+.27,.045,.3,.065,'#ddc49c');
    if(commercial){
      for(const direction of [-1,1]){
        const wx=x+direction*(w/2-1.1);
        box(root,'Vitrine',wx,1.65,front+.14,1.45,1.78,.10,p.glass,'glass');
        box(root,'Moldura vitrine',wx,2.58,front+.20,1.56,.12,.17,trim);
      }
      box(root,'Marquise',x,3.15,front+.5,w+.4,.20,.95,trim);
      sign(x,3.87,front+.10,w*.83,storeLabel,isFocus?'#252a30':'#353840');
      stats.shops++;
    }else if(spec.district==='industrial'){
      box(root,'Portão galpão',x,1.7,front+.15,w*.64,2.6,.15,'#52636b');
      for(let stripe=0;stripe<6;stripe++)box(root,'Trilho portão',x,.7+stripe*.38,front+.24,w*.64,.035,.06,'#b4bab9');
    }
    if(h>=5.5) {
      const floors=clamp(Math.floor((h-3.4)/2.7),1,7);
      for(let floor=0;floor<floors;floor++){
        const y=4.55+floor*2.65;
        if(y+1.1>h+.22)continue;
        const cols=clamp(Math.floor(w/2.25),2,5);
        for(let k=0;k<cols;k++){
          const wx=x+(k-(cols-1)/2)*(w-.85)/cols;
          box(root,'Janela',wx,y,front+.085,(w-.85)/cols*.64,1.15,.052,p.glass,'glass');
          box(root,'Peitoril',wx,y-.68,front+.15,(w-.85)/cols*.74,.08,.18,'#d3d1c8');
        }
      }
    }
    box(root,'Entrada calçada',x,.332,front+.62,1.6,.05,.9,backgroundForEntry());
    stats.buildings++;
    return {height:h};
  }
  function backgroundForEntry(){return spec.district==='industrial'?'#a4a8a5':p.sidewalk;}

  const centerIndex=Math.floor((N-1)/2);
  const centerBlock=blocks.find(b=>b.ix===centerIndex&&b.iz===centerIndex) || blocks[0];
  const parkNeeded=spec.park || spec.focusFeatures?.playground || spec.focusFeatures?.fountain;
  const parkOptions=blocks.filter(b=>b!==centerBlock);
  const parkBlock=parkNeeded ? parkOptions[Math.floor(rand()*parkOptions.length)] || null : null;
  const requestedShops=spec.stores.map(key=>STORE_LABELS[key]||key.toUpperCase()).filter(Boolean);
  const fallback=DEFAULT_STORES[spec.district]||DEFAULT_STORES.comercial;
  let storeIndex=0;
  for(const block of blocks){
    const isPark=parkBlock===block;
    if(isPark){
      box(root,'Praça verde',block.x,.347,block.z,block.available-1,.07,block.available-1,p.lawn);
      box(root,'Caminho da praça',block.x,.392,block.z,block.available-1,.05,1.1,'#c5b5a1');
      box(root,'Caminho transversal',block.x,.394,block.z,1.1,.05,block.available-1,'#c5b5a1');
      if(spec.trees && !(spec.requestedTrees===0)) {
        for(const dx of [-3,3]) for(const dz of [-3,3]) {
          // Árvores sempre dentro da área verde, não em cima de asfalto.
          tree(block.x+dx,block.z+dz,1+rand()*.45);
        }
      }
      bench(block.x-2,block.z+1.5);
      bench(block.x+2,block.z-1.5);
      if(spec.focusFeatures?.fountain) {
        cylinder(root,'Fonte base',block.x,.48,block.z,1.45,.55,'#949fa2',16);
        cylinder(root,'Água da fonte',block.x,.78,block.z,1.21,.05,'#6eafc7',16);
        cylinder(root,'Fonte central',block.x,1.27,block.z,.2,.94,'#b2c4c4',12);
        sphere(root,'Jato de água',block.x,1.86,block.z,.24,'#b1e1ea');
      }
      if(spec.focusFeatures?.playground) {
        const px=block.x+2.0,pz=block.z-1;
        box(root,'Escorregador plataforma',px,1.22,pz,1.15,.15,1.05,'#d79e57');
        for(const dx of [-.43,.43]) for(const dz of [-.37,.37])
          cylinder(root,'Suporte parquinho',px+dx,.75,pz+dz,.055,1.35,'#647988',6);
        const slide=box(root,'Escorregador',px+1.12,.72,pz,.85,.12,.78,'#b77a65');
        slide.rotation.z=-.55;
      }
      continue;
    }
    if(spec.requestedBuildings && stats.buildings>=spec.requestedBuildings) {
      box(root,'Lote com jardim',block.x,.338,block.z,block.available-1,.045,block.available-1,p.lawn);
      if(spec.trees && (!spec.requestedTrees || stats.trees<spec.requestedTrees))
        tree(block.x,block.z,.75);
      continue;
    }
    // Variações por pedido: fachadas, quantidades e lotes mudam de lugar a cada geração.
    const slots=spec.district==='industrial'?1:
      spec.density==='alta' ? (rand()<.60?3:2) :
      spec.density==='baixa' ? (rand()<.55?1:2) : (rand()<.28?1:2);
    const inside=block.available-2.0;
    const pitch=inside/slots, depth=inside-.4;
    for(let j=0;j<slots;j++){
      if(spec.requestedBuildings && stats.buildings>=spec.requestedBuildings) break;
      const isFocus=block===centerBlock&&j===0;
      const x=block.x+(j-(slots-1)/2)*pitch;
      const frontage=block.z+.0;
      const w=pitch-.35;
      const store=isFocus?(STORE_LABELS[spec.focal]||'LOJA'):
        spec.district==='residencial'&&rand()<.78?'CASA':
        requestedShops.length?requestedShops[(storeIndex++)%requestedShops.length]:
        fallback[Math.floor(rand()*fallback.length)];
      const h=spec.district==='industrial'?5.7+rand()*2.1:
        store==='CASA'?(3.5+rand()*2.3):
        spec.height==='alto'?(9+rand()*12):
        spec.height==='baixo'?(3.9+rand()*2.9):
        (5.4+rand()*7.1);
      building(x,frontage,w,depth,store,h,isFocus);
      // Detalhes de mobiliário somente nas bordas da calçada.
      if(spec.trees&&spec.density!=='alta'&&rand()<.35){
        tree(x,block.z-block.available/2+1.1,.65+rand()*.20);
      }
    }
  }

  function tree(x,z,scale=1) {
    if(spec.requestedTrees && stats.trees>=spec.requestedTrees)return;
    cylinder(root,'Tronco',x,.45+1.25*scale,z,.15*scale,2.5*scale,'#654b3b',8);
    sphere(root,'Copa',x,2.65*scale,z,1.35,'#5f7d67',[scale,scale*.94,scale]);
    sphere(root,'Copa secundária',x+.4*scale,2.9*scale,z-.2*scale,.85,'#678669',[scale,scale,scale]);
    stats.trees++;
  }
  function bench(x,z){
    for(const shift of [-.75,.75])box(root,'Pé banco',x+shift,.59,z,.16,.5,.42,'#485056');
    box(root,'Banco assento',x,.87,z,2.0,.15,.65,'#907761');
    box(root,'Encosto banco',x,1.35,z-.24,2.0,.72,.12,'#907761');
  }

  // Elementos que dependem da descrição: estacionamento, paragem e palmeiras.
  if(spec.focusFeatures?.parking){
    const lot=blocks.find(b=>b!==centerBlock&&b!==parkBlock);
    if(lot){
      const px=lot.x,pz=lot.z;
      box(root,'Estacionamento',px,.35,pz,Math.min(lot.available-1,9),.08,3.5,p.road,'road');
      for(const dx of [-3,-1,1,3])box(root,'Vaga estacionamento',px+dx,.396,pz,.065,.013,3.1,'#e9e7dc');
    }
  }
  if(spec.focusFeatures?.busStop){
    const bx=centerBlock.x+centerBlock.available/2-1,bz=centerBlock.z-centerBlock.available/2+1;
    for(const dx of [-.85,.85])cylinder(root,'Poste abrigo',bx+dx,1.25,bz,.07,2.3,'#545f66');
    box(root,'Cobertura ponto ônibus',bx,2.48,bz,2.4,.17,1.4,'#6b8290');
    box(root,'Banco abrigo',bx,.80,bz,1.8,.16,.4,'#8a7965');
  }
  if(spec.treesStyle==='palmeira' && spec.trees){
    for(const b of blocks.slice(0,Math.min(6,blocks.length))){
      if(spec.requestedTrees && stats.trees>=spec.requestedTrees)break;
      cylinder(root,'Tronco palmeira',b.x-3,1.8,b.z-3,.13,3.4,'#8a745b',9);
      for(let k=0;k<7;k++){
        const angle=k/7*Math.PI*2;
        const leaf=box(root,'Folha palmeira',b.x-3+Math.cos(angle)*.85,3.6,b.z-3+Math.sin(angle)*.85,1.7,.13,.34,'#587858');
        leaf.rotation.y=-angle;
        leaf.rotation.z=Math.sin(angle)*.18;
      }
      stats.trees++;
    }
  }

  // Iluminação urbana construída fora da via; mais densidade só à noite.
  for(let i=0;i<=N;i++)for(let j=0;j<=N;j++){
    if((i+j)%2!==0)continue;
    const x=roadNodes[i]+roadWidth/2+1.0;
    const z=roadNodes[j]+roadWidth/2+1.0;
    if(x>max+roadWidth/2||z>max+roadWidth/2)continue;
    cylinder(root,'Poste de luz',x,3.1,z,.075,5.9,'#424c53');
    box(root,'Braço poste',x+.44,5.97,z,.9,.12,.12,'#424c53');
    box(root,'Luminária',x+.83,5.91,z,.48,.16,.35,night?'#ffe0a0':'#e7dfca',night?'glow':'');
    if(night&&i%2===0) {
      const light=new THREE.PointLight('#f9dda7',5.4,11,2);
      light.position.set(x+.83,5.85,z);scene.add(light);
    }
  }
  // Interseções têm sinalização real, sem faixa invertida.
  for(let k=1;k<N;k++){
    const x=roadNodes[k], z=roadNodes[k];
    cylinder(root,'Sinalização vertical',x+4.7,1.7,z+4.75,.07,3.1,'#56626b');
    box(root,'Semáforo',x+4.7,3.15,z+4.75,.32,.85,.35,'#2d333a');
    for(const [offset,color] of [[.24,'#b94e46'],[0,'#e5ad55'],[-.24,'#508964']])sphere(root,'Luz semáforo',x+4.7,3.15+offset,z+4.95,.075,color);
  }

  function car(x,z,color,dir='x',offset=0){
    const group=new THREE.Group();group.name='Tráfego';
    box(group,'Carroceria',0,.74,0,2.4,.64,1.28,color);
    box(group,'Cabine',-.16,1.23,0,1.35,.56,1.14,p.glass,'glass');
    for(const wx of [-.83,.83])for(const wz of [-.69,.69]){
      const wheel=mesh(group,'Roda',geom('CylinderGeometry',.25,.25,.17,12),getMat('#272c32'),[wx,.37,wz],[1,1,1],[Math.PI/2,0,0]);
      wheel.castShadow=true;
    }
    box(group,'Farol',1.21,.80,.48,.04,.11,.20,'#f7e3af',night?'glow':'');
    box(group,'Farol',1.21,.80,-.48,.04,.11,.20,'#f7e3af',night?'glow':'');
    group.position.set(x,.05,z);
    if(dir==='z')group.rotation.y=-Math.PI/2;
    root.add(group);
    cars.push({group,dir,z,x,offset});
    stats.cars++;
  }
  const carCount=spec.noCars || spec.pedestrianOnly ? 0 : Number.isInteger(spec.requestedCars) ?
    Math.min(25,Math.max(0,spec.requestedCars)) :
    spec.traffic==='alto'?Math.min(14,5+N*2):spec.traffic==='baixo'?Math.max(2,N-1):N+2;
  const colors=['#9a7b68','#71868b','#617b68','#a69b83','#7a7f91'];
  for(let i=0;i<carCount;i++){
    const row=roadNodes[i%(N+1)];
    const col=roadNodes[(i+1)%(N+1)];
    const direction=i%2===0?'x':'z';
    car(
      direction==='x'?(min+5+((i*9)%Math.max(8,max-min-10))):col+(i%3===0?1.6:-1.6),
      direction==='x'?row+(i%3===0?1.6:-1.6):(min+5+((i*8)%Math.max(8,max-min-10))),
      colors[i%colors.length],direction,i*11.5
    );
  }

  function pedestrian(x,z,color,role='walking',index=0){
    const g=new THREE.Group();g.name='Pedestre';
    g.position.set(x,.4,z);
    const body=new THREE.Group();body.name='Corpo';g.add(body);
    box(body,'Tronco',0,1.01,0,.47,.72,.34,color);
    sphere(body,'Cabeça',0,1.66,0,.23,'#e2baa2');
    sphere(body,'Cabelo',0,1.82,-.03,.22,'#37353b',[1,.48,1]);
    const arms=[],legs=[];
    for(const side of [-1,1]){
      const arm=new THREE.Group();arm.position.set(side*.28,1.31,0);
      box(arm,'Braço',0,-.21,0,.14,.48,.16,color);
      body.add(arm);arms.push(arm);
      const leg=new THREE.Group();leg.position.set(side*.13,.67,0);
      box(leg,'Perna',0,-.30,0,.18,.60,.21,'#3b3c48');
      box(leg,'Sapato',0,-.61,.07,.22,.12,.35,'#242731');
      body.add(leg);legs.push(leg);
    }
    root.add(g);pedestrians.push({g,arms,legs,x,z,role,index});
    stats.pedestrians++;
  }
  const pedCount=spec.noPeople ? 0 : Number.isInteger(spec.requestedPeople) ?
    Math.min(25,Math.max(0,spec.requestedPeople)) :
    spec.density==='alta'?Math.min(13,N*3):spec.density==='baixa'?Math.max(2,N):Math.min(9,N*2);
  for(let i=0;i<pedCount;i++){
    const alongX=i%3!==0, road=roadNodes[(i+1)%(N+1)];
    const side=(i%2===0?1:-1);
    const x=alongX?min+roadWidth/2+3+rand()*(max-min-roadWidth-6):road+side*(roadWidth/2+1.3);
    const z=alongX?road+side*(roadWidth/2+1.3):min+roadWidth/2+3+rand()*(max-min-roadWidth-6);
    pedestrian(x,z,['#657986','#aa7d6c','#72795c','#806b85'][i%4],alongX?'sidewalkX':'sidewalkZ',i);
  }

  function update(seconds){
    const t=Number(seconds)||0;
    const span=max-min-roadWidth;
    for(const [i,carObj] of cars.entries()){
      const f=((t*(spec.traffic==='alto'?2.1:1.45)+carObj.offset)%span+span)%span;
      if(carObj.dir==='x')carObj.group.position.x=min+roadWidth/2+f;
      else carObj.group.position.z=min+roadWidth/2+f;
      carObj.group.rotation.y=carObj.dir==='x'?0:-Math.PI/2;
    }
    for(const person of pedestrians){
      const t0=t*.46+person.index*2.1;
      const range=3.3;
      const folded=((t0%(range*2))+(range*2))%(range*2);
      const pos=folded<range?folded:2*range-folded;
      const dir=folded<range?1:-1;
      if(person.role==='sidewalkX'){
        person.g.position.x=clamp(person.x-range/2+pos,min+5,max-5);
        person.g.rotation.y=dir>0?Math.PI/2:-Math.PI/2;
      }else{
        person.g.position.z=clamp(person.z-range/2+pos,min+5,max-5);
        person.g.rotation.y=dir>0?0:Math.PI;
      }
      person.g.position.y=.40+Math.abs(Math.sin(t0*6.4))*.045;
      person.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(t0*6.4+i*Math.PI)*.35);
      person.arms.forEach((arm,i)=>arm.rotation.x=Math.sin(t0*6.4+(i+1)*Math.PI)*.25);
    }
  }
  update(0);

  if(wet){
    // Reflexos discretos dentro dos limites das ruas (não luzes neon).
    for(const z of roadNodes)for(let i=0;i<N;i++){
      const x=(roadNodes[i]+roadNodes[i+1])/2;
      box(root,'Asfalto molhado',x,.095,z+1.9,spacing*.51,.013,.48,'#5c6d76','glass');
    }
  }
  const footprint={width:total,depth:total,height:spec.height==='alto'?23:16};
  function dispose(){
    for(const geo of shapes.values())geo.dispose();
    for(const mat of materials.values())mat.dispose();
    for(const texture of labelMaterialCache)texture.dispose();
    for(const item of dynamic)if(item.material)item.material.dispose();
  }
  return {root,scene,stats,footprint,update,dispose,center:new THREE.Vector3(0,1.1,0),spec};
}
