import { FormEvent, StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { collectDirectoryFiles, LocalFolderPicker, type LocalDirectoryHandle, type LocalFolderSelection } from './features/docs/LocalFolderPicker';
import { loadLocalFolderHandles } from './features/docs/localPersistence';
import { LocalScopeTree } from './features/docs/LocalScopeTree';
import { BrandMark, SettingsBrandImage } from './features/docs/Branding';
import { BitbucketProvider, getLocalFolder, GitHubProvider, registerLocalFolder, registerLocalGitRepository } from './features/docs/providers';
import { DocsRendererProvider, createDocsRendererRegistry, useDocsHostConfiguration } from './features/docs/renderers';
import { MermaidRenderer } from './features/docs/renderers/MermaidRenderer';
import { IframeDemoRenderer } from './features/docs/renderers/IframeDemoRenderer';
import { loadLocalFolderSettings, loadLocalGitSettings, loadOnlineRepositorySettings, saveLocalFolderSettings, saveLocalGitSettings, saveOnlineRepositorySettings } from './features/docs/setupPersistence';
import { loadWorkspaceSources, moveWorkspaceSource, removeWorkspaceSource, saveWorkspaceSource, updateWorkspaceSource, workspaceSourceHref } from './features/docs/workspaceSources';
import type { WorkspaceSource } from './features/docs/workspaceSources';
import { activateRepositoryAccessToken, getRepositoryAccessToken, setRepositoryAccessToken } from './features/docs/accessTokens';
import { ChangeHistoryRenderer } from '../examples/standalone-host/src/docs-renderers';
import { I18nProvider, LanguageSwitcher, useI18n } from './i18n';
import { PwaControls } from './pwa';
import './styles.css';
import 'katex/dist/katex.min.css';

const DocsPage = lazy(() => import('./features/docs/DocsPage'));
const routerBaseName = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

function Loading() {
  const { t } = useI18n();
  const { branding } = useDocsHostConfiguration();
  return (
    <div className="app-loading">
      <BrandMark />
      <strong>{branding.appName}</strong>
      <p>{t('loadingViewer')}</p>
    </div>
  );
}

function requestedSetupAction(event: FormEvent<HTMLFormElement>): 'add' | 'open' {
  const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  return submitter?.value === 'add' ? 'add' : 'open';
}

function notifyWorkspaceSourcesChanged(): void {
  window.dispatchEvent(new Event('workspace-sources-changed'));
}

function RepositoryForm() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [initial] = useState(loadOnlineRepositorySettings);
  const [source, setSource] = useState<'github' | 'bitbucket'>(initial.source);
  const [owner, setOwner] = useState(initial.owner);
  const [repository, setRepository] = useState(initial.repository);
  const [scope, setScope] = useState(initial.scope);
  const [ref, setRef] = useState(initial.ref);
  const [accessToken, setTokenInput] = useState(() => getRepositoryAccessToken(initial.source, initial.owner, initial.repository) || '');

  useEffect(() => { saveOnlineRepositorySettings({ source, owner, repository, scope, ref }); }, [owner, ref, repository, scope, source]);

  const openRepository = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const action = requestedSetupAction(event);
    const normalizedOwner = owner.trim();
    const normalizedRepository = repository.trim();
    const normalizedScope = scope.trim().replace(/^\/+|\/+$/g, '');
    if (!normalizedOwner || !normalizedRepository || !normalizedScope) return;
    setRepositoryAccessToken(source, normalizedOwner, normalizedRepository, accessToken);
    const workspaceSource = saveWorkspaceSource({ label: `${normalizedOwner}/${normalizedRepository} · ${normalizedScope}`, kind: source, owner: normalizedOwner, repository: normalizedRepository, scope: normalizedScope, ref: ref.trim() || undefined });
    notifyWorkspaceSourcesChanged();
    if (action === 'open') navigate(workspaceSourceHref(workspaceSource));
  };

  const changeSource = (value: 'github' | 'bitbucket') => { setSource(value); setTokenInput(getRepositoryAccessToken(value, owner.trim(), repository.trim()) || ''); };

  return <section className="setup-card repository-form-card"><div className="repository-form-heading"><div><span className="eyebrow">OPEN A DOC SPACE</span><h2>{t('onlineRepository')}</h2></div><span className="form-hint">{t('formHintRepository')}</span></div><form onSubmit={openRepository}><div className="repository-form-top-row"><select value={source} onChange={(event) => changeSource(event.target.value as 'github' | 'bitbucket')} aria-label={t('source')}><option value="github">GitHub</option><option value="bitbucket">Bitbucket Cloud</option></select><div className="repository-form-actions"><button className="button button-quiet repository-submit" type="submit" value="add">{t('add')}</button><button className="button button-primary repository-submit" type="submit" value="open">{t('open')} <span>→</span></button></div></div><div className="repository-form-grid"><label><span>{source === 'github' ? 'Owner' : t('workspace')}</span><input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder={source === 'github' ? t('ownerExample') : t('workspaceExample')} required /></label><label><span>{t('repository')}</span><input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder={t('repoExample')} required /></label><label><span>{t('documentDirectory')}</span><input value={scope} onChange={(event) => setScope(event.target.value)} placeholder={t('docsExample')} required /></label><label><span>{t('optionalBranch')}</span><input value={ref} onChange={(event) => setRef(event.target.value)} placeholder={t('defaultBranch')} /></label><label className="access-token-field"><span>{t('accessToken')}</span><input type="password" value={accessToken} onChange={(event) => setTokenInput(event.target.value)} placeholder={source === 'github' ? 'GitHub fine-grained PAT' : 'Bitbucket repository access token'} autoComplete="off" /></label></div><p className="access-token-note">{t('tokenNote')}</p></form></section>;
}

function localSelectionPath(item: LocalFolderSelection): string {
  if ('handle' in item || 'file' in item) return item.path.replaceAll('\\', '/');
  return (item.webkitRelativePath || item.name).replaceAll('\\', '/');
}

function selectionIsPersistable(selection: LocalFolderSelection[]): boolean {
  return selection.some((item) => 'handle' in item);
}

function selectionDisplayPath(selection: LocalFolderSelection[], selectedPath: string): string {
  if (selectedPath) return selectedPath;
  const first = selection[0];
  if (!first) return '';
  const path = localSelectionPath(first);
  return path.includes('/') ? path.slice(0, path.indexOf('/')) : path;
}

function scopeExistsInSelection(selection: LocalFolderSelection[], scope: string): boolean {
  const rawPaths = selection.map(localSelectionPath);
  const browserRoot = selection.some((item) => !('handle' in item)) && rawPaths.length > 0 && rawPaths.every((path) => path.split('/')[0] === rawPaths[0].split('/')[0]) ? `${rawPaths[0].split('/')[0]}/` : '';
  return rawPaths.some((path) => {
    const relative = browserRoot ? path.slice(browserRoot.length) : path;
    return relative === scope || relative.startsWith(`${scope}/`);
  });
}

function LocalFolderSetup() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [initial] = useState(loadLocalFolderSettings);
  const [selection, setSelection] = useState<LocalFolderSelection[]>([]);
  const [localId, setLocalId] = useState(initial.localId || '');
  const [selectedPath, setSelectedPath] = useState(initial.path);
  const [error, setError] = useState('');
  const [rootDirectory, setRootDirectory] = useState<FileSystemDirectoryHandle>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initial.localId) return;
    loadLocalFolderHandles(initial.localId).then(setSelection).catch(() => { /* 权限失效时保留路径，等待用户重新授权。 */ });
  }, [initial.localId]);

  const selectFolder = (files: LocalFolderSelection[], path?: string, details?: { rootDirectory?: FileSystemDirectoryHandle }) => {
    const nextPath = selectionDisplayPath(files, path || '');
    setSelection(files); setLocalId(''); setRootDirectory(details?.rootDirectory); setSelectedPath(nextPath); setError('');
    saveLocalFolderSettings({ path: nextPath });
  };

  const openFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const action = requestedSetupAction(event);
    if (!localId && !selection.length && !rootDirectory) { setError('请先选择本地文档文件夹。'); return; }
    setLoading(true); setError('');
    try {
      const files = rootDirectory ? await collectDirectoryFiles(rootDirectory) : selection;
      const id = localId || registerLocalFolder(files);
      saveLocalFolderSettings({ localId: rootDirectory || selectionIsPersistable(files) ? id : undefined, path: selectedPath });
      const workspaceSource = saveWorkspaceSource({ label: selectedPath || '本地文档', kind: 'local-folder', owner: 'local', repository: 'folder', localId: id });
      notifyWorkspaceSourcesChanged();
      if (action === 'open') navigate(workspaceSourceHref(workspaceSource));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取所选文件夹。');
    } finally {
      setLoading(false);
    }
  };

  return <section className="setup-card local-folder-form-card"><div className="repository-form-heading"><div><span className="eyebrow">OPEN LOCAL MARKDOWN</span><h2>{t('localFolder')}</h2></div><span className="form-hint">{t('formHintFolder')}</span></div><form onSubmit={openFolder}><div className="local-folder-setup-grid"><div className="setup-field"><span className="local-git-label">{t('documentDirectory')}</span><div className="local-folder-actions"><LocalFolderPicker label={t('selectFolder')} onSelect={selectFolder} /><button className="button button-quiet setup-submit" type="submit" value="add" disabled={loading}>{loading ? t('reading') : t('add')}</button><button className="button button-primary setup-submit" type="submit" value="open" disabled={loading}>{loading ? t('reading') : t('open')} <span>→</span></button></div><output className="selected-folder-path">{selectedPath || t('notSelectedFolder')}</output><p className="local-git-selection">{loading ? t('reading') : rootDirectory || selection.length ? t('folderReady') : t('folderPrompt')}</p></div></div>{error && <p className="local-git-error">{error}</p>}</form></section>;
}

function LocalGitRepositorySetup() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [initial] = useState(loadLocalGitSettings);
  const [selection, setSelection] = useState<LocalFolderSelection[]>([]);
  const [localId, setLocalId] = useState(initial.localId || '');
  const [selectedPath, setSelectedPath] = useState(initial.path);
  const [scope, setScope] = useState(initial.scope);
  const [error, setError] = useState('');
  const [rootDirectory, setRootDirectory] = useState<FileSystemDirectoryHandle>();
  const [rootDirectories, setRootDirectories] = useState<LocalDirectoryHandle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initial.localId) return;
    loadLocalFolderHandles(initial.localId).then(setSelection).catch(() => { /* 权限失效时保留路径，等待用户重新授权。 */ });
  }, [initial.localId]);

  useEffect(() => {
    if (selection.length && !rootDirectory && scope && !scopeExistsInSelection(selection, scope)) {
      setScope('');
      saveLocalGitSettings({ localId: localId || undefined, path: selectedPath, scope: '' });
    }
  }, [localId, scope, selectedPath, selection]);

  const selectRepository = (files: LocalFolderSelection[], path?: string, details?: { rootDirectory?: FileSystemDirectoryHandle; directories?: LocalDirectoryHandle[] }) => {
    const nextPath = selectionDisplayPath(files, path || '');
    setSelection(files); setLocalId(''); setRootDirectory(details?.rootDirectory); setRootDirectories(details?.directories || []); setSelectedPath(nextPath); setError('');
    saveLocalGitSettings({ path: nextPath, scope });
  };

  const openLocalGitRepository = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const action = requestedSetupAction(event);
    const normalizedScope = scope.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    if (!selection.length && !localId && !rootDirectory) {
      setError('请先选择包含 .git 的项目文件夹。');
      return;
    }
    if (!normalizedScope) {
      setError('请从树状目录中选择文档目录 scope。');
      return;
    }
    setLoading(true); setError('');
    try {
      const files = rootDirectory ? await collectDirectoryFiles(rootDirectory) : selection;
      const hasGitHead = files.some((item) => {
        const path = localSelectionPath(item);
        return path === '.git/HEAD' || path.endsWith('/.git/HEAD');
      });
      if (!hasGitHead) throw new Error('未读取到项目根目录下的 .git/HEAD。请使用原生文件夹选择器选择项目根目录。');
      if (!scopeExistsInSelection(files, normalizedScope)) throw new Error(`目录 “${normalizedScope}” 不在所选项目根目录中，请重新选择 scope。`);
      const nextId = localId || registerLocalGitRepository(files);
      saveLocalGitSettings({ localId: rootDirectory || selectionIsPersistable(files) ? nextId : undefined, path: selectedPath, scope: normalizedScope });
      const workspaceSource = saveWorkspaceSource({ label: `${selectedPath || '本地 Git'} · ${normalizedScope}`, kind: 'local-git', owner: 'local', repository: 'git', localId: nextId, scope: normalizedScope });
      notifyWorkspaceSourcesChanged();
      if (action === 'open') navigate(workspaceSourceHref(workspaceSource));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取所选 Git 仓库。');
    } finally {
      setLoading(false);
    }
  };

  return <section className="setup-card local-git-form-card"><div className="repository-form-heading"><div><span className="eyebrow">OPEN A LOCAL GIT DOC SPACE</span><h2>{t('localGit')}</h2></div><span className="form-hint">{t('formHintGit')}</span></div><form onSubmit={openLocalGitRepository}><div className="local-git-setup-grid"><div className="setup-field"><span className="local-git-label">{t('projectRoot')}</span><div className="local-git-actions"><LocalFolderPicker label={t('selectProject')} onSelect={selectRepository} /><button className="button button-quiet setup-submit" type="submit" value="add" disabled={loading}>{loading ? t('reading') : t('add')}</button><button className="button button-primary setup-submit" type="submit" value="open" disabled={loading}>{loading ? t('reading') : t('open')} <span>→</span></button></div><output className="selected-folder-path">{selectedPath || t('notSelectedProject')}</output><p className="local-git-selection">{loading ? t('reading') : rootDirectory || selection.length ? t('gitReady') : t('gitPrompt')}</p></div><div className="setup-field"><span className="local-git-label">{t('documentScope')}</span><LocalScopeTree files={selection} directories={rootDirectory ? rootDirectories : undefined} value={scope} onChange={(value) => { setScope(value); setError(''); saveLocalGitSettings({ localId: localId || undefined, path: selectedPath, scope: value }); }} /><p className="local-git-selection">{t('selectedDirectory')}{scope || t('notSelected')}</p></div></div>{error && <p className="local-git-error">{error}</p>}<Link className="local-git-cancel" to="/?mode=repository">{t('setOnline')}</Link></form></section>;
}

function sourceKindLabel(source: WorkspaceSource, localFolder: string, localGit: string): string {
  if (source.kind === 'local-folder') return localFolder;
  if (source.kind === 'local-git') return localGit;
  return source.kind === 'bitbucket' ? 'Bitbucket' : 'GitHub';
}

type DiagnosticResult = { status: 'idle' | 'running' | 'success' | 'error'; message: string };

async function diagnoseSource(source: WorkspaceSource): Promise<string> {
  const isLocal = source.kind === 'local-folder' || source.kind === 'local-git';
  const localProvider = isLocal ? getLocalFolder(source.localId || null, source.kind === 'local-git' ? 'git' : 'folder') : undefined;
  if (isLocal && !localProvider) throw new Error('本地访问会话已失效，请重新选择文件夹并保存来源。');
  if (source.kind === 'local-git' && !(await localProvider!.isGitRepository())) throw new Error('未检测到 .git/HEAD，请重新选择 Git 项目文件夹。');
  if (!isLocal && !source.scope) throw new Error('在线来源缺少文档目录 scope。');
  if (source.kind === 'github' || source.kind === 'bitbucket') activateRepositoryAccessToken(source.kind, source.owner, source.repository);
  const provider = localProvider || (source.kind === 'bitbucket' ? new BitbucketProvider() : new GitHubProvider());
  const refs = await provider.getRefs({ owner: source.owner, repository: source.repository, ref: source.ref, rootPath: source.scope });
  const ref = source.ref || refs.find((item) => item.isDefault)?.name || refs[0]?.name;
  const entries = await provider.getTree({ owner: source.owner, repository: source.repository, ref, rootPath: source.scope });
  const documents = entries.filter((entry) => entry.type === 'file' && /\.mdx?$/i.test(entry.path)).length;
  return `连接正常 · 已读取 ${documents} 个 Markdown 文档${ref ? ` · ${ref}` : ''}`;
}

function WorkspaceSourceRow({ source, index, total, onChange, onMove, onRemove, onOpen }: { source: WorkspaceSource; index: number; total: number; onChange: (label: string) => void; onMove: (offset: -1 | 1) => void; onRemove: () => void; onOpen: () => void }) {
  const { t } = useI18n();
  const [label, setLabel] = useState(source.label);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult>({ status: 'idle', message: '' });
  useEffect(() => { setLabel(source.label); }, [source.label]);
  const runDiagnostic = async () => {
    setDiagnostic({ status: 'running', message: '正在诊断连接…' });
    try {
      setDiagnostic({ status: 'success', message: await diagnoseSource(source) });
    } catch (reason) {
      setDiagnostic({ status: 'error', message: reason instanceof Error ? reason.message : '连接诊断失败。' });
    }
  };
  return <article className="workspace-settings-row"><div className="workspace-settings-source"><span className="workspace-kind-badge">{sourceKindLabel(source, t('localFolderName'), t('localGitLabel'))}</span><div><strong>{source.label}</strong><small>{source.kind === 'local-folder' || source.kind === 'local-git' ? source.scope || t('localFolderSource') : `${source.owner}/${source.repository}${source.scope ? ` · ${source.scope}` : ''}`}</small>{diagnostic.status !== 'idle' && <output className={`source-diagnostic ${diagnostic.status}`} aria-live="polite">{diagnostic.message}</output>}</div></div><div className="workspace-settings-edit"><input value={label} onChange={(event) => setLabel(event.target.value)} aria-label={t('displayName', { name: source.label })} /><button type="button" onClick={() => onChange(label.trim())} disabled={!label.trim() || label.trim() === source.label}>{t('save')}</button></div><div className="workspace-settings-actions"><button type="button" onClick={runDiagnostic} disabled={diagnostic.status === 'running'}>{diagnostic.status === 'running' ? '诊断中…' : diagnostic.status === 'error' ? '重试连接' : '诊断连接'}</button><button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={t('moveUp')}>↑</button><button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={t('moveDown')}>↓</button><button type="button" onClick={onOpen}>{t('open')}</button><button type="button" className="danger" onClick={onRemove}>{t('remove')}</button></div></article>;
}

function WorkspaceSettings() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [sources, setSources] = useState<WorkspaceSource[]>(loadWorkspaceSources);
  useEffect(() => {
    const refresh = () => setSources(loadWorkspaceSources());
    window.addEventListener('workspace-sources-changed', refresh);
    return () => window.removeEventListener('workspace-sources-changed', refresh);
  }, []);
  return <section className="setup-card workspace-settings"><div className="repository-form-heading"><div><span className="eyebrow">DOCUMENT SOURCES</span><h2>{t('documentSources')}</h2></div><span className="form-hint">{t('localNote')}</span></div><div className="workspace-settings-add"><Link to="/?mode=repository">＋ {t('onlineRepository')}</Link><Link to="/?mode=local-folder">＋ {t('localFolder')}</Link><Link to="/?mode=local-git">＋ {t('localGit')}</Link></div>{sources.length > 0 ? <div className="workspace-settings-list">{sources.map((source, index) => <WorkspaceSourceRow key={source.id} source={source} index={index} total={sources.length} onChange={(label) => setSources(updateWorkspaceSource(source.id, { label }))} onMove={(offset) => setSources(moveWorkspaceSource(source.id, offset))} onRemove={() => setSources(removeWorkspaceSource(source.id))} onOpen={() => navigate(workspaceSourceHref(source))} />)}</div> : <div className="workspace-settings-empty">{t('noSources')}</div>}</section>;
}

function HomePage() {
  const { t } = useI18n();
  const { branding } = useDocsHostConfiguration();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isLocalGitSetup = searchParams.get('mode') === 'local-git';
  const isLocalFolderSetup = searchParams.get('mode') === 'local-folder';

  return (
    <main className="landing-shell">
      <div className="landing-glow" />
      <nav className="landing-nav">
        <Link to="/" className="brand"><BrandMark /> {branding.appName}</Link>
        <LanguageSwitcher />
      </nav>
      <section className="hero">
        <p className="eyebrow">DOCUMENTATION, WITH HISTORY</p>
        <h1>{t('hero')}<em>{t('heroEmphasis')}</em></h1>
        <p className="hero-copy">{t('heroCopy')}</p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/docs/vitejs/vite/docs/guide?scope=docs%2Fguide">{t('openExample')} <span>↗</span></Link>
          <Link className="button button-quiet" to="/?mode=local-folder">{t('localFolder')} <span>↗</span></Link>
          <Link className="button button-quiet" to="/?mode=local-git">{t('localGit')} <span>↗</span></Link>
          <Link className="button button-quiet" to="/?mode=repository">{t('onlineRepository')} <span>↗</span></Link>
        </div>
        <div className="local-mode-note"><span className="eyebrow">{t('localMode')}</span><span>{t('localNote')}</span></div>
        <SettingsBrandImage />
        {isLocalFolderSetup ? <LocalFolderSetup /> : isLocalGitSetup ? <LocalGitRepositorySetup /> : <RepositoryForm />}
        <WorkspaceSettings />
      </section>
    </main>
  );
}

function NotFound() {
  const { t } = useI18n();
  return <main className="empty-page"><p className="eyebrow">404</p><h1>{t('pageNotFound')}</h1><Link to="/">{t('home')}</Link></main>;
}

function App() {
  const rendererRegistry = createDocsRendererRegistry(
    { 'change-history': ChangeHistoryRenderer },
    { mermaid: MermaidRenderer, demo: IframeDemoRenderer },
  );
  return (
    <I18nProvider><DocsRendererProvider registry={rendererRegistry}>
      <BrowserRouter basename={routerBaseName}>
        <PwaControls />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/docs/*" element={<DocsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </DocsRendererProvider></I18nProvider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
