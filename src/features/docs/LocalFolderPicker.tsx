import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

export interface LocalFolderFile {
  file: File;
  path: string;
}

export interface LocalFolderHandle {
  handle: FileSystemFileHandle;
  path: string;
}

export interface LocalDirectoryHandle {
  directory: FileSystemDirectoryHandle;
  path: string;
  name: string;
}

export interface LocalDirectoryLevel {
  files: LocalFolderHandle[];
  directories: LocalDirectoryHandle[];
}

export type LocalFolderSelection = File | LocalFolderFile | LocalFolderHandle;

type DirectoryPickerWindow = Window & typeof globalThis & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};

export async function readDirectoryLevel(handle: FileSystemDirectoryHandle, prefix = ''): Promise<LocalDirectoryLevel> {
  const files: LocalFolderHandle[] = [];
  const directories: LocalDirectoryHandle[] = [];
  const directory = handle as FileSystemDirectoryHandle & { values: () => AsyncIterableIterator<FileSystemHandle> };
  for await (const entry of directory.values()) {
    const path = `${prefix}${entry.name}`;
    if (entry.kind === 'file') files.push({ handle: entry as FileSystemFileHandle, path });
    else directories.push({ directory: entry as FileSystemDirectoryHandle, path, name: entry.name });
  }
  return { files, directories };
}

export async function collectDirectoryFiles(handle: FileSystemDirectoryHandle, prefix = ''): Promise<LocalFolderHandle[]> {
  const level = await readDirectoryLevel(handle, prefix);
  const nested = await Promise.all(level.directories.map((entry) => collectDirectoryFiles(entry.directory, `${entry.path}/`)));
  return [...level.files, ...nested.flat()];
}

export function LocalFolderPicker({ onSelect, compact = false, label, compactLabel }: { onSelect: (files: LocalFolderSelection[], selectedPath?: string, details?: { rootDirectory?: FileSystemDirectoryHandle; directories?: LocalDirectoryHandle[] }) => void; compact?: boolean; label?: string; compactLabel?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) {
      const selected = Array.from(files);
      const selectedPath = selected[0]?.webkitRelativePath?.split('/')[0] || '';
      onSelect(selected, selectedPath);
    }
    event.target.value = '';
  };

  const chooseFolder = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (picker) {
      setLoading(true);
      try {
        const handle = await picker();
        const level = await readDirectoryLevel(handle);
        onSelect(level.files, handle.name, { rootDirectory: handle, directories: level.directories });
      } catch {
        // 用户取消文件夹选择时保持当前文档不变。
      } finally {
        setLoading(false);
      }
      return;
    }
    inputRef.current?.click();
  };

  const buttonLabel = loading ? '正在读取目录…' : compact ? compactLabel || '本地文档' : label || '选择本地 Markdown 文件夹';
  return <><button type="button" className={`local-folder-picker ${compact ? 'compact' : ''}`} onClick={chooseFolder} disabled={loading}>{buttonLabel}</button><input ref={inputRef} className="local-folder-input" type="file" multiple {...{ webkitdirectory: '', directory: '' }} onChange={handleChange} /></>;
}
