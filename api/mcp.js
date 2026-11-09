import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { readCatalog, queueCommand, commandStatus, authorize } from './_mcpStore.js';

function content(data) { return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }; }
function failure(error) { return { isError: true, content: [{ type: 'text', text: error.message || 'Falha ao executar.' }] }; }
async function safely(callback) { try { return content(await callback()); } catch (error) { return failure(error); } }

function createServer() {
  const server = new McpServer({
    name: 'vitor-productions-3d-studio', version: '1.0.0',
  }, {
    instructions: 'Controle o estúdio Vitor Productions usando o código de pareamento mostrado na aba ChatGPT MCP do site. Primeiro consulte listar_arquivos para obter IDs reais. Não invente arquivos, não prometa renderizações Blender e só confirme uma alteração depois de consultar estado_comando. Os arquivos são locais: para executar ações, o site pareado deve estar aberto.',
  });

  const codeSchema = z.string().min(60).max(180).describe('Código de pareamento copiado da aba ChatGPT MCP em 3d-animations-eta.vercel.app. Não é nome do arquivo.');

  server.registerTool('conexao_status', {
    title: 'Verificar conexão ao estúdio',
    description: 'Use para confirmar que o código é válido e verificar quando o navegador sincronizou a biblioteca. Não altera os arquivos.',
    inputSchema: { pair_code: codeSchema },
    annotations: { readOnlyHint: true },
  }, async ({ pair_code }) => safely(async () => {
    await authorize(pair_code);
    const catalog = await readCatalog(pair_code);
    return { paired: true, browserCatalogSyncedAt: catalog.syncedAt, assets: catalog.assets.length, projects: catalog.projects.length,
      note: 'Se o catálogo estiver vazio, mantenha o site aberto e escolha a aba ChatGPT MCP para sincronizar.' };
  }));

  server.registerTool('listar_arquivos', {
    title: 'Listar arquivos e projetos disponíveis',
    description: 'Use primeiro para descobrir IDs reais dos modelos GLB, vídeos e projetos sincronizados pelo navegador. Sem alterar arquivos.',
    inputSchema: {
      pair_code: codeSchema,
      kind: z.enum(['all', '3d', 'video', 'image', 'audio', 'file']).optional().default('all').describe('Filtrar pelo tipo de arquivo, use 3d para GLB e video para vídeos.'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ pair_code, kind }) => safely(async () => {
    const catalog = await readCatalog(pair_code);
    return { syncedAt: catalog.syncedAt, assets: kind === 'all' ? catalog.assets : catalog.assets.filter((asset) => asset.kind === kind),
      projects: catalog.projects };
  }));

  server.registerTool('abrir_arquivo', {
    title: 'Abrir modelo ou vídeo no estúdio',
    description: 'Use para abrir um arquivo já importado. A ferramenta enfileira a ação. Confira posteriormente com estado_comando.',
    inputSchema: {
      pair_code: codeSchema,
      asset_id: z.string().min(1).max(150).describe('ID exato retornado por listar_arquivos'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, async ({ pair_code, asset_id }) => safely(async () => queueCommand(pair_code, 'open_asset', { assetId: asset_id })));

  server.registerTool('ajustar_camera_3d', {
    title: 'Controlar câmera e iluminação do modelo GLB',
    description: 'Use para mudar a câmera do visualizador 3D (perspectiva, frente, lateral ou superior), ligar giro automático ou fundo claro. Aplica no navegador pareado, sem alterar o arquivo original.',
    inputSchema: {
      pair_code: codeSchema,
      asset_id: z.string().optional().describe('ID do modelo GLB; se omitido usa o atual'),
      view: z.enum(['perspectiva', 'frente', 'lateral', 'topo']).optional().default('perspectiva'),
      auto_rotate: z.boolean().optional().default(false),
      light_background: z.boolean().optional().default(false),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, async ({ pair_code, asset_id, view, auto_rotate, light_background }) => safely(async () => queueCommand(pair_code, 'camera', {
    assetId: asset_id || '', view, autoRotate: auto_rotate, lightBackground: light_background,
  })));

  server.registerTool('editar_video', {
    title: 'Editar vídeo com cortes, zoom e texto',
    description: 'Use para preparar edição NÃO destrutiva em vídeo da biblioteca. Define trecho, velocidade, formato, zoom e texto animado. Salva as configurações no navegador pareado, não exporta MP4 automaticamente.',
    inputSchema: {
      pair_code: codeSchema,
      asset_id: z.string().min(1).max(150).describe('ID do vídeo retornado por listar_arquivos'),
      start_seconds: z.number().min(0).max(14400).optional().default(0),
      end_seconds: z.number().min(0).max(14400).optional().describe('Final em segundos; omitir para usar o fim do vídeo'),
      speed: z.enum(['0.5', '0.75', '1', '1.25', '1.5', '2']).optional().default('1'),
      aspect: z.enum(['9:16', '16:9', 'original']).optional().default('9:16'),
      zoom: z.enum(['none', 'in', 'out']).optional().default('none'),
      overlay_text: z.string().max(120).optional().default(''),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, async ({ pair_code, asset_id, start_seconds, end_seconds, speed, aspect, zoom, overlay_text }) => safely(async () => {
    if (end_seconds !== undefined && end_seconds !== 0 && end_seconds <= start_seconds) {
      throw new Error('O final precisa ser maior que o início.');
    }
    return queueCommand(pair_code, 'video_edit', {
      assetId: asset_id, start: start_seconds, end: end_seconds ?? 0, speed: Number(speed), aspect, zoom, text: overlay_text,
    });
  }));

  server.registerTool('estado_comando', {
    title: 'Confirmar se uma ação foi aplicada no site',
    description: 'Use após abrir_arquivo, ajustar_camera_3d ou editar_video. Apenas queued significa que ainda não foi aplicada. Apenas applied confirma execução no navegador.',
    inputSchema: {
      pair_code: codeSchema,
      command_id: z.string().length(24).describe('ID do comando devolvido pela ferramenta que enfileirou a ação'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ pair_code, command_id }) => safely(async () => commandStatus(pair_code, command_id)));

  return server;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Use MCP Streamable HTTP POST.' });
  }
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: 'Falha no protocolo MCP.' });
  } finally {
    await transport.close();
    await server.close();
  }
}
