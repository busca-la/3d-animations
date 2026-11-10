// Interpretador local de pedidos de vídeo. Não faz chamadas a IA externa nem consome créditos.
// Gera um roteiro estruturado para o motor real de animação/gravador do VP Studio.
import { sanitizeFilm } from './filmSchema.js';

const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const match = (value, regex) => regex.test(value);
const words = text => String(text || '').replace(/\s+/g, ' ').trim();

export function compileVideoPrompt(raw) {
  const text = words(raw).slice(0, 1800);
  if (text.length < 12) throw new Error('Descreva o que deve acontecer no vídeo em pelo menos 12 caracteres.');
  const n = norm(text);
  const restaurant = match(n, /hamburg|burger|lanchonete|restaurante|pizzaria|cafeteria|padaria|cliente|comercio|loja/);
  const urban = match(n, /cidade|rua|bairro|avenida|predio|edificio|praca|parque|transito|hospital|escola|carros|pedestres|cidadezinha|mercado/);
  const studio = match(n, /estudio|studio|produto isolado|fundo preto|fundo escuro|apresentacao de produto/);
  const scene = urban || (!restaurant && !studio) ? 'cidade' : studio ? 'estudio' : 'hamburgueria';
  const mood = match(n, /noite|noturn|madrugada|anoitecer/) ? 'noite' :
    match(n, /fim de tarde|entardecer|por do sol|golden hour|tarde/) ? 'tarde' : 'dia';
  const durationValue = n.match(/\b(\d{1,2})\s*(?:segundos?|segs?|s(?:ec)?)\b/);
  const duration = durationValue ? Math.max(6, Math.min(60, Number(durationValue[1]))) : 18;
  const format = match(n, /16\s*[:x]\s*9|horizontal|paisagem|youtube longo/) ? '16:9' :
    match(n, /1\s*[:x]\s*1|quadrado/) ? '1:1' : '9:16';
  const cuts = Math.min(7, Math.max(3, Math.round(duration / 4)));
  const titleWords = text.replace(/^(quero|crie|criar|gere|gerar|faz|faça|produza|preciso de)\s+(um|uma|o|a)?\s*(video|filme|animacao)?\s*(3d)?\s*(de|sobre|com|mostrando|que)?\s*/i,'').trim();
  const title = (titleWords || 'Minha produção 3D').slice(0, 75).replace(/[.!?]+$/, '');
  const subject = restaurant ? 'COMÉRCIO EM MOVIMENTO' : scene==='estudio' ? 'CENA DE ESTÚDIO' : 'UM MUNDO EM MOVIMENTO';
  const showTraffic = match(n, /carro|transito|trafego|veiculo|movimento/);
  const showPeople = match(n, /pessoa|pedestre|personagem|gente|cliente|caminh|corr|multidao/);
  const actions = scene === 'estudio'
    ? ['produto','olhar','apontar','produto','celebrar','parar','produto']
    : showTraffic ? ['trafego','caminhar','trafego','olhar','correr','parar','celebrar']
    : showPeople ? ['caminhar','olhar','correr','parar','apontar','celebrar','caminhar']
    : ['trafego','caminhar','olhar','parar','trafego','celebrar','caminhar'];
  const cameras = ['abertura','alto','rua','travelling','fachada','personagem','produto'];
  const segments = text.split(/(?<=[.!?;])\s+|,\s*(?=com|onde|enquanto|depois|quando|e\s+entao|mostrando)/i)
    .map(x=>words(x).replace(/^(crie|quero|gere|um video|uma animacao)\s*/i,'')).
    filter(x=>x.length>=6);
  const primary = segments.length ? segments : [text];
  const textLabels = [
    title.toUpperCase(),
    subject,
    ...primary.slice(0, Math.max(1,cuts-3)).map(x=>x.toUpperCase()),
    match(n,/surpre|revela|segredo|incrivel|nunca/) ? 'OLHE DE NOVO.' : 'CADA DETALHE CONTA.',
    'VP STUDIO',
  ];
  const shots = Array.from({length:cuts},(_,index)=>({
    duration: duration / cuts,
    camera:cameras[index % cameras.length],
    action:actions[index % actions.length],
    text:(textLabels[index] || primary[(index-2+primary.length)%primary.length]?.toUpperCase() || subject).slice(0,70),
    move:.6+(index%3)*.16,
  }));
  return sanitizeFilm({
    id:'', title, scene, mood, format, duration, fps:30,
    accent:scene==='estudio'?'#bcb8e5':restaurant?'#d7a36a':'#93a6b2',
    headline:title.slice(0,80), narration:text,
    shots,
  });
}

export function isCityRequest(text, film) {
  // Em cenário de cidade, construir quarteirões originais — não usar um modelo pronto.
  return film.scene==='cidade' || /avenida|bairro|predios|escola|hospital|praca|parque/i.test(text);
}
