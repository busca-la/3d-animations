import React, { useEffect, useState } from 'react';
import {
  ArrowRight, CheckCircle2, CircleAlert, CloudOff, Database, ExternalLink,
  KeyRound, LoaderCircle, LogIn, LogOut, ShieldCheck, UserRound
} from 'lucide-react';
import { googleReturnUrl, supabaseBrowserClient, supabaseConfiguration } from './supabaseClient.js';

export default function AccountStudio() {
  const config = supabaseConfiguration();
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(config.configured);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!config.configured) return;
    let active = true;
    let subscription;
    let request = 0;
    async function readUser(client) {
      const current = ++request;
      try {
        // getUser() revalida a sessão no servidor de Auth, não usa claims arbitrárias
        // para decidir permissões de faturamento.
        const { data, error: authError } = await client.auth.getUser();
        if (!active || current !== request) return;
        setUser(authError ? null : data?.user || null);
        if (authError && !/session missing|auth session missing/i.test(authError.message || '')) {
          setError('Não foi possível confirmar a sessão: ' + authError.message);
        }
      } catch (err) {
        if (active && current === request) setError('Falha ao consultar a conta: ' + err.message);
      } finally {
        if (active && current === request) setInitializing(false);
      }
    }
    supabaseBrowserClient().then(client => {
      if (!active) return;
      const { data } = client.auth.onAuthStateChange(event => {
        if (!active) return;
        if (event === 'SIGNED_OUT') {
          ++request;
          setUser(null);
          setInitializing(false);
          setMessage('Você saiu da conta. Os arquivos locais continuam neste navegador.');
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          // Evitar chamadas à API de auth dentro do callback síncrono de Auth.
          Promise.resolve().then(() => { if (active) readUser(client); });
        }
      });
      subscription = data.subscription;
      readUser(client);
    }).catch(err => {
      if (active) {
        setInitializing(false);
        setError('Não foi possível iniciar o Supabase: ' + err.message);
      }
    });
    return () => {
      active = false;
      ++request;
      subscription?.unsubscribe();
    };
  }, [config.configured]);

  async function loginGoogle() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const client = await supabaseBrowserClient();
      const { error: authError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: googleReturnUrl() },
      });
      if (authError) throw authError;
      setMessage('Abrindo o login Google…');
    } catch (err) {
      setError('Login Google não iniciado: ' + (err.message || 'verifique o provedor Google no Supabase.'));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError('');
    try {
      const client = await supabaseBrowserClient();
      const { error: authError } = await client.auth.signOut({scope:'local'});
      if (authError) throw authError;
      setUser(null);
      setMessage('Você saiu da conta. Os projetos que já estavam no navegador continuam aqui.');
    } catch (err) {
      setError('Não foi possível sair da conta: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  const displayName = user?.user_metadata?.full_name ||
    user?.user_metadata?.name || user?.email || 'Conta conectada';

  return <div className="account-page">
    <header className="account-header">
      <div className="section-kicker">VITOR PRODUCTIONS / CONTA</div>
      <h1>Seu estúdio. <span className="studio-heading-accent">Sua conta.</span></h1>
      <p>Acesse com Google quando o projeto Supabase for vinculado. As cidades, os vídeos e os arquivos existentes não serão apagados.</p>
    </header>

    {!config.configured ? <section className="account-panel">
      <div className="account-section-icon"><KeyRound size={24}/></div>
      <h2>Integração preparada no GitHub</h2>
      <p>Falta selecionar um projeto Supabase ativo e definir sua URL e chave publicável no ambiente de publicação. A conexão da conta Supabase no ChatGPT não configura automaticamente o projeto do site.</p>
      <div className="account-unconfigured">
        <CircleAlert size={17}/>
        {config.reason}
      </div>
      <a className="account-help-link" href="https://supabase.com/dashboard/projects" target="_blank" rel="noopener noreferrer">
        Ver projetos na minha conta Supabase <ExternalLink size={16}/>
      </a>
    </section> : <section className="account-panel">
      <div className="account-section-icon">{user ? <CheckCircle2 size={24}/> : <UserRound size={24}/>}</div>
      {initializing ? <>
        <h2>Verificando sua sessão…</h2><p>Consultando o Supabase Auth com segurança.</p>
        <div className="account-loading"><LoaderCircle size={18}/> Carregando a conta</div>
      </> : user ? <>
        <h2>{displayName}</h2>
        <p>Autenticado com Supabase Auth</p>
        {user.email && <div className="account-identity"><UserRound size={18}/>{user.email}</div>}
        <div className="account-plan"><ShieldCheck size={18}/><span>Conta conectada. Assinatura paga ainda não ativada.</span></div>
        <button className="account-action account-out" onClick={logout} disabled={busy}>
          <LogOut size={18}/>{busy?'Saindo…':'Sair da conta'}
        </button>
      </> : <>
        <h2>Entrar com Google</h2>
        <p>Use sua conta Google para se identificar no 3D Studio. O acesso só funcionará depois que o provedor Google e a URL do site forem autorizados no projeto Supabase.</p>
        <button className="account-action account-google" onClick={loginGoogle} disabled={busy}>
          <LogIn size={18}/>{busy?'Abrindo Google…':'Continuar com Google'}<ArrowRight size={17}/>
        </button>
      </>}
      <small className="account-project">Supabase conectado ao domínio: {config.projectRef}</small>
    </section>}

    {error && <div className="account-alert account-error" role="alert"><CircleAlert size={18}/>{error}</div>}
    {message && <div className="account-alert account-ok" role="status"><CheckCircle2 size={18}/>{message}</div>}

    <section className="account-info-grid">
      <article><ShieldCheck size={21}/><h3>Login protegido</h3><p>O login usa OAuth Google e PKCE. Senhas e tokens privados não ficam no repositório.</p></article>
      <article><CloudOff size={21}/><h3>Arquivos preservados</h3><p>Sua biblioteca 3D continua no armazenamento local do navegador. Ainda não ativamos sincronização de arquivos na nuvem.</p></article>
      <article><Database size={21}/><h3>Assinaturas futuras</h3><p>Ter uma conta não significa ter um plano pago. Pagamento recorrente e controle de acesso comercial ainda não estão ativos.</p></article>
    </section>
    <p className="account-footnote">O provedor de autenticação precisa estar configurado no mesmo projeto Supabase usado por este site. Esta tela não substitui as configurações de domínio e redirect URLs do Google/Supabase.</p>
  </div>;
}
