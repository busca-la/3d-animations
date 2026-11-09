import { startPairing } from './_mcpStore.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Origem não autorizada.' });
    } catch { return res.status(403).json({ error: 'Origem inválida.' }); }
  }
  try {
    const pairing = await startPairing();
    return res.status(201).json(pairing);
  } catch (error) {
    return res.status(503).json({ error: 'Pareamento indisponível: ' + error.message });
  }
}
