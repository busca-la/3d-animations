// Cliente público do Supabase: carregamento somente quando o projeto está configurado.
// Nunca colocar SERVICE_ROLE, sb_secret_* ou tokens privados em variáveis VITE_.
const baseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const publishableKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
).trim();

let clientPromise = null;

export function supabaseConfiguration() {
  if (!baseUrl || !publishableKey) {
    return { configured: false, reason: 'Nenhum projeto Supabase está associado a esta versão do site.' };
  }
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return { configured: false, reason: 'O endereço configurado para o Supabase não é válido.' };
  }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)) {
    return { configured: false, reason: 'Configure uma URL HTTPS de projeto Supabase.' };
  }
  if (publishableKey.startsWith('sb_secret_') || publishableKey.length < 20) {
    return { configured: false, reason: 'A chave configurada é inválida ou privada. Use somente a publishable key.' };
  }
  // Não usar tokens JWT service_role/secret de modo algum no browser.
  if (publishableKey.split('.').length === 3) {
    try {
      const raw = publishableKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(atob(raw));
      if (claims.role && claims.role !== 'anon') {
        return { configured: false, reason: 'Não é permitido utilizar credenciais privadas no navegador.' };
      }
    } catch { return { configured: false, reason: 'Chave Supabase inválida.' }; }
  } else if (!publishableKey.startsWith('sb_publishable_')) {
    return { configured: false, reason: 'Use uma chave pública sb_publishable_ do Supabase.' };
  }
  return { configured: true, url: url.origin, projectRef: url.hostname.split('.')[0] };
}

export async function supabaseBrowserClient() {
  const config = supabaseConfiguration();
  if (!config.configured) throw new Error(config.reason);
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) => createClient(
      config.url, publishableKey, {
        auth: {
          flowType: 'pkce',
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          storageKey: 'vp3d-auth-v1',
        },
      }
    )).catch(error => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export function googleReturnUrl() {
  // Não repassar código OAuth, tokens ou parâmetros antigos ao provedor.
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set('studio', 'account');
  return url.toString();
}
