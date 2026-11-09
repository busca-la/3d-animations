import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, CircleHelp, Cloud, Copy, KeyRound, Link2, LockKeyhole, RefreshCw, ShieldCheck, Unplug, Zap, Clapperboard } from 'lucide-react';
import { fileKind } from './vault';

const STORAGE_KEY = 'vp3d-mcp-pairing-v1';
const SEEN_PREFIX = 'vp3d-mcp-done-';
const ENDPOINT = 'https://3d-animations-eta.vercel.app/api/mcp';

function readSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return stored?.pairCode && stored?.expires > Date.now() ? stored : null;
  } catch { return null; }
}

export default function McpBridge({ assets, projects, films = [], visible, onCommand }) {
  const [session, setSession] = useState(readSession);
  const [working, setWorking] = useState(false);
  const [connection, setConnection] = useState('disconnected');
  const [message, setMessage] = useState('');
  const [lastSync, setLastSync] = useState('');
  const inFlight = useRef(new Set());
  const pollNow = useRef(null);
  const seen = useRef(new Set());
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  const catalog = useMemo(() => ({
    assets: assets.map((asset) => ({
      id: asset.id, name: asset.name, kind: fileKind(asset), projectId: asset.projectId || '',
    })),
    projects: projects.map((project) => ({ id: project.id, name: project.name })),
    films: films.map((film) => ({ id: film.id, title: film.title, duration: film.duration, format: film.format })),
  }), [assets, projects, films]);

  const catalogJson = useMemo(() => JSON.stringify(catalog), [catalog]);

  const callBridge = useCallback(async (op, extra = {}, pairCode = session?.pairCode) => {
    if (!pairCode) throw new Error('Não existe pareamento ativo.');
    const response = await fetch('/api/bridge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, pair_code: pairCode, ...extra }),
      cache: 'no-store', credentials: 'same-origin',
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('O servidor retornou uma resposta inválida.'); }
    if (!response.ok) throw new Error(data.error || 'Falha na conexão.');
    return data;
  }, [session?.pairCode]);

  useEffect(() => {
    if (!session) {
      seen.current = new Set();
      inFlight.current.clear();
      return;
    }
    try {
      seen.current = new Set(JSON.parse(localStorage.getItem(SEEN_PREFIX + session.pairCode.slice(0, 36)) || '[]'));
    } catch { seen.current = new Set(); }
    inFlight.current.clear();
  }, [session?.pairCode]);

  const ack = useCallback(async (id, status, reason) => {
    if (!session) return;
    try {
      await callBridge('ack', { commandId: id, status, reason: reason || '' });
      seen.current.add(id);
      const recent = [...seen.current].slice(-150);
      try { localStorage.setItem(SEEN_PREFIX + session.pairCode.slice(0, 36), JSON.stringify(recent)); } catch { /* optional */ }
    } catch (error) {
      setMessage('Falha ao confirmar ação: ' + error.message);
    } finally {
      inFlight.current.delete(id);
    }
  }, [session?.pairCode, callBridge]);

  useEffect(() => {
    const handler = (event) => {
      const { id, status, reason } = event.detail || {};
      if (id && inFlight.current.has(id)) ack(id, status === 'failed' ? 'failed' : 'applied', reason);
    };
    window.addEventListener('vp3d-remote-command-done', handler);
    return () => window.removeEventListener('vp3d-remote-command-done', handler);
  }, [ack]);

  useEffect(() => {
    if (!session?.pairCode) return undefined;
    let active = true;
    const sync = async () => {
      try {
        await callBridge('sync', catalog);
        if (active) { setLastSync(new Date().toLocaleTimeString('pt-BR')); setConnection('connected'); }
      } catch (error) {
        if (active) { setConnection('error'); setMessage('Não foi possível sincronizar: ' + error.message); }
      }
    };
    sync();
    // Atualiza a presença enquanto o site estiver aberto e ativo; evita anunciar
    // uma conexão antiga como se o navegador ainda estivesse recebendo comandos.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') sync();
    }, 120000);
    const handleFocus = () => { if (document.visibilityState === 'visible') sync(); };
    window.addEventListener('focus', handleFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [session?.pairCode, catalogJson, callBridge]);

  useEffect(() => {
    if (!session?.pairCode) return undefined;
    let active = true;
    let busy = false;
    async function poll() {
      if (!active || busy) return;
      busy = true;
      try {
        const { commands } = await callBridge('poll', { seen: [...seen.current].slice(-150), client_version: 'vp3d-city-v1' });
        if (!active) return;
        setConnection('connected');
        for (const command of commands || []) {
          if (!active || !command?.id || seen.current.has(command.id) || inFlight.current.has(command.id)) continue;
          inFlight.current.add(command.id);
          try {
            const result = await onCommandRef.current(command);
            if (result?.deferred) continue;
            await ack(command.id, 'applied');
          } catch (error) {
            await ack(command.id, 'failed', error.message);
          }
        }
      } catch (error) {
        if (active) { setConnection('error'); setMessage(error.message); }
      } finally { busy = false; }
    }
    pollNow.current = poll;
    poll();
    const timer = window.setInterval(poll, 15000);
    const focus = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', focus);
    return () => { active = false; pollNow.current = null; window.clearInterval(timer); document.removeEventListener('visibilitychange', focus); };
  }, [session?.pairCode, callBridge, ack]);

  async function checkConnection() {
    if (!session?.pairCode) return;
    setWorking(true);
    setMessage('Verificando sincronização e comandos pendentes...');
    try {
      await callBridge('sync', catalog);
      setLastSync(new Date().toLocaleTimeString('pt-BR'));
      setConnection('connected');
      if (pollNow.current) await pollNow.current();
      setMessage('Conexão verificada. Se um filme foi solicitado no ChatGPT, a produção abrirá no Diretor 3D nesta página.');
    } catch (error) {
      setConnection('error');
      setMessage('Falha na conexão: ' + error.message);
    } finally {
      setWorking(false);
    }
  }

  async function start() {
    setWorking(true); setMessage('');
    try {
      const response = await fetch('/api/pair', { method: 'POST', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao criar pareamento.');
      const next = { pairCode: data.pairCode, expires: data.expires };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSession(next);
      setConnection('connecting');
      setMessage('Código criado. Copie-o e conecte o servidor MCP no ChatGPT.');
    } catch (error) { setMessage('Erro de conexão: ' + error.message); setConnection('error'); }
    finally { setWorking(false); }
  }

  async function disconnect() {
    setWorking(true);
    try { await callBridge('revoke'); }
    catch (error) { setMessage('O servidor não confirmou a revogação: ' + error.message); setWorking(false); return; }
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* optional */ }
    setSession(null); setConnection('disconnected'); setLastSync('');
    setMessage('Conexão revogada. Gere outro código para conectar novamente.');
    setWorking(false);
  }

  async function copy(value, label) {
    try { await navigator.clipboard.writeText(value); setMessage(label + ' copiado.'); }
    catch { setMessage('O Safari não permitiu copiar automaticamente. Selecione o texto e use ⌘ + C.'); }
  }

  return <section className="mcp-page" style={{ display: visible ? 'block' : 'none' }} aria-label="Conectar ChatGPT por MCP">
    <div className="page-heading">
      <div><div className="section-kicker">INTEGRAÇÕES / CHATGPT</div><h1>ChatGPT <span className="studio-heading-accent">MCP</span></h1>
        <p>Envie comandos do ChatGPT para o visualizador 3D e o editor de vídeo, sem mover seus arquivos originais.</p>
      </div>
      <div className={'mcp-chip mcp-chip-' + connection}>
        <span className="mcp-dot" />
        {connection === 'connected' ? 'Conexão ativa' : connection === 'connecting' ? 'Conectando' : connection === 'error' ? 'Falha de conexão' : 'Desconectado'}
      </div>
    </div>

    <div className="mcp-layout">
      <div className="mcp-panel">
        <div className="mcp-panel-icon"><Bot size={27} /></div>
        <h2>Conecte seu estúdio ao ChatGPT</h2>
        <p>O ChatGPT poderá criar roteiros, controlar cenas, produzir vídeos e gerar narrações brasileiras no nosso próprio motor de voz IA.</p>
        {!session ? (
          <button className="btn btn-primary" disabled={working} onClick={start}><Link2 size={17} />{working ? 'Criando...' : 'Criar conexão MCP'}</button>
        ) : (
          <>
            <div className="mcp-field">
              <div><strong>1. URL do servidor MCP</strong><small>Cole no campo de URL ao criar o plugin</small></div>
              <div className="mcp-copy-field"><code>{ENDPOINT}</code><button type="button" onClick={() => copy(ENDPOINT, 'Endereço MCP')} title="Copiar URL"><Copy size={16} /></button></div>
            </div>
            <div className="mcp-field">
              <div><strong>2. Seu código de pareamento</strong><small>É privado: quem tiver este código poderá comandar esta sessão. Não publique.</small></div>
              <div className="mcp-copy-field"><code className="mcp-secret" title="Código de pareamento">{session.pairCode}</code><button type="button" onClick={() => copy(session.pairCode, 'Código')} title="Copiar código"><Copy size={16} /></button></div>
              <small>Válido até {new Date(session.expires).toLocaleString('pt-BR')}. O código deve ser informado ao ChatGPT ao usar o plugin.</small>
            </div>
            <div className="mcp-field">
              <div><strong>3. Adicionar ao ChatGPT</strong></div>
              <p>Abra <a href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">ChatGPT Plugins</a>, clique em <b>+ → Adicionar servidor MCP personalizado</b>, escolha <b>Sem autenticação</b> e cole a URL. Depois instale o plugin “Vitor Productions 3D Studio”. No chat, escolha o plugin e envie o código de pareamento.</p>
            </div>
            <div className="mcp-connection-info"><Cloud size={15}/><span>Última sincronização: {lastSync || 'pendente'} · {catalog.assets.length} arquivos, {catalog.projects.length} projetos e {catalog.films.length} filmes.</span></div>
            <div className="mcp-quick-actions">
              <button className="btn btn-primary" disabled={working} onClick={checkConnection}><RefreshCw size={16}/>{working ? 'Verificando...' : 'Receber comandos agora'}</button>
              <a className="btn btn-secondary" href="/?studio=film-studio"><Clapperboard size={16}/> Abrir Diretor 3D</a>
            </div>
            <button className="btn btn-secondary" disabled={working} onClick={disconnect}><Unplug size={16}/>{working ? 'Desconectando...' : 'Revogar esta conexão'}</button>
          </>
        )}
        {message && <p className="mcp-message" role="status">{message}</p>}
      </div>
      <aside className="mcp-side">
        <div className="mcp-panel-icon"><ShieldCheck size={24} /></div>
        <h2>O que é permitido</h2>
        <div className="mcp-feature"><Check size={16} /><span>Listar os nomes e IDs dos arquivos importados</span></div>
        <div className="mcp-feature"><Check size={16} /><span>Abrir modelos GLB e vídeos já existentes</span></div>
        <div className="mcp-feature"><Check size={16} /><span>Controlar câmera, giro e fundo do GLB</span></div>
        <div className="mcp-feature"><Check size={16} /><span>Salvar cortes, formato, zoom e texto do vídeo</span></div>
        <div className="mcp-feature"><Check size={16} /><span>Criar roteiros e renderizar filmes 3D em vídeo pela conversa</span></div>
        <div className="mcp-feature"><Check size={16} /><span>Gerar narrações brasileiras em WAV usando o motor Piper do site</span></div>
        <div className="mcp-feature"><Check size={16} /><span>Gerar cidades 3D por descrição e salvar o arquivo GLB para filmagens</span></div>
        <div className="mcp-rule"><LockKeyhole size={17} /><p>Os arquivos de vídeo e modelos originais <b>continuam no navegador</b>. Só os nomes, IDs e comandos são enviados à nuvem privada.</p></div>
        <div className="mcp-rule"><CircleHelp size={17} /><p>Deixe este site aberto e conectado para executar comandos. Exportação de vídeo, edição interna de malhas 3D e renderização Blender não são automáticas.</p></div>
      </aside>
    </div>
  </section>;
}
