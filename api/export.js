import { get } from '@vercel/blob';
import { Readable } from 'node:stream';

// Download de entregas finalizadas. IDs são aleatórios e não permitem listar
// a biblioteca privada do MCP nem acessar arquivos de outros usuários.
export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });
  const id = String(req.query?.id || '');
  const format = req.query?.type === 'voice' ? 'voice' : 'video';
  if (!/^[a-f0-9]{32}$/.test(id)) return res.status(400).json({ error: 'ID de entrega inválido.' });
  const path = 'vp3d-exports/2026-11-09/' + id + (format === 'voice' ? '-narracao.mp3' : '-filme.mp4');
  try {
    const asset = await get(path, { access: 'private' });
    if (!asset || asset.statusCode !== 200 || !asset.stream) {
      return res.status(404).json({ error: 'Arquivo não encontrado.' });
    }
    res.setHeader('Content-Type', format === 'voice' ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="' +
      (format === 'voice' ? 'Vitor_Productions_Eduardo.mp3' : 'Vitor_Productions_Filme_3D.mp4') + '"');
    return Readable.fromWeb(asset.stream).pipe(res);
  } catch (error) {
    console.error('Falha de download de entrega privada:', error?.message);
    if (!res.headersSent) return res.status(503).json({ error: 'Não foi possível abrir o arquivo.' });
    res.end();
  }
}
