export interface OnlineRepositorySettings {
  source: 'github' | 'bitbucket';
  owner: string;
  repository: string;
  scope: string;
  ref: string;
}

export interface LocalFolderSettings {
  localId?: string;
  path: string;
}

export interface LocalGitSettings {
  localId?: string;
  path: string;
  scope: string;
}

interface SetupSettings {
  online?: OnlineRepositorySettings;
  localFolder?: LocalFolderSettings;
  localGit?: LocalGitSettings;
}

const storageKey = 'git-md-viewer-settings';

function readSettings(): SetupSettings {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) as SetupSettings : {};
  } catch {
    return {};
  }
}

function writeSettings(settings: SetupSettings): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* 存储不可用时仍可继续使用当前会话。 */ }
}

export function loadOnlineRepositorySettings(): OnlineRepositorySettings {
  return { source: 'github', owner: '', repository: '', scope: 'docs', ref: '', ...readSettings().online };
}

export function saveOnlineRepositorySettings(value: OnlineRepositorySettings): void {
  writeSettings({ ...readSettings(), online: value });
}

export function loadLocalFolderSettings(): LocalFolderSettings {
  return { path: '', ...readSettings().localFolder };
}

export function saveLocalFolderSettings(value: LocalFolderSettings): void {
  writeSettings({ ...readSettings(), localFolder: value });
}

export function loadLocalGitSettings(): LocalGitSettings {
  return { path: '', scope: '', ...readSettings().localGit };
}

export function saveLocalGitSettings(value: LocalGitSettings): void {
  writeSettings({ ...readSettings(), localGit: value });
}
