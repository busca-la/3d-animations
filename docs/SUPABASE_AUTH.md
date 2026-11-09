# Integração de contas do Vitor Productions 3D Studio

**Estado atual:** a interface e o código de login Google com Supabase Auth já estão integrados ao frontend. A integração só funciona quando existe um projeto Supabase ativo associado ao ambiente de publicação. Não há autenticação comercial, cobrança, planos pagos ou sincronização de arquivos na nuvem ativados.

## 1. Configuração de projeto e domínio

A conexão Supabase atualmente acessível ao assistente retorna **zero projetos**. Por isso nenhum identificador ou chave foi inventado e o frontend mostra um estado de configuração pendente.

Em um projeto Supabase ativo:
- Acesse **Project Settings > Data API** para copiar a Project URL `https://<project-ref>.supabase.co`.
- Acesse **Project Settings > API Keys** para obter a chave **publishable** `sb_publishable_...`.
- Defina no ambiente do site (Vercel ou outro host Vite):
  `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Nunca** configure `service_role`, `sb_secret_*` ou credenciais de Google OAuth no frontend. Client Secret Google fica somente nas configurações de Auth do Supabase.
- Novas variáveis `VITE_` são embutidas no bundle no momento do build; depois de defini-las é preciso uma nova compilação e publicação. O arquivo `.env.example` contém apenas espaços reservados; nenhum dado sensível é commitado.

## 2. Login com Google

No Supabase: **Authentication > Sign In / Providers > Google**. Vincule Client ID e Client Secret do Google Cloud ao provedor de Auth, conforme a documentação oficial. A URL autorizada de callback para o Google é a indicada pelo Supabase, normalmente `https://<project-ref>.supabase.co/auth/v1/callback`.

No Supabase: **Authentication > URL Configuration**:
- **Site URL**: `https://3d-animations-eta.vercel.app` (ou o domínio oficial futuro).
- **Redirect URLs**: `https://3d-animations-eta.vercel.app/?studio=account`, e URLs exatas de pré-visualização somente para os ambientes de teste necessários. Para localhost, use `http://localhost:5173/?studio=account`.

O frontend `src/supabaseClient.js` usa OAuth Google com PKCE, armazenamento persistente de sessão e detecção automática do retorno OAuth. O componente `src/AccountStudio.jsx` revalida o usuário no Supabase Auth, exibe identidade, permite sair da sessão sem apagar arquivos e informa quando a configuração está ausente.

## 3. Proteção de dados e planos

O acervo 3D **continua no IndexedDB** do navegador por padrão; fazer login com Google **não sincroniza** nem move esses arquivos. Não apagar nem migrar automaticamente registros locais.

A aba Assinaturas é demonstrativa. **Nenhum usuário deve receber acesso a recursos pagos baseado somente em localStorage, JavaScript, endereço de email ou dados públicos de perfil.** Futuramente, o backend deve verificar a sessão Supabase, consultar um registro de assinaturas protegido por RLS e atualizar os direitos apenas a partir de webhooks idempotentes do provedor de pagamento. Não estão habilitadas assinaturas ou cobranças e não foram criadas tabelas na base do usuário.

## 4. Testes de ativação

1. Verificar que o site abre sem variáveis Supabase e informa claramente que falta configurar.
2. Inserir valores públicos de um projeto ativo, publicar novamente e abrir `/?studio=account`.
3. Clicar **Continuar com Google** e verificar redirecionamento ao domínio certo do Google/Supabase.
4. Confirmar que o usuário autenticado aparece na tela, atualizar a página e verificar sessão persistida.
5. Sair da conta e verificar que a sessão é removida mas que a biblioteca 3D continua presente.
6. Validar o domínio oficial e URL de retorno autorizados no Supabase, tanto em Safari quanto Chromium.

**Documentação oficial:**
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/sessions

**Nunca usar Lovable para esta integração.** Toda mudança deve ser feita diretamente em `busca-la/3d-animations`.
