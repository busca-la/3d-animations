// Compilador de descrições em português para um plano urbano tridimensional.
// A versão 1 é um sistema simbólico, determinístico e local: não finge ser um LLM.
export const CITY_PRESETS = [
  { id: 'comercial', label: 'Centro comercial', text: 'Cidade comercial moderna, com hamburgueria na esquina, lojas, avenida principal, árvores, carros e pedestres durante a tarde.' },
  { id: 'bairro', label: 'Bairro residencial', text: 'Bairro residencial tranquilo de dia, casas baixas com jardins, parque, árvores, calçadas, bicicletas e trânsito leve.' },
  { id: 'noite', label: 'Centro à noite', text: 'Cidade noturna comercial, prédios altos, rua iluminada, cafeterias, cinema e tráfego moderado, cores discretas.' },
  { id: 'industrial', label: 'Distrito industrial', text: 'Distrito industrial moderno, galpões e fábricas, grandes avenidas, estacionamento, caminhões e poucas pessoas.' },
  { id: 'chuvosa', label: 'Cidade com chuva', text: 'Centro urbano chuvoso no fim de tarde, lojas, prédios médios, asfalto molhado, neblina leve e iluminação quente.' },
];

const normalize = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const matches = (text, regex) => regex.test(text);
const hash = text => { let h = 2166136261; for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const dictionary = [
  ['hamburgueria', /hamburg|burger|lanchonete|fast food/],
  ['cafeteria', /cafeteria|cafe|coffee/],
  ['padaria', /padaria|pao|bakery/],
  ['mercado', /mercado|supermercado|mercearia|mercadinho/],
  ['restaurante', /restaurante|pizzaria|comida/],
  ['cinema', /cinema|teatro/],
  ['farmacia', /farmacia|drogaria/],
  ['loja', /lojas|loja|comercio|shopping|vitrine/],
];

export function interpretCityPrompt(rawPrompt, overrides = {}) {
  const prompt = String(rawPrompt || '').trim().slice(0, 1500);
  const text = normalize(prompt);
  if (text.length < 8) throw new Error('Descreva sua cidade em pelo menos oito caracteres.');

  const commercial = matches(text, /comercial|centro|avenida|loja|hamburg|shopping|restaurante|cafeteria/);
  const residential = matches(text, /residencial|bairro|casas|casinha|jardim|suburb|vila/);
  const industrial = matches(text, /industrial|fabrica|galpao|armazem|deposito/);
  const futuristic = matches(text, /futurist|cyberpunk|futur|neon|tecnolog|sci.fi/);
  const retro = matches(text, /retro|antig|vintage|histor|colonial/);
  const district = industrial ? 'industrial' : residential && !commercial ? 'residencial' : 'comercial';
  const style = futuristic ? 'futurista' : retro ? 'retro' : 'moderno';
  const night = matches(text, /noturn|noite|madrugada|escuro/);
  const dusk = matches(text, /tarde|por do sol|anoitecer|entardecer|golden hour/);
  const time = night ? 'noite' : dusk ? 'tarde' : 'dia';
  const rain = matches(text, /chuv|garoa|molhad|tempestade/);
  const fog = matches(text, /nevo|neblina|cerra/);
  const weather = rain ? 'chuva' : fog ? 'neblina' : 'limpo';
  const tall = matches(text, /arranha|alto[s ]|predios altos|edificios altos|torre[s ]/);
  const low = matches(text, /baixos|casas baixas|predios pequenos|baixa altura/);
  const height = low ? 'baixo' : tall ? 'alto' : 'medio';
  const dense = matches(text, /muitos predios|muita gente|lotad|denso|grande cidade|metropole|metropolitana/);
  const sparse = matches(text, /pequen|poucos predios|calm|vazio|tranquil|pouco movimento/);
  const density = dense ? 'alta' : sparse ? 'baixa' : 'media';
  const heavyTraffic = matches(text, /transito intenso|muitos carros|engarraf|movimentad|trafego intenso/);
  const lightTraffic = matches(text, /poucos carros|sem carros|sem transito|transito leve|trafego leve/);
  const traffic = heavyTraffic ? 'alto' : lightTraffic ? 'baixo' : 'medio';
  const park = matches(text, /parque|praca|jardim|pracinha|gramado|area verde/);
  const trees = !matches(text, /sem arvore|sem vegetacao/) && (matches(text, /arvor|parque|praca|vegetac|verde|jardim/) || district !== 'industrial');
  const sidewalks = !matches(text, /sem calcada/);
  const crossing = !matches(text, /sem faixa/);
  const colors = futuristic ? 'frio' : retro ? 'quente' : 'neutro';
  const buildings = [...text.matchAll(/(\d{1,2})\s*(?:predios|edificios|quarteiroes)/g)];
  const requestedBlocks = [...text.matchAll(/(\d)\s*quarteiroes?/g)][0]?.[1];
  const parsedBlocks = requestedBlocks ? Number(requestedBlocks) : dense ? 4 : sparse ? 2 : 3;
  const stores = dictionary.filter(([, re]) => re.test(text)).map(([name]) => name);
  if (!stores.length && district === 'comercial') stores.push('loja','cafeteria','hamburgueria');
  if (!stores.length && district === 'industrial') stores.push('galpao');
  const defaultFocal = stores.includes('hamburgueria') ? 'hamburgueria' : stores[0] || 'loja';
  const featureLabels = [
    district === 'industrial' ? 'Distrito industrial' : district === 'residencial' ? 'Bairro residencial' : 'Zona comercial',
    style === 'futurista' ? 'Arquitetura futurista' : style === 'retro' ? 'Arquitetura retrô' : 'Arquitetura moderna',
    time === 'noite' ? 'Iluminação noturna' : time === 'tarde' ? 'Luz de fim de tarde' : 'Luz diurna',
    weather === 'chuva' ? 'Asfalto molhado' : weather === 'neblina' ? 'Névoa leve' : null,
    park ? 'Praça com banco' : null,
    trees ? 'Árvores' : null,
    crossing ? 'Faixas de pedestre' : null,
    ...stores.map(v => 'Fachadas: ' + v),
  ].filter(Boolean);

  const pick = (key, allowed, initial) => allowed.includes(overrides[key]) ? overrides[key] : initial;
  const blockCount = Math.min(4, Math.max(2, Number(overrides.blocks || parsedBlocks) || 3));
  return {
    version: 1,
    prompt,
    seed: hash(text),
    district: pick('district',['comercial','residencial','industrial'],district),
    style: pick('style',['moderno','retro','futurista'],style),
    time: pick('time',['dia','tarde','noite'],time),
    weather: pick('weather',['limpo','chuva','neblina'],weather),
    density: pick('density',['baixa','media','alta'],density),
    height: pick('height',['baixo','medio','alto'],height),
    traffic: pick('traffic',['baixo','medio','alto'],traffic),
    blocks: blockCount,
    park: Boolean(park || overrides.park),
    trees, sidewalks, crossing,
    stores: stores.slice(0,7),
    focal: defaultFocal,
    colors,
    explanation: featureLabels,
    capacity: Math.min(16, blockCount * blockCount),
  };
}

export function cityName(spec) {
  const names = {comercial:'Centro Comercial', residencial:'Bairro Residencial',industrial:'Distrito Industrial'};
  const moments = {dia:'Diurno', tarde:'Fim de Tarde', noite:'Noturno'};
  return names[spec.district] + ' — ' + moments[spec.time];
}

export function sizeForPlan(spec) {
  return spec.blocks >= 4 ? 4 : spec.blocks <= 2 ? 2 : 3;
}
