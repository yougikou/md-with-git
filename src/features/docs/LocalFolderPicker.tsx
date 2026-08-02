import { useRef } from 'react';
import type { ChangeEvent } from 'react';

export interface LocalFolderFile {
  file: File;
  path: string;
}

export interface LocalFolderHandle {
  handle: FileSystemFileHandle;
  path: string;
}

export type LocalFolderSelection = File | LocalFolderFile | LocalFolderHandle;

type DirectoryPickerWindow = Window & typeof globalThis & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};

async function readDirectory(handle: FileSystemDirectoryHandle, prefix = ''): Promise<LocalFolderHandle[]> {
  const files: LocalFolderHandle[] = [];
  const directory = handle as FileSystemDirectoryHandle & { values: () => AsyncIterableIterator<FileSystemHandle> };
  for await (const entry of directory.values()) {
    const path = `${prefix}${entry.name}`;
    if (entry.kind === 'file') files.push({ handle: entry as FileSystemFileHandle, path });
    else files.push(...await readDirectory(entry as FileSystemDirectoryHandle, `${path}/`));
  }
  return files;
}

export function LocalFolderPicker({ onSelect, compact = false }: { onSelect: (files: LocalFolderSelection[]) => void; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) onSelect(Array.from(files));
    event.target.value = '';
  };

  const chooseFolder = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (picker) {
      try {
        const handle = await picker();
        onSelect(await readDirectory(handle));
      } catch {
        // 用户取消文件夹选择时保持当前文档不变。
      }
      return;
    }
    inputRef.current?.click();
  };

  return <><button type="button" className={`local-folder-picker ${compact ? 'compact' : ''}`} onClick={chooseFolder}>{compact ? '本地文档' : '选择本地 Markdown 文件夹'}</button><input ref={inputRef} className="local-folder-input" type="file" multiple {...{ webkitdirectory: true, directory: true }} onChange={handleChange} /></>;
}
