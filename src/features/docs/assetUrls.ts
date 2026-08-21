import { useEffect, useRef, useState } from 'react';
import { resolveAssetPath } from './markdown';
import type { RepositoryProvider } from './types';

export function createAssetUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function isBlobAssetUrl(url: string | undefined): url is string {
  return Boolean(url?.startsWith('blob:'));
}

export function releaseAssetUrl(url: string | undefined): void {
  if (isBlobAssetUrl(url)) URL.revokeObjectURL(url);
}

function doesNotNeedResolution(src: string): boolean {
  return /^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('#');
}

interface AssetUrlInput {
  src?: string;
  provider: RepositoryProvider;
  owner: string;
  repository: string;
  documentPath: string;
  assetRef?: string;
}

/** Resolves repository assets and owns the Blob URL for the mounted image. */
export function useResolvedAssetUrl({ src, provider, owner, repository, documentPath, assetRef }: AssetUrlInput): string | undefined {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const activeBlobUrl = useRef<string>();

  useEffect(() => {
    let cancelled = false;
    const releaseActiveUrl = () => {
      releaseAssetUrl(activeBlobUrl.current);
      activeBlobUrl.current = undefined;
    };

    releaseActiveUrl();
    setResolvedSrc(src);
    if (!src || doesNotNeedResolution(src)) return () => { cancelled = true; };

    const assetPath = resolveAssetPath(documentPath, src);
    void Promise.resolve(provider.getAssetUrl({ owner, repository, path: assetPath, ref: assetRef }))
      .then((url) => {
        if (cancelled) {
          releaseAssetUrl(url);
          return;
        }
        if (isBlobAssetUrl(url)) activeBlobUrl.current = url;
        setResolvedSrc(url || src);
      })
      .catch(() => {
        if (!cancelled) setResolvedSrc(src);
      });

    return () => {
      cancelled = true;
      releaseActiveUrl();
    };
  }, [assetRef, documentPath, owner, provider, repository, src]);

  return resolvedSrc;
}
