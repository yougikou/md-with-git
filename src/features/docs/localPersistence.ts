import type { LocalFolderHandle, LocalFolderSelection } from './LocalFolderPicker';

const databaseName = 'git-md-viewer-local';
const storeName = 'folder-handles';

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function saveLocalFolderHandles(id: string, selection: LocalFolderSelection[]): Promise<void> {
  const handles = selection.filter((item): item is LocalFolderHandle => 'handle' in item);
  if (!handles.length) return;
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(handles, id);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

export async function loadLocalFolderHandles(id: string): Promise<LocalFolderHandle[]> {
  const database = await openDatabase();
  if (!database) throw new Error('浏览器不支持本地文件夹会话恢复，请重新选择文件夹。');
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(id);
    request.onsuccess = () => {
      if (!Array.isArray(request.result) || !request.result.length) reject(new Error('本地文件夹会话已过期，请重新选择文件夹。'));
      else resolve(request.result as LocalFolderHandle[]);
    };
    request.onerror = () => reject(new Error('无法恢复本地文件夹会话，请重新选择文件夹。'));
  });
}
