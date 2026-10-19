// Store the audio Blob itself in IndexedDB; never upload recordings.
// The volatile fallback is intentionally labeled as temporary in the UI.
const DATABASE = 'pocketrec-local-v1';
const STORE = 'takes';
let database;
const volatile = new Map();
let temporary = false;

export function hasTemporaryStorage() { return temporary; }

export async function initStorage() {
  if (database) return;
  if (!('indexedDB' in window)) { temporary = true; return; }
  try {
    database = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DATABASE, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
  } catch (error) {
    console.warn('PocketRec: IndexedDB unavailable', error);
    temporary = true;
  }
}

function transact(method, value, write = false) {
  return new Promise((resolve, reject) => {
    if (!database) return reject(new Error('Local database unavailable'));
    try {
      const tx = database.transaction(STORE, write ? 'readwrite' : 'readonly');
      const request = database && tx.objectStore(STORE)[method](...(value === undefined ? [] : [value]));
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
      tx.onerror = () => reject(tx.error);
    } catch (error) { reject(error); }
  });
}

export async function listTakes() {
  let takes = [];
  if (database) {
    try { takes = await transact('getAll'); }
    catch (error) { console.warn('PocketRec: could not read takes', error); temporary = true; }
  }
  for (const take of volatile.values()) {
    const index = takes.findIndex((candidate) => candidate.id === take.id);
    if (index < 0) takes.push(take);
    else takes[index] = take;
  }
  return takes.sort((a, b) => b.createdAt - a.createdAt);
}

export async function putTake(take) {
  if (volatile.has(take.id)) { volatile.set(take.id, take); return; }
  if (database) {
    try { await transact('put', take, true); return; }
    catch (error) { console.warn('PocketRec: could not persist take', error); }
  }
  temporary = true;
  volatile.set(take.id, take);
}

export async function removeTake(id) {
  if (volatile.has(id)) { volatile.delete(id); return; }
  await transact('delete', id, true);
}
