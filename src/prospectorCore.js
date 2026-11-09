// VP Prospector: utilities without dependencies. No automated messaging or scraping of Google Maps.
export const PROSPECTOR_STORAGE_KEY = 'vp3d-prospector-v1';

export const PROSPECTOR_AREAS = [
  { id: 'cde', label: 'Ciudad del Este', bbox: [-25.575, -54.725, -25.455, -54.595] },
  { id: 'franco', label: 'Presidente Franco', bbox: [-25.59, -54.69, -25.515, -54.565] },
  { id: 'hernandarias', label: 'Hernandarias', bbox: [-25.455, -54.735, -25.365, -54.605] },
];

export const PROSPECTOR_NICHES = [
  { id: 'hamburguerias', label: 'Hamburguerias / fast food', tags: ['nwr["amenity"="fast_food"]', 'nwr["cuisine"~"burger|hamburger",i]'] },
  { id: 'restaurantes', label: 'Restaurantes / pizzarias', tags: ['nwr["amenity"="restaurant"]', 'nwr["cuisine"~"pizza",i]'] },
  { id: 'beleza', label: 'Beleza / barbearias', tags: ['nwr["shop"~"^(hairdresser|beauty)$"]'] },
  { id: 'oficinas', label: 'Oficinas / automóveis', tags: ['nwr["shop"~"^(car_repair|car|tyres)$"]'] },
  { id: 'saude', label: 'Clínicas / odontologia', tags: ['nwr["amenity"~"^(clinic|dentist|doctors)$"]', 'nwr["healthcare"~"^(clinic|dentist|doctor)$"]'] },
  { id: 'lojas', label: 'Lojas / comércio', tags: ['nwr["shop"~"^(clothes|shoes|electronics|mobile_phone|convenience|bakery|supermarket)$"]'] },
];

export const PROSPECTOR_STATUSES = [
  { id: 'novo', label: 'Novo' },
  { id: 'analisar', label: 'Analisar' },
  { id: 'contatado', label: 'Contatado' },
  { id: 'cliente', label: 'Cliente' },
  { id: 'descartado', label: 'Descartado' },
];

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const get = (record, ...keys) => {
  const entries = Object.entries(record || {});
  for (const key of keys) {
    const item = entries.find(([k]) => lower(k).replace(/[^a-z0-9]/g, '') === lower(key).replace(/[^a-z0-9]/g, ''));
    if (item && text(item[1])) return item[1];
  }
  return '';
};

export function safeHttpUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function whatsappUrl(phone) {
  let digits = text(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^0?9\d{8}$/.test(digits)) digits = '595' + digits.replace(/^0/, '');
  else if (/^0?9\d{9}$/.test(digits)) digits = '55' + digits.replace(/^0/, '');
  if (!/^(5959\d{8}|55\d{10,11})$/.test(digits)) return '';
  return 'https://wa.me/' + digits;
}

export function googleMapsUrl(lead) {
  const supplied = safeHttpUrl(lead.mapsUrl);
  if (supplied && /^https?:\/\/(www\.)?(google\.[^/]+|maps\.app\.goo\.gl)\//i.test(supplied)) return supplied;
  const lat = Number(lead.lat), lon = Number(lead.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) > 0 && Math.abs(lon) > 0) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lat + ',' + lon);
  }
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([lead.name, lead.address, lead.city].filter(Boolean).join(' '));
}

export function leadPriority(lead) {
  let score = 0;
  if (!lead.website) score += 45; // Not documented is NOT proof the business lacks a site.
  if (lead.phone) score += 22;
  if (lead.address) score += 12;
  if (lead.category) score += 9;
  if (Number(lead.reviewCount) >= 10) score += 7;
  if (Number(lead.rating) >= 4) score += 5;
  return Math.min(100, score);
}

export function normalizeLead(raw, source = 'Importação') {
  const name = text(get(raw, 'name', 'title', 'nome', 'empresa', 'business_name', 'business'));
  if (!name) return null;
  const city = text(get(raw, 'city', 'cidade')) || 'Ciudad del Este';
  const lat = get(raw, 'lat', 'latitude');
  const lon = get(raw, 'lon', 'lng', 'longitude');
  const statusCandidate = lower(get(raw, 'status', 'etapa', 'stage'));
  const status = PROSPECTOR_STATUSES.some((s) => s.id === statusCandidate) ? statusCandidate : 'novo';
  const website = safeHttpUrl(get(raw, 'website', 'web_site', 'site', 'url_website', 'contact:website'));
  const phone = text(get(raw, 'phone', 'telephone', 'telefone', 'contact:phone', 'whatsapp'));
  const mapsUrl = text(get(raw, 'mapsUrl', 'maps_url', 'link', 'google_maps_url', 'google_maps_link'));
  const osmId = text(get(raw, 'osmId', 'osm_id'));
  return {
    id: text(raw.id) || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)),
    name, city, phone, website, mapsUrl, osmId,
    address: text(get(raw, 'address', 'complete_address', 'formatted_address', 'endereco', 'endereço')),
    category: text(get(raw, 'category', 'categoria', 'type', 'niche')),
    rating: text(get(raw, 'rating', 'nota')),
    reviewCount: text(get(raw, 'reviewCount', 'review_count', 'reviews', 'reviews_count')),
    lat: lat === '' ? null : Number(lat),
    lon: lon === '' ? null : Number(lon),
    source: text(get(raw, 'source', 'fonte')) || source,
    notes: text(get(raw, 'notes', 'observacoes', 'observações')),
    status,
    updatedAt: text(raw.updatedAt) || new Date().toISOString(),
  };
}

export function leadKey(lead) {
  if (lead.osmId) return 'osm:' + lead.osmId;
  const phone = text(lead.phone).replace(/\D/g, '');
  if (phone.length >= 9) return 'phone:' + phone;
  return 'name:' + lower(lead.name) + '|' + lower(lead.address) + '|' + lower(lead.city);
}

export function mergeLeads(previous, incoming) {
  const byKey = new Map();
  for (const lead of previous) byKey.set(leadKey(lead), lead);
  let added = 0;
  for (const lead of incoming) {
    if (!lead || !lead.name) continue;
    const key = leadKey(lead);
    if (!byKey.has(key)) { byKey.set(key, lead); added++; continue; }
    const old = byKey.get(key);
    byKey.set(key, {
      ...lead, ...old,
      phone: old.phone || lead.phone,
      website: old.website || lead.website,
      mapsUrl: old.mapsUrl || lead.mapsUrl,
      address: old.address || lead.address,
      category: old.category || lead.category,
      rating: old.rating || lead.rating,
      reviewCount: old.reviewCount || lead.reviewCount,
      lat: old.lat ?? lead.lat, lon: old.lon ?? lead.lon,
    });
  }
  return { leads: [...byKey.values()], added };
}

export function parseCsv(input) {
  const data = text(input).replace(/^\uFEFF/, '');
  const firstLine = data.split(/\r?\n/, 1)[0] || '';
  const separator = [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    if (char === '"') {
      if (quoted && data[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === separator && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && data[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((cell) => text(cell))) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('CSV contém aspas abertas.');
  row.push(field);
  if (row.some((cell) => text(cell))) rows.push(row);
  const header = rows.shift()?.map((cell) => text(cell)) || [];
  if (!header.length) return [];
  return rows.map((columns) => Object.fromEntries(header.map((key, i) => [key, columns[i] || ''])));
}

export function importProspects(content, filename = '') {
  let records;
  if (/\.json$/i.test(filename)) {
    const result = JSON.parse(content);
    records = Array.isArray(result) ? result : result.results || result.leads || result.items;
    if (!Array.isArray(records)) throw new Error('O JSON precisa conter uma lista de empresas.');
  } else {
    records = parseCsv(content);
  }
  return records.slice(0, 1500).map((item) => normalizeLead(item, 'MazyOS / importação')).filter(Boolean);
}

export function exportProspectsCsv(leads) {
  const headers = ['name', 'phone', 'website', 'address', 'city', 'category', 'rating', 'reviewCount', 'status', 'priority', 'source', 'mapsUrl', 'notes'];
  const escape = (v) => {
    let value = String(v ?? '');
    if (/^[\s]*[=+\-@]/.test(value)) value = "'" + value;
    return '"' + value.replace(/"/g, '""') + '"';
  };
  return '\uFEFF' + [headers.join(';'), ...leads.map((lead) => headers.map((key) =>
    escape(key === 'priority' ? leadPriority(lead) : lead[key])
  ).join(';'))].join('\r\n');
}

export function createOverpassQuery(areaId, nicheId) {
  const area = PROSPECTOR_AREAS.find((item) => item.id === areaId) || PROSPECTOR_AREAS[0];
  const niche = PROSPECTOR_NICHES.find((item) => item.id === nicheId) || PROSPECTOR_NICHES[0];
  const bbox = area.bbox.join(',');
  return '[out:json][timeout:25];(' + niche.tags.map((tag) => tag + '(' + bbox + ');').join('') + ');out center 160;';
}

export function osmToLeads(elements, areaId = 'cde') {
  const area = PROSPECTOR_AREAS.find((a) => a.id === areaId) || PROSPECTOR_AREAS[0];
  return (Array.isArray(elements) ? elements : []).map((element) => {
    const tags = element.tags || {};
    const name = text(tags.name || tags['name:pt'] || tags['name:es']);
    if (!name) return null;
    const address = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ');
    return normalizeLead({
      id: 'osm-' + element.type + '-' + element.id,
      osmId: element.type + '/' + element.id,
      name, city: area.label,
      phone: tags['contact:phone'] || tags.phone,
      website: tags['contact:website'] || tags.website,
      address,
      category: tags.shop || tags.amenity || tags.healthcare || tags.cuisine,
      lat: element.lat ?? element.center?.lat ?? '',
      lon: element.lon ?? element.center?.lon ?? '',
      source: 'OpenStreetMap',
    }, 'OpenStreetMap');
  }).filter(Boolean);
}

export async function fetchOsmBusinesses(areaId, nicheId, signal) {
  const body = 'data=' + encodeURIComponent(createOverpassQuery(areaId, nicheId));
  const response = await fetch('https://overpass.kumi.systems/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body, signal,
  });
  if (!response.ok) throw new Error('OpenStreetMap indisponível (HTTP ' + response.status + '). Tente depois ou importe CSV.');
  const json = await response.json();
  return osmToLeads(json.elements, areaId);
}
