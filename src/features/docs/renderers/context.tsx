import { createContext, useContext, type ReactNode } from 'react';
import { createDefaultDocsRendererRegistry } from './builtin';
import type { DocsRendererRegistry } from './types';

const defaultRegistry = createDefaultDocsRendererRegistry();
const DocsRendererContext = createContext<DocsRendererRegistry>(defaultRegistry);

export function DocsRendererProvider({ registry, children }: { registry: DocsRendererRegistry; children: ReactNode }) {
  return <DocsRendererContext.Provider value={registry}>{children}</DocsRendererContext.Provider>;
}

export function useDocsRendererRegistry(): DocsRendererRegistry {
  return useContext(DocsRendererContext);
}
