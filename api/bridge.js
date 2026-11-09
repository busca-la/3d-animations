import { acknowledge, authorize, listPending, readCatalog, revokePairing, syncCatalog } from './_mcpStore.js';

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
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const code = body.pair_code;
  try {
    if (body.op === 'poll') {
      const output = await listPending(code, body.seen);
      return res.status(200).json(output);
    }
    if (body.op === 'sync') {
      return res.status(200).json(await syncCatalog(code, body.assets, body.projects));
    }
    if (body.op === 'ack') {
      await acknowledge(code, body.commandId, body.status, body.reason);
      return res.status(200).json({ ok: true });
    }
    if (body.op === 'status') {
      await authorize(code);
      return res.status(200).json({ connected: true, catalog: await readCatalog(code) });
    }
    if (body.op === 'revoke') {
      await revokePairing(code);
      return res.status(200).json({ revoked: true });
    }
    return res.status(400).json({ error: 'Operação desconhecida.' });
  } catch (error) {
    return res.status(/pareamento|Código|expirado|inválido|inexistente|desconectado/i.test(error.message) ? 401 : 400)
      .json({ error: error.message });
  }
}
