export type OnlineProviderKind = 'github' | 'bitbucket';

const storageKey = 'git-md-viewer-session-access-tokens';

interface TokenStore {
  active?: Partial<Record<OnlineProviderKind, string>>;
  repositories?: Record<string, string>;
}

function readTokens(): TokenStore {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey) || '{}') as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const tokens = parsed as { active?: Record<string, unknown>; repositories?: Record<string, unknown> };
    return {
      active: {
        github: typeof tokens.active?.github === 'string' ? tokens.active.github : undefined,
        bitbucket: typeof tokens.active?.bitbucket === 'string' ? tokens.active.bitbucket : undefined,
      },
      repositories: Object.fromEntries(Object.entries(tokens.repositories || {}).filter(([, token]) => typeof token === 'string')) as Record<string, string>,
    };
  } catch {
    return {};
  }
}

function writeTokens(tokens: TokenStore): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(tokens));
  } catch {
    // The current page can still use the token entered in this session.
  }
}

export function getAccessToken(provider: OnlineProviderKind): string | undefined {
  return readTokens().active?.[provider];
}

export function getRepositoryAccessToken(provider: OnlineProviderKind, owner: string, repository: string): string | undefined {
  return readTokens().repositories?.[repositoryTokenKey(provider, owner, repository)];
}

function repositoryTokenKey(provider: OnlineProviderKind, owner: string, repository: string): string {
  return `${provider}:${owner.toLowerCase()}:${repository.toLowerCase()}`;
}

/** Tokens live only in sessionStorage and are never included in workspace settings. */
export function setRepositoryAccessToken(provider: OnlineProviderKind, owner: string, repository: string, token: string): void {
  const tokens = readTokens();
  const normalized = token.trim();
  const key = repositoryTokenKey(provider, owner, repository);
  const repositories = tokens.repositories || {};
  if (normalized) repositories[key] = normalized;
  else delete repositories[key];
  tokens.repositories = repositories;
  const active = tokens.active || {};
  if (normalized) active[provider] = normalized;
  else delete active[provider];
  tokens.active = active;
  writeTokens(tokens);
}

/** Activates the token assigned to the currently opened repository. */
export function activateRepositoryAccessToken(provider: OnlineProviderKind, owner: string, repository: string): void {
  const tokens = readTokens();
  const token = tokens.repositories?.[repositoryTokenKey(provider, owner, repository)];
  const active = tokens.active || {};
  if (token) active[provider] = token;
  else delete active[provider];
  tokens.active = active;
  writeTokens(tokens);
}
