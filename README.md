# Vitor Productions — 3D Vault

Uma biblioteca visual, responsiva e **local-first** para guardar e organizar projetos 3D, personagens, cenários, animações, áudio, vídeo e arquivos originais de produção.

## Funcionalidades da versão inicial

- Dashboard com métricas reais (sem exemplos inventados).
- Projetos com nome, descrição e status: ideia, em produção, em revisão, finalizado.
- Importação de arquivos originais em múltiplos formatos, incluindo Blender (\`.blend\`), GLB, FBX, OBJ, imagens e vídeos.
- Categorias, busca, filtro por projeto e edição de informações.
- Visualização de imagens, vídeo, áudio e modelos **GLB** com câmera 3D; demais tipos disponíveis para download.
- **Visualizador 3D dedicado:** rotação livre, zoom, visualização de frente/lado/cima, giro automático, iluminação neutra, fundo claro/escuro e reprodução de animações incluídas no GLB.
- **Editor de vídeo (básico):** seleção de trechos, velocidade, formato 9:16/16:9/original, preenchimento ou contenção, zoom progressivo, texto com entrada/saída e exportação de um vídeo editado onde o navegador permitir.
- Edições não destrutivas dos vídeos salvas no navegador e incluídas no backup ZIP.
- Exclusão de arquivos e projetos com confirmação; excluir um projeto **não apaga seus arquivos**.
- Backup ZIP completo, com um \`manifest.json\` e os arquivos originais, e restauração do ZIP no navegador.
- Layout para celular, tablet e desktop.

## Desenvolvimento

Requer Node.js 20+.

\`\`\`bash
npm install
npm run dev
\`\`\`

Verificação de build:

\`\`\`bash
npm run build
npm run preview
\`\`\`

O projeto é um frontend React + Vite. Não precisa de banco de dados externo para a primeira versão.

## Importante: onde os arquivos ficam?

Os arquivos são gravados no **IndexedDB do navegador**, **não no repositório do GitHub**, nem em servidores externos. Isso evita publicar acidentalmente cenas ou arquivos de clientes em um repositório público.

**Limitação:** dados locais não são sincronizados entre dispositivos ou navegadores, e podem ser perdidos ao limpar dados do site, usar navegação privada, trocar de aparelho, atingir limites de armazenamento ou por problemas no navegador. O repositório GitHub protege o **código**, não os materiais 3D.

Use **Backups → Baixar backup ZIP** com frequência e salve uma cópia em outro local (ex.: um disco externo e uma pasta privada no Drive). Uma restauração preserva entradas com IDs diferentes e atualiza entradas com IDs iguais. Backups grandes podem exigir muita memória e espaço temporário; mantenha cópias dos originais fora do navegador.

## Formatos e pré-visualização

- **GLB:** visualização 3D interativa com \`@google/model-viewer\`.
- **PNG, JPG, WebP, SVG:** visualização de imagem.
- **MP4, WebM, MOV e áudio:** reprodução depende dos codecs suportados pelo navegador.
- **Exportação de vídeos:** usa Canvas e MediaRecorder no próprio navegador, em tempo real. Saída WebM ou MP4 depende do navegador, de suporte a gravação, áudio, codecs e hardware. Não há garantia de MP4/H.264 em todos os dispositivos. Caso o navegador não suporte essas APIs, a edição pode ser visualizada e salva como configuração, mas não exportada. Use trechos curtos para reduzir a memória necessária. Não há múltiplas faixas, cortes internos múltiplos, efeitos avançados ou renderização Blender no navegador.
- **.blend, .fbx, .obj, .zip, etc.:** armazenamento e download originais. O preview de \`.blend\` exige Blender e não está implementado na web.

## Fluxo dos novos estúdios

1. **Adicionar arquivos**: importe um GLB ou vídeo real para a biblioteca.
2. Abra **Visualizador 3D** ou **Editor de vídeo** pelo menu ou pelos detalhes do arquivo.
3. No editor, ajuste o início e o fim, o enquadramento, a animação de zoom, o texto e a velocidade; clique em **Salvar edição**.
4. Clique em **Exportar vídeo editado** se as APIs de gravação estiverem disponíveis. O original continua intacto.

Para mostrar uma cena ou personagem do Blender no visualizador, exporte em **GLB** com materiais e texturas incorporados. Arquivos .blend, .fbx, .obj, cenas e outros formatos continuam guardados para download, mas não são abertos como modelos 3D interativos diretamente.

## Diretor de Filmes 3D — renderização real no navegador

O menu **Diretor de filmes 3D** agora produz vídeos originais, e não apenas arquivos de referência.

1. Selecione **Diretor de filmes 3D** na barra lateral e crie um novo roteiro.
2. Escolha **hamburgueria**, **cidade** ou **estúdio**, iluminação (dia/tarde/noite), proporção e duração.
3. Ajuste os planos na linha do tempo. Cada plano possui ângulo de câmera, movimento, ação e texto.
4. Clique em **Reproduzir** para pré-visualizar a animação feita em Three.js.
5. Opcionalmente, escolha um **GLB importado** para filmar uma cena real do Blender, ou um áudio importado para compor a trilha.
6. Selecione resolução 720p/1080p e clique em **PRODUZIR VÍDEO 3D**. Mantenha o navegador e a aba ativos durante a gravação.
7. O arquivo gerado via WebGL, Canvas e MediaRecorder é salvo na **Biblioteca / Vídeos**. Ele também pode ser baixado. O formato MP4 ou WebM depende de codecs do navegador.

O cenário incorporado contém rua com marcações coerentes, fachadas de lojas, fila, personagens articulados, tráfego, iluminação 3D e hambúrguer em exposição. Existe também um estúdio com pedestal e iluminação dedicada. O sistema produz movimentos 3D efetivos, sem substituí-los por slides estáticos.

### Criar um vídeo a partir do ChatGPT

Com o plugin **3D VP** conectado e um código de pareamento válido, use as ferramentas:

- `produzir_video_3d_completo` — em um único comando cria roteiro, renderiza quadros no navegador e salva o vídeo na biblioteca (confirme `applied`).
- `criar_filme_3d` — envia um roteiro com múltiplos planos para a biblioteca do site.
- `estado_comando` — verifica se o roteiro foi realmente salvo (precisa retornar `applied`).
- `listar_filmes_3d` — encontra o ID do novo filme quando a sincronização completar.
- `renderizar_filme_3d` — solicita a renderização do filme completo no navegador pareado.
- `estado_comando` — só `applied` confirma que o vídeo foi gerado e salvo na biblioteca.

A gravação exige uma sessão do site aberta e ativa e capacidade WebGL + MediaRecorder. A exportação depende dos recursos do dispositivo e do navegador. **Este MCP não executa Blender na nuvem, não converte arquivos .blend e não gera voz neural sozinho**; áudio externo pode ser importado e associado ao filme.

Os roteiros de filmes agora entram nos **Backups ZIP**; o banco IndexedDB usa versão 2 para criar a coleção `films`, preservando as coleções anteriores.

## Integração MCP com ChatGPT

O estúdio inclui um servidor **MCP Streamable HTTP** na URL:

`https://3d-animations-eta.vercel.app/api/mcp`

### Como conectar

1. Abra o site, importe um `.glb` ou `.mp4` real e abra a aba **ChatGPT MCP**.
2. Clique em **Criar conexão MCP**, copie a URL acima e o **código de pareamento** privado.
3. No ChatGPT web, abra **Plugins → + → Adicionar servidor MCP personalizado** (disponibilidade depende do plano e permissões da conta).
4. Escolha **Sem autenticação**. As ações individuais exigem o código de pareamento temporário, que é validado no servidor.
5. Instale o plugin e selecione-o com @ em uma conversa. Envie o código em um pedido como: **"Usando o plugin Vitor Productions, consulte meus arquivos com este código: ..."**
6. Mantenha o site aberto para que ele receba os comandos (consultados aproximadamente a cada 15 segundos). Safari pode suspender abas em segundo plano.

**Ferramentas:** `conexao_status`, `listar_arquivos`, `abrir_arquivo`, `ajustar_camera_3d`, `editar_video`, `listar_filmes_3d`, `criar_filme_3d`, `renderizar_filme_3d`, `produzir_video_3d_completo`, `estado_comando`. Os comandos são **enfileirados** e só podem ser considerados executados quando `estado_comando` retornar `applied` após confirmação do navegador.

### Arquitetura e segurança

- Os modelos 3D e vídeos originais permanecem no **IndexedDB local**; os arquivos não vão para o MCP nem para o Blob.
- Apenas **IDs, nomes dos arquivos/projetos e comandos de edição** são sincronizados com o armazenamento **Vercel Blob privado**.
- O código de pareamento é uma credencial temporária assinada no servidor, com validade de **7 dias** e revogação manual pela aba MCP. Não publique o código.
- As ferramentas não têm acesso ao Blender, à malha interna dos modelos, a exportação automática nem a dados de outro navegador.
- O endpoint aceita descoberta MCP sem autenticação; as ferramentas que consultam dados ou modificam a sessão exigem o código válido.
- Se o site estiver fechado ou inativo, os comandos ficam pendentes. Códigos expirados ou revogados não permitem ações.
- A operação depende dos limites gratuitos da conta Vercel; uso frequente pode esgotar a cota do Blob, interrompendo a sincronização até a renovação.
- Conectar o plugin ao ChatGPT exige ação explícita do proprietário da conta; o site não pode instalar um plugin em nome do usuário.

**Variáveis de ambiente da Vercel:** `BLOB_READ_WRITE_TOKEN` (gerada ao vincular o store privado) e `VP_MCP_SIGNING_SECRET` (aleatória e mantida somente no backend). Nunca publicar valores em GitHub nem em código cliente.

## Próximos passos possíveis

A primeira versão não inclui login, armazenamento em nuvem dos arquivos originais, colaboração, versionamento automático de arquivos nem integração direta com o Blender. Esses recursos exigirão infraestrutura adicional e desenho de permissões. Não há produções carregadas inicialmente: os materiais reais serão adicionados quando estiverem definidos.

**Observação de marca:** o símbolo VP desta versão é provisório; substituir pelo logotipo oficial fornecido pela Vitor Productions antes de publicar oficialmente.
