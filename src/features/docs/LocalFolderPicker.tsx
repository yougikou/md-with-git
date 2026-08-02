import type { ChangeEvent } from 'react';

export function LocalFolderPicker({ onSelect, compact = false }: { onSelect: (files: File[]) => void; compact?: boolean }) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) onSelect(Array.from(files));
    event.target.value = '';
  };

  return <label className={`local-folder-picker ${compact ? 'compact' : ''}`}><span>{compact ? '本地文档' : '选择本地 Markdown 文件夹'}</span><input type="file" multiple {...{ webkitdirectory: true, directory: true }} onChange={handleChange} /></label>;
}
