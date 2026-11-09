# Vitor Productions — 3D Vault

Uma biblioteca visual, responsiva e **local-first** para guardar e organizar projetos 3D, personagens, cenários, animações, áudio, vídeo e arquivos originais de produção.

## Funcionalidades da versão inicial

- Dashboard com métricas reais (sem exemplos inventados).
- Projetos com nome, descrição e status: ideia, em produção, em revisão, finalizado.
- Importação de arquivos originais em múltiplos formatos, incluindo Blender (\`.blend\`), GLB, FBX, OBJ, imagens e vídeos.
- Categorias, busca, filtro por projeto e edição de informações.
- Visualização de imagens, vídeo, áudio e modelos **GLB** com câmera 3D; demais tipos disponíveis para download.
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
- **.blend, .fbx, .obj, .zip, etc.:** armazenamento e download originais. O preview de \`.blend\` exige Blender e não está implementado na web.

## Próximos passos possíveis

A primeira versão não inclui login, armazenamento em nuvem, colaboração, versionamento automático de arquivos nem integração direta com o Blender. Esses recursos exigirão infraestrutura adicional e desenho de permissões. Não há produções carregadas inicialmente: os materiais reais serão adicionados quando estiverem definidos.

**Observação de marca:** o símbolo VP desta versão é provisório; substituir pelo logotipo oficial fornecido pela Vitor Productions antes de publicar oficialmente.
