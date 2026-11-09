import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowUpRight, BriefcaseBusiness, Check, CircleAlert, Download,
  ExternalLink, FileSpreadsheet, Filter, Globe2, MapPin, MessageCircle,
  Plus, Search, ShieldCheck, Trash2, Upload, X,
} from 'lucide-react';
import {
  PROSPECTOR_AREAS, PROSPECTOR_NICHES, PROSPECTOR_STATUSES, PROSPECTOR_STORAGE_KEY,
  exportProspectsCsv, fetchOsmBusinesses, googleMapsUrl, importProspects,
  leadPriority, mergeLeads, normalizeLead, safeHttpUrl, whatsappUrl,
} from './prospectorCore.js';
import './prospector.css';

function storedProspects() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROSPECTOR_STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((lead) => lead && typeof lead.name === 'string').slice(0, 2500) : [];
  } catch { return []; }
}

const EMPTY_FORM = { name: '', phone: '', website: '', address: '', category: '' };

function Metric({ label, value, detail }) {
  return <div className="vp-pro-metric">
    <strong>{value}</strong><span>{label}</span><small>{detail}</small>
  </div>;
}

function LeadCard({ lead, onStatus, onNotes, onDelete }) {
  const score = leadPriority(lead);
  const maps = googleMapsUrl(lead);
  const wa = whatsappUrl(lead.phone);
  const site = safeHttpUrl(lead.website);
  return <article className="vp-pro-lead">
    <div className="vp-pro-lead-top">
      <div className="vp-pro-lead-icon"><BriefcaseBusiness size={18}/></div>
      <div className="vp-pro-lead-title">
        <h3 title={lead.name}>{lead.name}</h3>
        <p>{[lead.category, lead.city].filter(Boolean).join(' · ') || 'Sem categoria'}</p>
      </div>
      <span className={'vp-pro-score ' + (score >= 70 ? 'high' : '')} title="Pontuação indicativa, não garante venda">{score}/100</span>
    </div>
    <div className="vp-pro-lead-meta">
      <span className={'vp-pro-webflag ' + (site ? 'has-web' : '')}>{site ? 'Site informado' : 'Site não informado'}</span>
      {lead.phone && <span>Tel. {lead.phone}</span>}
      {lead.address && <span className="vp-pro-address" title={lead.address}><MapPin size={13}/>{lead.address}</span>}
      <span className="vp-pro-source">Fonte: {lead.source || 'Importação'}</span>
    </div>
    <div className="vp-pro-lead-actions">
      <a href={maps} target="_blank" rel="noopener noreferrer"><MapPin size={15}/> Maps <ArrowUpRight size={12}/></a>
      {site && <a href={site} target="_blank" rel="noopener noreferrer"><Globe2 size={15}/> Site <ArrowUpRight size={12}/></a>}
      {wa && <a className="vp-pro-whatsapp" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={15}/> WhatsApp <ArrowUpRight size={12}/></a>}
      <label className="vp-pro-stage">Etapa
        <select value={lead.status || 'novo'} onChange={(e) => onStatus(lead.id, e.target.value)}>
          {PROSPECTOR_STATUSES.map((status) => <option value={status.id} key={status.id}>{status.label}</option>)}
        </select>
      </label>
    </div>
    <details className="vp-pro-notes">
      <summary>Observações {lead.notes ? '· salvas' : ''}</summary>
      <textarea aria-label={'Observações para ' + lead.name} rows={2} maxLength={1500} value={lead.notes || ''}
        placeholder="Anote informações verificadas sobre este comércio…"
        onChange={(e) => onNotes(lead.id, e.target.value)}/>
      <button type="button" className="vp-pro-delete" onClick={() => onDelete(lead)}><Trash2 size={14}/> Remover registro</button>
    </details>
  </article>;
}

export default function Prospector() {
  const [leads, setLeads] = useState(storedProspects);
  const [areaId, setAreaId] = useState('cde');
  const [nicheId, setNicheId] = useState('hamburguerias');
  const [textFilter, setTextFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [siteFilter, setSiteFilter] = useState('todos');
  const [sortBy, setSortBy] = useState('priority');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const fileInput = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(PROSPECTOR_STORAGE_KEY, JSON.stringify(leads));
      setSaveError('');
    } catch {
      setSaveError('Não foi possível salvar neste navegador. Exporte o CSV antes de sair.');
    }
  }, [leads]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const filtered = useMemo(() => {
    const term = textFilter.trim().toLocaleLowerCase('pt-BR');
    return leads.filter((lead) => {
      if (statusFilter !== 'todos' && lead.status !== statusFilter) return false;
      if (siteFilter === 'sem' && lead.website) return false;
      if (siteFilter === 'com' && !lead.website) return false;
      if (term && ![lead.name, lead.city, lead.category, lead.address, lead.phone]
        .join(' ').toLocaleLowerCase('pt-BR').includes(term)) return false;
      return true;
    }).sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) :
      sortBy === 'updated' ? new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0) :
      leadPriority(b) - leadPriority(a));
  }, [leads, textFilter, statusFilter, siteFilter, sortBy]);

  function mergeIncoming(records, sourceText) {
    const next = mergeLeads(leads, records);
    setLeads(next.leads);
    setNotice(sourceText + ': ' + next.added + ' novo(s), ' + (records.length - next.added) + ' já registrado(s).');
    setError('');
  }

  async function searchBusinesses(event) {
    event.preventDefault();
    if (loading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true); setError(''); setNotice('');
    try {
      const records = await fetchOsmBusinesses(areaId, nicheId, controller.signal);
      mergeIncoming(records, 'OpenStreetMap');
      if (!records.length) setNotice('Nenhuma empresa cadastrada nessa região/categoria no OpenStreetMap.');
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || 'Falha ao consultar o OpenStreetMap.');
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setNotice('');
    if (file.size > 3_000_000) { setError('Arquivo acima de 3 MB. Divida a planilha antes de importar.'); return; }
    try {
      const records = importProspects(await file.text(), file.name);
      if (!records.length) throw new Error('Nenhum comércio válido encontrado. O arquivo precisa ter coluna name, title ou nome.');
      mergeIncoming(records, 'Importação MazyOS / CSV');
    } catch (err) {
      setError('Não foi possível importar: ' + (err.message || 'formato inválido'));
    }
  }

  function saveNew(event) {
    event.preventDefault();
    const entry = normalizeLead({ ...form, city: PROSPECTOR_AREAS.find((a) => a.id === areaId)?.label, source: 'Manual' }, 'Manual');
    if (!entry) return;
    mergeIncoming([entry], 'Cadastro manual');
    setForm(EMPTY_FORM); setNewOpen(false);
  }

  function patchLead(id, data) {
    setLeads((current) => current.map((lead) => lead.id === id ?
      { ...lead, ...data, updatedAt: new Date().toISOString() } : lead));
  }

  function removeLead(lead) {
    if (window.confirm('Remover "' + lead.name + '" da lista local?')) {
      setLeads((items) => items.filter((item) => item.id !== lead.id));
      setNotice('Registro removido da lista deste navegador.');
    }
  }

  function downloadCsv() {
    const blob = new Blob([exportProspectsCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a');
    element.href = url;
    element.download = 'vp-prospector-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(element);
    element.click();
    element.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  const mapsQuery = PROSPECTOR_NICHES.find((n) => n.id === nicheId)?.label || 'comércio';
  const city = PROSPECTOR_AREAS.find((a) => a.id === areaId)?.label || 'Ciudad del Este';
  const manualMapsLink = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapsQuery + ' ' + city);

  return <div className="vp-pro">
    <div className="vp-pro-heading">
      <div>
        <p className="vp-pro-kicker">VITOR PRODUCTIONS / FERRAMENTAS COMERCIAIS</p>
        <h1>VP <em>Prospector.</em></h1>
        <p className="vp-pro-intro">Encontre negócios, organize oportunidades e acompanhe seus contatos em um só lugar.</p>
      </div>
      <div className="vp-pro-tools">
        <button type="button" onClick={() => setNewOpen(true)} className="vp-pro-button subtle"><Plus size={16}/> Nova empresa</button>
        <button type="button" onClick={() => fileInput.current?.click()} className="vp-pro-button subtle"><Upload size={16}/> Importar CSV / JSON</button>
        <input hidden ref={fileInput} type="file" accept=".csv,.json,text/csv,application/json" onChange={importFile}/>
        <button type="button" className="vp-pro-button primary" onClick={downloadCsv} disabled={!filtered.length}>
          <ArrowDownToLine size={16}/> Exportar CSV
        </button>
      </div>
    </div>

    <div className="vp-pro-metrics">
      <Metric label="Empresas registradas" value={leads.length} detail="Neste navegador"/>
      <Metric label="Site não informado" value={leads.filter((lead) => !lead.website).length} detail="Não significa ausência de site"/>
      <Metric label="Sem abordagem" value={leads.filter((lead) => ['novo', 'analisar'].includes(lead.status)).length} detail="Novo ou em análise"/>
      <Metric label="Clientes" value={leads.filter((lead) => lead.status === 'cliente').length} detail="Marcados manualmente"/>
    </div>

    <section className="vp-pro-search-section">
      <div className="vp-pro-section-title"><div><Search size={18}/><h2>Pesquisar negócios</h2></div><span>Dados públicos · OpenStreetMap</span></div>
      <form onSubmit={searchBusinesses} className="vp-pro-search-form">
        <label>Região<select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          {PROSPECTOR_AREAS.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
        </select></label>
        <label>Segmento<select value={nicheId} onChange={(e) => setNicheId(e.target.value)}>
          {PROSPECTOR_NICHES.map((niche) => <option key={niche.id} value={niche.id}>{niche.label}</option>)}
        </select></label>
        <button type="submit" disabled={loading} className="vp-pro-button primary search-button">
          {loading ? 'Pesquisando…' : <><Search size={16}/> Buscar empresas</>}
        </button>
      </form>
      <div className="vp-pro-search-footer">
        <p>Pesquisa real em dados do OpenStreetMap. Empresas podem não ter telefone, site ou cadastro completo. Os resultados não são do Google Maps.</p>
        <a href={manualMapsLink} target="_blank" rel="noopener noreferrer">Pesquisar no Google Maps <ExternalLink size={13}/></a>
      </div>
    </section>

    {(notice || error || saveError) && <div className={'vp-pro-alert ' + (error || saveError ? 'error' : '')} role="status">
      {error || saveError ? <CircleAlert size={17}/> : <Check size={17}/>}
      <span>{error || saveError || notice}</span>
      <button type="button" onClick={() => { setError(''); setNotice(''); }} aria-label="Fechar aviso"><X size={15}/></button>
    </div>}

    <section className="vp-pro-results">
      <div className="vp-pro-section-title"><div><Filter size={18}/><h2>Oportunidades</h2></div><span>{filtered.length} exibida(s)</span></div>
      <div className="vp-pro-filters">
        <label className="vp-pro-text-search"><Search size={16}/><input placeholder="Buscar nome, endereço, telefone..." value={textFilter} onChange={(e) => setTextFilter(e.target.value)}/></label>
        <label>Etapa<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="todos">Todas</option>
          {PROSPECTOR_STATUSES.map((status) => <option value={status.id} key={status.id}>{status.label}</option>)}
        </select></label>
        <label>Site<select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
          <option value="todos">Todos</option><option value="sem">Não informado</option><option value="com">Informado</option>
        </select></label>
        <label>Ordenar<select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="priority">Prioridade</option><option value="updated">Atualizados</option><option value="name">Nome A–Z</option>
        </select></label>
      </div>
      {filtered.length ? <div className="vp-pro-grid">
        {filtered.slice(0, 300).map((lead) => <LeadCard key={lead.id} lead={lead}
          onStatus={(id, status) => patchLead(id, { status })}
          onNotes={(id, notes) => patchLead(id, { notes })}
          onDelete={removeLead}/>)}
      </div> : <div className="vp-pro-empty">
        <FileSpreadsheet size={28} strokeWidth={1.4}/>
        <h3>{leads.length ? 'Nenhuma empresa corresponde aos filtros.' : 'Sua lista começa aqui.'}</h3>
        <p>{leads.length ? 'Altere os filtros para visualizar outros registros.' : 'Pesquise negócios no OpenStreetMap, importe resultados do MazyOS ou cadastre uma empresa manualmente.'}</p>
      </div>}
      {filtered.length > 300 && <p className="vp-pro-limit">Mostrando os primeiros 300 registros. Refine a busca ou exporte o CSV completo.</p>}
      <div className="vp-pro-footnote"><ShieldCheck size={16}/>
        <p>Informações comerciais ficam salvas apenas neste navegador. Exporte CSV para backup. “Site não informado” não prova que a empresa não possui site; verifique antes de fazer contato. Nenhuma mensagem é enviada automaticamente.</p>
      </div>
    </section>

    {newOpen && <div className="vp-pro-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setNewOpen(false); }}>
      <form className="vp-pro-modal" onSubmit={saveNew} role="dialog" aria-modal="true" aria-label="Cadastrar empresa">
        <div className="vp-pro-modal-head"><h2>Adicionar empresa</h2><button type="button" onClick={() => setNewOpen(false)} aria-label="Fechar"><X size={18}/></button></div>
        {[
          ['name', 'Nome da empresa *'], ['phone', 'Telefone comercial'],
          ['website', 'Site (opcional)'], ['address', 'Endereço'],
          ['category', 'Segmento'],
        ].map(([id, label]) => <label key={id}>{label}<input required={id === 'name'} maxLength={160}
          value={form[id]} onChange={(e) => setForm((old) => ({ ...old, [id]: e.target.value }))}/></label>)}
        <button type="submit" className="vp-pro-button primary"><Plus size={16}/> Adicionar</button>
      </form>
    </div>}
  </div>;
}
