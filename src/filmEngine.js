import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { shotAt } from './filmSchema';

const PI2 = Math.PI * 2;
const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .8, metalness: 0.04, ...options });

export async function createFilmEngine(outputCanvas, film, assets) {
  if (!outputCanvas || !outputCanvas.getContext('2d')) throw new Error('Não foi possível abrir o editor gráfico.');
  const scene = new THREE.Scene();
  const isNight = film.mood === 'noite';
  scene.background = new THREE.Color(isNight ? 0x111c31 : film.mood === 'tarde' ? 0xa0a9b4 : 0xb9cdd6);
  scene.fog = new THREE.Fog(scene.background, 28, 82);
  const camera = new THREE.PerspectiveCamera(38, 9 / 16, 0.1, 150);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isNight ? 1.5 : 1.2;
  } catch (error) { throw new Error('Este navegador não conseguiu iniciar o WebGL. ' + error.message); }
  renderer.setPixelRatio(1);
  const ctx = outputCanvas.getContext('2d', { alpha: false });
  const geometries = [];
  const materials = [];
  const animated = [];
  const carModels = [];
  const hero = new THREE.Group();
  let loadedModel = null;
  let worldWidth = 27;
  let worldHeight = 17;
  let currentWidth = 0;
  let currentHeight = 0;

  const mat = (color, opts = {}) => { const result = material(color, opts); materials.push(result); return result; };
  function geom(type, ...args) { const shape = new THREE[type](...args); geometries.push(shape); return shape; }
  function addBox(parent, name, w, h, d, x, y, z, color, opts = {}) {
    const mesh = new THREE.Mesh(geom('BoxGeometry', w, h, d), mat(color, opts));
    mesh.position.set(x, y, z); mesh.castShadow = h > .15; mesh.receiveShadow = true; mesh.name = name;
    parent.add(mesh); return mesh;
  }
  function addCylinder(parent, name, top, bot, h, x, y, z, color, opts = {}) {
    const mesh = new THREE.Mesh(geom('CylinderGeometry', top, bot, h, 28), mat(color, opts));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = name; parent.add(mesh); return mesh;
  }
  function addSphere(parent, name, r, x, y, z, color, opts = {}, scale = [1, 1, 1]) {
    const mesh = new THREE.Mesh(geom('SphereGeometry', r, 24, 16), mat(color, opts));
    mesh.position.set(x, y, z); mesh.scale.set(...scale); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  function signTexture(text, bg = '#191e2c', fg = '#f7e1b8') {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 192;
    const context = canvas.getContext('2d');
    context.fillStyle = bg; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = fg; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = '800 70px system-ui, Arial'; context.fillText(String(text).slice(0, 20), 384, 97, 715);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    materials.push({ dispose: () => texture.dispose() }); return texture;
  }

  scene.add(new THREE.HemisphereLight(isNight ? 0x91a8cf : 0xf7e8d2, 0x596778, isNight ? 1.65 : 2.5));
  const sunlight = new THREE.DirectionalLight(isNight ? 0x9aaedc : 0xffe4bb, isNight ? 2.2 : 3.5);
  sunlight.position.set(-14, 22, 16); sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = -34; sunlight.shadow.camera.right = 34;
  sunlight.shadow.camera.top = 34; sunlight.shadow.camera.bottom = -34;
  sunlight.shadow.camera.near = 0.1; sunlight.shadow.camera.far = 80;
  sunlight.shadow.bias = -0.0003; scene.add(sunlight);
  const fill = new THREE.DirectionalLight(0xa2ccf5, .6); fill.position.set(15, 12, -14); scene.add(fill);

  function createPerson(x, z, color, scale = 1, role = 'pedestre', options = {}) {
    // O papel de cada figurante determina percurso, postura e comportamento.
    // Nenhum personagem de fundo fica olhando fixamente para o expositor.
    const group = new THREE.Group();
    group.position.set(x, 0.12, z);
    group.scale.setScalar(scale);
    addCylinder(group, 'torso', .34, .29, .95, 0, 1.18, 0, color);
    addSphere(group, 'cabeca', .32, 0, 2.02, 0, '#eac6a8', { roughness: .85 });
    addSphere(group, 'cabelo', .315, 0, 2.24, -.04, '#343239', {}, [1, .44, 1]);
    addSphere(group, 'olho-esquerdo', .029, -.12, 2.04, .294, '#24232a');
    addSphere(group, 'olho-direito', .029, .12, 2.04, .294, '#24232a');

    const arms = [new THREE.Group(), new THREE.Group()];
    for (const [index, arm] of arms.entries()) {
      arm.position.set(index ? .39 : -.39, 1.53, 0);
      addCylinder(arm, 'braco', .12, .09, .78, 0, -.32, 0, color);
      addSphere(arm, 'mao', .125, 0, -.75, 0, '#ecc7a9');
      group.add(arm);
    }

    const legs = [new THREE.Group(), new THREE.Group()];
    const knees = [];
    for (const [index, leg] of legs.entries()) {
      leg.position.set(index ? .17 : -.17, .77, 0);
      addCylinder(leg, 'coxa', .15, .115, .43, 0, -.22, 0, '#343843');
      const knee = new THREE.Group();
      knee.position.y = -.44;
      addCylinder(knee, 'canela', .12, .1, .43, 0, -.21, 0, '#343843');
      addBox(knee, 'sapato', .26, .16, .39, 0, -.48, .12, '#28262e');
      leg.add(knee);
      knees.push(knee);
      group.add(leg);
    }
    group.userData = {
      arms, legs, knees, x, z, role,
      offset: options.offset || 0,
      facing: options.facing || 0,
    };
    scene.add(group);
    animated.push(group);
    return group;
  }

  function createBurger(parent, x, y, z, scale = 1) {
    const group = new THREE.Group(); group.position.set(x, y, z); group.scale.setScalar(scale);
    addCylinder(group, 'pao-inferior', .83, .79, .23, 0, .1, 0, '#c98538');
    addCylinder(group, 'carne', .86, .87, .24, 0, .3, 0, '#4b281e');
    addBox(group, 'queijo', 1.52, .045, 1.53, 0, .46, 0, '#f8bb41', { roughness: .65 });
    addCylinder(group, 'carne-superior', .84, .86, .19, 0, .57, 0, '#4a2921');
    addCylinder(group, 'pao-superior', .83, .84, .23, 0, .76, 0, '#daa14f');
    addSphere(group, 'coroa-do-pao', .81, 0, .86, 0, '#e4ac61', {}, [1, .4, 1]);
    parent.add(group); return group;
  }

  function streetWorld() {
    // Eixos coerentes: fachadas em Z negativo, rua em Z positivo,
    // cruzamento atravessando Z; faixa central da rua segue o eixo X.
    addBox(scene, 'terreno', 120, .4, 100, 0, -.27, 0, '#8e9a94');
    addBox(scene, 'asfalto', 105, .045, 7.8, 0, .01, 3.7, '#353c45');
    addBox(scene, 'calcada-lojas', 105, .26, 5.6, 0, .13, -2.97, '#c4c0b5');
    addBox(scene, 'calcada-oposta', 105, .23, 5.4, 0, .13, 10.3, '#bdbdb5');
    addBox(scene, 'meio-fio', 105, .22, .17, 0, .16, -.1, '#f1ece1');
    addBox(scene, 'meio-fio-oposto', 105, .22, .17, 0, .14, 7.85, '#f1ece1');
    for (let x = -47; x < 50; x += 4.2) {
      if (x > -10 && x < -6) continue;
      addBox(scene, 'divisoria-amarela', 2.1, .016, .085, x, .05, 3.85, '#e5c45a', { roughness: 1 });
    }
    for (let z = .65; z < 7.5; z += .64) addBox(scene, 'faixa-pedestre', 3.1, .022, .35, -8.4, .055, z, '#eeeae0', { roughness: 1 });
    addBox(scene, 'linha-parada', .14, .023, 7.5, -11.15, .055, 3.7, '#e5e1d7');
    // Construções têm portas no mesmo pavimento da calçada, janelas e placas legíveis.
    const structures = [
      { x: 0, w: 12, h: 7.8, title: film.scene === 'cidade' ? 'CENTRO URBANO' : 'LA BURGER', main: '#8f6551', sign: '#1e232b', trim: '#dc9446' },
      { x: -15.3, w: 14, h: 11.3, title: 'CAFE CENTRAL', main: '#a7a59a', sign: '#384149', trim: '#cad9df' },
      { x: 16.6, w: 14.8, h: 9.5, title: 'COMERCIO', main: '#657b82', sign: '#192f38', trim: '#aed9ce' },
    ];
    for (const b of structures) {
      const depth = 7.1, front = -6.15;
      addBox(scene, b.title + '-estrutura', b.w, b.h, depth, b.x, b.h / 2 + .24, front - depth / 2, b.main);
      addBox(scene, b.title + '-rodape', b.w + .1, .32, .42, b.x, .4, front + .13, b.trim);
      addBox(scene, b.title + '-marquise', b.w + .9, .26, 1.45, b.x, 3.8, front + .65, b.trim);
      const sig = new THREE.Mesh(geom('PlaneGeometry', b.w * .7, 1.28),
        new THREE.MeshBasicMaterial({ map: signTexture(b.title, b.sign), side: THREE.DoubleSide }));
      materials.push(sig.material); sig.position.set(b.x, 4.62, front + .04); scene.add(sig);
      const glass = mat('#47717f', { metalness: .35, roughness: .25 });
      for (const xx of [-3.6, 3.6]) {
        const panel = new THREE.Mesh(geom('BoxGeometry', 3.1, 2.48, .09), glass);
        panel.position.set(b.x + xx, 2.05, front + .09); scene.add(panel);
        addBox(scene, 'moldura-vertical', .1, 2.52, .17, b.x + xx, 2.05, front + .15, '#d3c2ae');
      }
      addBox(scene, 'porta-de-entrada', 1.8, 3, .14, b.x, 1.76, front + .14, '#3a3637');
      addBox(scene, 'vidro-porta', 1.39, 2.23, .16, b.x, 1.95, front + .23, '#41606d', { metalness: .4, roughness: .22 });
      addBox(scene, 'puxador', .045, .42, .09, b.x + .51, 1.82, front + .34, '#e6cb94');
      for (let floor = 1; floor < Math.floor(b.h / 3); floor++) {
        for (const offset of [-3.5, 0, 3.5]) {
          addBox(scene, 'janela-superior', 1.7, 1.1, .08, b.x + offset, 4.8 + floor * 2, front + .05, '#74939d', { metalness: .18, roughness: .35 });
        }
      }
    }
    // Banco urbano e árvores: sem objetos flutuando ou enterrados.
    for (const x of [-25, 25]) {
      addCylinder(scene, 'tronco', .2, .24, 3.1, x, 1.65, -2.6, '#685046');
      addSphere(scene, 'copa', 2.05, x, 4.5, -2.6, '#657e62', {}, [1.08, .85, 1]);
      addBox(scene, 'banco-assento', 2, .15, .57, x + 3.4, .6, -2.45, '#806958');
      for (const shift of [-.75, .75]) addBox(scene, 'banco-pe', .15, .55, .43, x + 3.4 + shift, .31, -2.45, '#34393c');
    }
    for (const x of [-21, 12.4]) {
      addCylinder(scene, 'poste', .065, .095, 5.9, x, 3.15, -1.0, '#444951');
      addBox(scene, 'luminaria', 1.15, .2, .38, x + .46, 6.06, -1, '#2d333c');
      if (isNight) {
        const lamp = new THREE.PointLight(0xffd493, 18, 11, 2);
        lamp.position.set(x + .47, 5.83, -1); scene.add(lamp);
      }
    }
    // Elenco enxuto, com papéis próprios. Uma fila pequena faz sentido na narrativa,
    // mas as pessoas esperam a vez e se movem, sem encarar o hambúrguer do cenário.
    createPerson(-3.8, -3.6, '#c37a48', 1, 'cliente');
    createPerson(2.3, -3.95, '#566a7c', .84, 'fila', { offset: .5, facing: Math.PI });
    createPerson(3.55, -4.1, '#a87855', .81, 'fila', { offset: 2.1, facing: Math.PI });
    createPerson(-17, -1.38, '#3e738d', .9, 'calçada', { offset: .7 });
    createPerson(15.5, 9.1, '#7e6c88', .85, 'calçada-oposta', { offset: 1.2 });
    createPerson(-8.4, .55, '#5b746a', .9, 'faixa', { offset: 1.1 });
    // Banco existente no cenário, altura do quadril alinhada com o assento.
    createPerson(-21.6, -2.45, '#8b6d6e', .86, 'banco', { offset: 1.6, facing: .18 });
    // Tráfego em faixas opostas.
    function vehicle(x, z, color, direction) {
      const group = new THREE.Group();
      addBox(group, 'carro-chassi', 3.1, .8, 1.52, 0, .78, 0, color, { roughness: .45 });
      addBox(group, 'carro-cabine', 1.7, .75, 1.34, -.12, 1.44, 0, '#647f90', { metalness: .4, roughness: .28 });
      for (const wx of [-1.0, 1.0]) for (const wz of [-.78, .78]) {
        const tire = new THREE.Mesh(geom('CylinderGeometry', .37, .37, .2, 16), mat('#272a32'));
        tire.rotation.x = PI2 / 4; tire.position.set(wx, .39, wz); tire.castShadow = true; group.add(tire);
      }
      for (const zEnd of [-.55, .55]) addBox(group, 'luz-dianteira', .05, .12, .21, 1.55, .9, zEnd, '#ffe3b0', { emissive: '#ffe3b0', emissiveIntensity: .3 });
      group.position.set(x, .05, z); group.rotation.y = direction < 0 ? Math.PI : 0; scene.add(group);
      carModels.push({ group, x, z, direction });
    }
    vehicle(-10, 2.25, '#748d93', 1); vehicle(17, 5.5, '#bf8067', -1);
    const pedestal = addCylinder(scene, 'expositor', 1.18, 1.2, .44, 0, .37, -3.8, '#33333c');
    const displayBurger = createBurger(hero, 0, .7, -3.8, 1.15);
    scene.add(hero);
    return displayBurger;
  }

  function studioWorld() {
    // Estúdio fotográfico com piso contínuo, luzes e produto em destaque.
    addBox(scene, 'piso-estudio', 90, .35, 70, 0, -.24, 0, '#333642');
    addBox(scene, 'ciclorama', 90, 31, .3, 0, 15, -14, '#4b5059', { roughness: .94 });
    addBox(scene, 'painel-lateral', 10, 20, 60, -22, 10, -3, '#222934');
    addBox(scene, 'painel-direito', 10, 20, 60, 22, 10, -3, '#222934');
    const strip = material(film.accent, { emissive: film.accent, emissiveIntensity: .65, roughness: .35 });
    materials.push(strip);
    const lightBar = new THREE.Mesh(geom('BoxGeometry', 13, .12, .12), strip);
    lightBar.position.set(0, 8, -13.7); scene.add(lightBar);
    const podium = addCylinder(scene, 'pedestal-produto', 2.05, 2.05, 1.25, 0, .63, -3.8, '#24262d', { metalness: .3 });
    addCylinder(scene, 'aro-dourado', 2.04, 2.04, .065, 0, 1.30, -3.8, film.accent);
    const spot = new THREE.SpotLight(0xffffff, 48, 30, Math.PI / 6, .25, 1.1);
    spot.position.set(5, 14, 1); spot.target.position.set(0, 1, -3.8);
    spot.castShadow = true; spot.shadow.mapSize.set(512, 512);
    scene.add(spot); scene.add(spot.target);
    const back = new THREE.PointLight(film.accent, 20, 16);
    back.position.set(-4, 5, -8); scene.add(back);
    const featured = createBurger(hero, 0, 1.44, -3.8, 1.7);
    scene.add(hero);
    if (film.title.toLowerCase().includes('personagem')) createPerson(3.2, -3.5, '#525e70', .9, 'cliente');
    return featured;
  }

  let productMesh = null;
  let assetError = '';
  if (film.modelAssetId) {
    const model = assets.find((item) => item.id === film.modelAssetId);
    if (!model?.blob || !/\.glb$/i.test(model.name)) {
      assetError = 'O modelo escolhido não está disponível em GLB no navegador.';
    } else {
      try {
        const loader = new GLTFLoader();
        const bytes = await model.blob.arrayBuffer();
        const gltf = await loader.parseAsync(bytes, '');
        loadedModel = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(loadedModel);
        const size = bounds.getSize(new THREE.Vector3());
        if (Math.max(size.x, size.y, size.z) < .001) throw new Error('Modelo sem geometria utilizável.');
        const scale = 23 / Math.max(size.x, size.y, size.z);
        loadedModel.scale.setScalar(scale);
        const scaled = new THREE.Box3().setFromObject(loadedModel);
        const center = scaled.getCenter(new THREE.Vector3());
        loadedModel.position.sub(new THREE.Vector3(center.x, scaled.min.y, center.z));
        loadedModel.traverse((obj) => { if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; } });
        scene.add(loadedModel);
        const sphere = new THREE.Box3().setFromObject(loadedModel).getSize(new THREE.Vector3());
        worldWidth = Math.max(10, sphere.x);
        worldHeight = Math.max(8, sphere.z);
        addBox(scene, 'chao-modelo', 110, .1, 110, 0, -.2, 0, '#8f9994');
      } catch (error) {
        assetError = 'Não foi possível carregar GLB: ' + error.message;
      }
    }
  } else {
    productMesh = film.scene === 'estudio' ? studioWorld() : streetWorld();
  }
  if (assetError) {
    renderer.dispose();
    throw new Error(assetError);
  }

  const SHOTS_CITY = {
    abertura: { pos: [-15, 14, 20], target: [0, 3.6, -5], fov: 36 },
    rua: { pos: [-8.5, 3.1, 7.7], target: [2, 2.6, -5.5], fov: 39 },
    fachada: { pos: [3.6, 5.1, 4.4], target: [1.2, 3.2, -6.5], fov: 38 },
    personagem: { pos: [-5, 3.5, .35], target: [-3.1, 1.6, -3.7], fov: 35 },
    produto: { pos: [2.8, 2.5, 1.4], target: [.1, 1.18, -3.8], fov: 28 },
    alto: { pos: [-1, 22, 11], target: [-1, .3, -3.9], fov: 38 },
    travelling: { pos: [-20, 6.5, 8.4], target: [0, 3.7, -5.7], fov: 37 },
  };
  const SHOTS_MODEL = {
    abertura: { pos: [24, 20, 25], target: [0, 3, 0], fov: 40 },
    rua: { pos: [-20, 10, 16], target: [0, 2, 0], fov: 42 },
    fachada: { pos: [13, 9, 18], target: [0, 3, 0], fov: 38 },
    personagem: { pos: [9, 6, 9], target: [0, 2, 0], fov: 34 },
    produto: { pos: [6, 4.5, 7], target: [0, 2, 0], fov: 34 },
    alto: { pos: [-4, 26, 4], target: [0, 0, 0], fov: 38 },
    travelling: { pos: [-17, 8, 18], target: [0, 3, 0], fov: 42 },
  };

  function resize(w, h) {
    const width = Math.max(200, Math.min(1920, Math.round(w)));
    const height = Math.max(200, Math.min(1920, Math.round(h)));
    if (width === currentWidth && height === currentHeight) return;
    currentWidth = width; currentHeight = height;
    outputCanvas.width = width; outputCanvas.height = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
  }

  function render(t) {
    if (!currentWidth) resize(film.format === '16:9' ? 960 : film.format === '1:1' ? 640 : 540,
      film.format === '16:9' ? 540 : film.format === '1:1' ? 640 : 960);
    const time = Math.max(0, Math.min(film.duration, Number(t) || 0));
    const { shot, index, local } = shotAt(film, time);
    const presets = loadedModel ? SHOTS_MODEL : SHOTS_CITY;
    const preset = presets[shot.camera] || presets.abertura;
    const movement = shot.move * smooth(local);
    const pos = [...preset.pos], target = [...preset.target];
    if (shot.camera === 'travelling') pos[0] += movement * 13;
    else if (shot.camera === 'alto') { pos[0] += movement * 4; pos[2] -= movement * 6; }
    else { pos[0] += movement * 2.5; pos[2] -= movement * 3.5; }
    if (shot.camera === 'personagem' && !loadedModel) { target[0] += Math.sin(time * 1.2) * .12; }
    camera.position.set(...pos);
    camera.lookAt(...target);
    camera.fov = preset.fov; camera.updateProjectionMatrix();
    if (!loadedModel) {
      // Percursos contínuos, com velocidade real. Direção e braços acompanham
      // as pernas; o personagem atravessa na faixa, não no meio do asfalto.
      const walkPath = (start, end, speed, offset = 0) => {
        const length = end - start;
        const cycle = length * 2;
        const distance = ((time * speed + offset) % cycle + cycle) % cycle;
        const goingForward = distance < length;
        return {
          coordinate: goingForward ? start + distance : end - (distance - length),
          direction: goingForward ? 1 : -1,
        };
      };
      const animateWalk = (person, localTime, speed, intensity = 1) => {
        const { arms, legs, knees } = person.userData;
        const swing = localTime * speed * 3.4;
        person.position.y = .12 + Math.abs(Math.sin(swing)) * .036 * intensity;
        legs.forEach((leg, i) => {
          leg.rotation.x = Math.sin(swing + i * Math.PI) * .48 * intensity;
          knees[i].rotation.x = Math.max(0, Math.sin(swing + i * Math.PI)) * .25 * intensity;
        });
        arms.forEach((arm, i) => {
          arm.rotation.x = Math.sin(swing + (1 - i) * Math.PI) * .31 * intensity;
          arm.rotation.z = (i ? -.035 : .035);
        });
      };
      for (const person of animated) {
        const { arms, legs, knees, x, z, role, offset, facing } = person.userData;
        person.position.set(x, .12, z);
        person.rotation.set(0, facing, 0);
        arms.forEach(arm => { arm.rotation.x = -.07; arm.rotation.z = 0; });
        legs.forEach((leg, i) => { leg.rotation.x = 0; knees[i].rotation.x = 0; });

        if (role === 'banco') {
          // Coxas à frente, panturrilhas para baixo; gestos discretos das mãos.
          person.position.y = -.10 + Math.sin(time * .85 + offset) * .008;
          legs.forEach((leg, i) => {
            leg.rotation.x = -1.25 + (i ? .07 : -.07);
            knees[i].rotation.x = 1.20;
          });
          arms[0].rotation.x = -.43 + Math.sin(time * .9 + offset) * .055;
          arms[1].rotation.x = -.25 + Math.sin(time * .7 + offset) * .035;
          continue;
        }
        if (role === 'fila') {
          person.rotation.y = Math.PI + Math.sin(time * .4 + offset) * .11;
          person.position.x += Math.sin(time * .65 + offset) * .07;
          person.position.y += Math.sin(time * 1.7 + offset) * .013;
          arms[0].rotation.x = -.25 + Math.sin(time * .85 + offset) * .13;
          arms[1].rotation.x = -.36;
          if (Math.sin(time * .27 + offset) > .5) arms[1].rotation.x = -.95;
          continue;
        }
        if (role === 'calçada' || role === 'calçada-oposta') {
          const far = role === 'calçada-oposta';
          const path = far
            ? walkPath(10.1, 22.1, 1.14, offset * 3)
            : walkPath(-18.4, -11.6, 1.22, offset * 3);
          person.position.x = path.coordinate;
          person.rotation.y = path.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
          animateWalk(person, time + offset, far ? 1.14 : 1.22);
          continue;
        }
        if (role === 'faixa') {
          const path = walkPath(.55, 7.45, .78, offset);
          person.position.z = path.coordinate;
          person.rotation.y = path.direction > 0 ? 0 : Math.PI;
          animateWalk(person, time + offset, .78, .9);
          continue;
        }
        // Personagem principal responde às ações do roteiro. Extras não copiam o gesto.
        if (role === 'cliente') {
          const moving = ['caminhar', 'correr', 'trafego'].includes(shot.action);
          if (moving) {
            person.position.x = x + Math.min(1.35, local * 1.35);
            person.rotation.y = Math.PI / 2;
            animateWalk(person, time, shot.action === 'correr' ? 2.15 : 1.0,
              shot.action === 'correr' ? 1.25 : .86);
          } else {
            person.rotation.y = -.25 + Math.sin(time * .45) * .12;
            person.position.y = .12 + Math.sin(time * 1.3) * .012;
            arms[0].rotation.x = -.1 + Math.sin(time * 1.1) * .06;
            if (shot.action === 'apontar') arms[1].rotation.x = -1.28;
            if (shot.action === 'celebrar') {
              arms[0].rotation.x = -2; arms[1].rotation.x = -2;
            }
          }
        }
      }
      for (const car of carModels) {
        car.group.position.x = car.x + Math.sin(time * .27 + (car.direction < 0 ? 2 : 0)) * 12;
      }
      if (productMesh) {
        const isHero = shot.camera === 'produto' || shot.action === 'produto';
        hero.position.y = isHero ? .09 + Math.sin(time * 2.2) * .12 : 0;
        hero.rotation.y = isHero ? Math.sin(time * .55) * .24 : 0;
      }
    } else {
      loadedModel.rotation.y = (shot.camera === 'produto' ? .08 : 0) * Math.sin(time * .35);
    }
    renderer.render(scene, camera);
    ctx.clearRect(0, 0, currentWidth, currentHeight);
    ctx.drawImage(renderer.domElement, 0, 0, currentWidth, currentHeight);
    drawOverlay(ctx, film, shot, index, local, currentWidth, currentHeight);
    return { shot, index, local };
  }

  function dispose() {
    for (const geometry of geometries) geometry.dispose();
    for (const entry of materials) entry.dispose();
    if (loadedModel) {
      loadedModel.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry?.dispose();
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach((m) => { if (m) m.dispose(); });
      });
    }
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return { render, resize, dispose, error: assetError, canvas: outputCanvas };
}

function drawOverlay(ctx, film, shot, index, local, width, height) {
  const base = Math.min(width, height);
  const vertical = height > width;
  const pad = width * .075;
  const ease = smooth(Math.min(local * 9, (1 - local) * 9, 1));
  const fade = Math.min(1, Math.max(0, ease));
  ctx.save();
  const grad = ctx.createLinearGradient(0, height * .55, 0, height);
  grad.addColorStop(0, 'rgba(5,8,14,0)');
  grad.addColorStop(1, 'rgba(5,8,14,0.79)');
  ctx.fillStyle = grad; ctx.fillRect(0, height * .5, width, height * .5);
  const top = ctx.createLinearGradient(0, 0, 0, height * .26);
  top.addColorStop(0, 'rgba(5,8,14,0.55)');
  top.addColorStop(1, 'rgba(5,8,14,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, width, height * .3);
  ctx.fillStyle = '#ffffffc4'; ctx.textBaseline = 'top';
  ctx.font = `700 ${Math.max(11, Math.floor(base * .026))}px system-ui, sans-serif`;
  ctx.textAlign = 'left'; ctx.fillText('VITOR PRODUCTIONS', pad, height * .045);
  ctx.fillStyle = film.accent; ctx.fillRect(pad, height * .078, Math.max(28, base * .075), Math.max(2, base * .005));
  if (shot.text) {
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000b'; ctx.shadowBlur = base * .04;
    const fs = Math.round(base * (vertical ? .079 : .065));
    ctx.font = `900 ${fs}px system-ui, Arial, sans-serif`;
    const lines = wrapText(ctx, shot.text, width * .81, 3);
    const spacing = fs * 1.05;
    lines.forEach((line, i) => ctx.fillText(line, width / 2, height * (vertical ? .83 : .80) + (i - (lines.length - 1) / 2) * spacing));
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff88';
  ctx.font = `500 ${Math.max(11, Math.round(base * .02))}px system-ui`;
  ctx.textAlign = 'right'; ctx.fillText(String(index + 1).padStart(2, '0') + ' / ' + String(film.shots.length).padStart(2, '0'), width - pad, height * .07);
  ctx.restore();
}

function wrapText(ctx, text, maxWidth, maxLines = 3) {
  const words = text.trim().split(/\s+/);
  const lines = []; let current = '';
  for (const word of words) {
    const draft = current ? current + ' ' + word : word;
    if (ctx.measureText(draft).width > maxWidth && current) {
      lines.push(current); current = word;
      if (lines.length >= maxLines - 1) break;
    } else current = draft;
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}
