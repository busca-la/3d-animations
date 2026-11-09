import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOverpassQuery, exportProspectsCsv, googleMapsUrl, importProspects,
  leadPriority, mergeLeads, normalizeLead, osmToLeads, parseCsv,
  safeHttpUrl, whatsappUrl,
} from '../src/prospectorCore.js';

test('CSV imports spreadsheet-style data with quotes, semicolons and accents', () => {
  const csv = '\uFEFFtitle;phone;web_site;complete_address\n"La ""Casa""; Burger";+595981234567;;"Calle 1; Centro"';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 1);
  const [lead] = importProspects(csv, 'empresas.csv');
  assert.equal(lead.name, 'La "Casa"; Burger');
  assert.equal(lead.address, 'Calle 1; Centro');
  assert.equal(lead.phone, '+595981234567');
  assert.equal(lead.website, '');
});

test('normalization does not invent business websites or contacts', () => {
  const lead = normalizeLead({ name: 'Barbearia Teste', city: 'Ciudad del Este' });
  assert.equal(lead.website, '');
  assert.equal(lead.phone, '');
  assert.equal(leadPriority(lead), 45);
});

test('Brazil and Paraguay mobile WhatsApp links are normalized', () => {
  assert.equal(whatsappUrl('0981 234 567'), 'https://wa.me/595981234567');
  assert.equal(whatsappUrl('+595 981 234 567'), 'https://wa.me/595981234567');
  assert.equal(whatsappUrl('+55 11 96528-6784'), 'https://wa.me/5511965286784');
  assert.equal(whatsappUrl('0000'), '');
});

test('record merging keeps manually assigned stage and notes', () => {
  const a = normalizeLead({ name: 'Pizzaria Alfa', phone: '+595981234567', status: 'cliente', notes: 'Cliente existente' }, 'Manual');
  const b = normalizeLead({ name: 'Pizzaria Alfa', phone: '+595981234567', website: 'https://exemplo.com' }, 'OpenStreetMap');
  const merged = mergeLeads([a], [b]);
  assert.equal(merged.added, 0);
  assert.equal(merged.leads[0].status, 'cliente');
  assert.equal(merged.leads[0].website, 'https://exemplo.com/');
  assert.equal(merged.leads[0].notes, 'Cliente existente');
});

test('openstreetmap elements become business leads and geographic maps URLs', () => {
  const [lead] = osmToLeads([{ id: 123, type: 'node', lat: -25.5, lon: -54.65,
    tags: { name: 'Comércio Um', shop: 'beauty', 'contact:phone': '+595981234567' } }]);
  assert.equal(lead.osmId, 'node/123');
  assert.equal(lead.source, 'OpenStreetMap');
  assert.ok(googleMapsUrl(lead).includes('-25.5%2C-54.65'));
  assert.ok(createOverpassQuery('cde', 'beleza').includes('hairdresser'));
});

test('export CSV protects dangerous spreadsheet formula prefixes', () => {
  const data = exportProspectsCsv([{ name: '=WEBSERVICE("evil")', status: 'novo' }]);
  assert.ok(data.includes("'=WEBSERVICE"));
});

test('unsafe website schemes cannot become clickable links', () => {
  assert.equal(safeHttpUrl('https://example.org'), 'https://example.org/');
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
});

test('JSON import supports a list under the results key', () => {
  const [lead] = importProspects(JSON.stringify({ results: [{ title: 'Oficina X', phone: '0981123456' }] }), 'results.json');
  assert.equal(lead.name, 'Oficina X');
});
