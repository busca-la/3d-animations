const DB_NAME = 'vp3d-vault-v1';
const DB_VERSION = 1;
let databasePromise;

function database() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Este navegador não oferece armazenamento IndexedDB.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('assets')) {
          db.createObjectStore('assets', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir a biblioteca.'));
      request.onblocked = () => reject(new Error('Feche outras abas desta biblioteca e tente novamente.'));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

async function transaction(storeName, mode, perform) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let value;
    try {
      const request = perform(store);
      if (request) {
        request.onsuccess = () => { value = request.result; };
      }
    } catch (error) {
      tx.abort();
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error || new Error('Não foi possível salvar os dados.'));
    tx.onabort = () => reject(tx.error || new Error('Operação cancelada pelo navegador.'));
  });
}

export const getAll = (store) => transaction(store, 'readonly', (objectStore) => objectStore.getAll());
export const save = (store, item) => transaction(store, 'readwrite', (objectStore) => objectStore.put(item));
export const remove = (store, id) => transaction(store, 'readwrite', (objectStore) => objectStore.delete(id));

export async function saveMany(storeName, items) {
  if (items.length === 0) return;
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const item of items) store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Não foi possível importar os dados.'));
    tx.onabort = () => reject(tx.error || new Error('Importação cancelada.'));
  });
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try { return await navigator.storage.estimate(); }
  catch { return null; }
}
