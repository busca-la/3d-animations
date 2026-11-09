// Persistência local (IndexedDB). Nunca remover ou recriar a base automaticamente:
// usuários guardam arquivos .blend e vídeos grandes somente neste navegador.
const DB_NAME = 'vp3d-vault-v1';
const DB_VERSION = 2;
const DB_TIMEOUT_MS = 9000;
let databasePromise;

const timeoutError = () => new Error(
  'O Safari não respondeu ao abrir a biblioteca. Seus arquivos não foram apagados. ' +
  'Feche outras abas deste site e clique em Tentar novamente.'
);

function database() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('O armazenamento local está desativado neste navegador. Use uma janela normal do Safari.'));
      return;
    }
    let settled = false;
    let request;
    const timer = window.setTimeout(() => finish(reject, timeoutError()), DB_TIMEOUT_MS);
    function finish(callback, result) {
      if (settled) {
        if (callback === resolve && result?.close) result.close();
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      callback(result);
    }

    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      finish(reject, new Error('Não foi possível abrir o armazenamento: ' + error.message));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('films')) db.createObjectStore('films', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      db.onclose = () => { databasePromise = null; };
      finish(resolve, db);
    };
    request.onerror = () => finish(reject,
      request.error || new Error('Falha do Safari ao acessar os arquivos locais.'));
    request.onblocked = () => finish(reject, new Error(
      'Uma aba antiga bloqueou a atualização da biblioteca. Feche as outras abas do 3D Studio ' +
      'e clique em Tentar novamente. Nenhum arquivo será excluído.'
    ));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

async function transaction(storeName, mode, perform) {
  const db = await database();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, mode);
    } catch (error) {
      if (error?.name === 'InvalidStateError') databasePromise = null;
      reject(new Error('Não foi possível acessar "' + storeName + '": ' + error.message));
      return;
    }
    let settled = false;
    let value;
    const timer = window.setTimeout(() => {
      try { tx.abort(); } catch { /* transação já encerrada */ }
      finish(reject, timeoutError());
    }, DB_TIMEOUT_MS);

    function finish(callback, result) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      callback(result);
    }

    tx.oncomplete = () => finish(resolve, value);
    tx.onerror = () => finish(reject, tx.error || new Error('Falha ao acessar "' + storeName + '".'));
    tx.onabort = () => finish(reject, tx.error || new Error('Operação cancelada pelo navegador.'));

    try {
      const request = perform(tx.objectStore(storeName));
      if (request) {
        request.onsuccess = () => { value = request.result; };
        request.onerror = () => {
          // A transação também notificará o erro. Mostrar uma mensagem objetiva.
          finish(reject, request.error || new Error('Não foi possível ler "' + storeName + '".'));
        };
      }
    } catch (error) {
      try { tx.abort(); } catch { /* ignored */ }
      finish(reject, error);
    }
  });
}

export const getAll = (store) => transaction(store, 'readonly', (objectStore) => objectStore.getAll());
export const save = (store, item) => transaction(store, 'readwrite', (objectStore) => objectStore.put(item));
export const remove = (store, id) => transaction(store, 'readwrite', (objectStore) => objectStore.delete(id));

export async function saveMany(storeName, items) {
  if (!items.length) return;
  return transaction(storeName, 'readwrite', (store) => {
    for (const item of items) store.put(item);
    return null;
  });
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    return await Promise.race([
      navigator.storage.estimate(),
      new Promise((resolve) => window.setTimeout(() => resolve(null), 2500)),
    ]);
  } catch { return null; }
}
