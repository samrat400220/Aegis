const DATABASE_NAME = "AEGIS_DB";
const DATABASE_VERSION = 1;
const ACTIONS_STORE = "pendingActions";

let databasePromise;

function openDatabase() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("This browser does not support IndexedDB."));
  if (databasePromise) return databasePromise;
  let cachedPromise;
  const openingPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ACTIONS_STORE)) {
        const store = database.createObjectStore(ACTIONS_STORE, { keyPath: "offlineActionId" });
        store.createIndex("byStatus", "status");
        store.createIndex("byCreatedAt", "createdAt");
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      database.onversionchange = () => {
        database.close();
        if (databasePromise === cachedPromise) databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error("Could not open local request storage."));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error("Close another AEGIS tab to finish updating local storage."));
    };
  });
  cachedPromise = openingPromise.catch((error) => {
    if (databasePromise === cachedPromise) databasePromise = undefined;
    throw error;
  });
  databasePromise = cachedPromise;
  return databasePromise;
}

function transaction(storeName, mode, operation) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    let result;

    try {
      const tx = database.transaction(storeName, mode);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error("Local storage transaction failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Local storage transaction was cancelled."));

      const request = operation(tx.objectStore(storeName));
      if (request) {
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error ?? new Error("Local storage operation failed."));
      }
    } catch (error) {
      reject(error);
    }
  }));
}

export const addAction = (action) => transaction(ACTIONS_STORE, "readwrite", (store) => store.add(action));
export const updateAction = (action) => transaction(ACTIONS_STORE, "readwrite", (store) => store.put(action));
export const getAction = (id) => transaction(ACTIONS_STORE, "readonly", (store) => store.get(id));
export const deleteAction = (id) => transaction(ACTIONS_STORE, "readwrite", (store) => store.delete(id));
export const listActions = () => transaction(ACTIONS_STORE, "readonly", (store) => store.getAll());
export const listActionsByStatus = (status) => transaction(
  ACTIONS_STORE,
  "readonly",
  (store) => store.index("byStatus").getAll(status),
);
