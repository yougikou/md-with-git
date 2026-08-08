import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { createDocsRendererRegistry } from './registry';
import type { DocsRendererRegistry } from './types';
import type { DocsTheme } from '../theme';

const defaultRegistry = createDocsRendererRegistry();
export interface DocsBrandImage {
  src: string;
  alt: string;
}

export interface DocsBranding {
  appName?: string;
  mark?: string;
  document?: { icon?: DocsBrandImage; image?: DocsBrandImage };
  settings?: { image?: DocsBrandImage };
}

export interface DocsHostConfiguration {
  /** Initial theme. The document toolbar lets readers switch it at runtime. */
  theme?: DocsTheme;
  /** Optional per-theme color tokens controlled by the host application. */
  themeColors?: Partial<Record<DocsTheme, DocsThemeColors>>;
  onThemeChange?: (theme: DocsTheme) => void;
  branding?: DocsBranding;
}

export interface DocsThemeColors {
  pageBackground?: string;
  surface?: string;
  raisedSurface?: string;
  text?: string;
  mutedText?: string;
  border?: string;
  accent?: string;
  accentSoft?: string;
  onAccent?: string;
  focusRing?: string;
  codeBackground?: string;
}

interface DocsHostContextValue {
  registry: DocsRendererRegistry;
  theme: DocsTheme;
  setTheme: (theme: DocsTheme) => void;
  branding: Required<Pick<DocsBranding, 'appName' | 'mark'>> & DocsBranding;
}

const defaultBranding: DocsHostContextValue['branding'] = { appName: 'Git MD Viewer', mark: 'MD' };
const defaultContext: DocsHostContextValue = { registry: defaultRegistry, theme: 'light', setTheme: () => undefined, branding: defaultBranding };
const DocsHostContext = createContext<DocsHostContextValue>(defaultContext);

function themeStyle(colors: DocsThemeColors | undefined): CSSProperties {
  if (!colors) return {};
  const entries: Array<[string, string | undefined]> = [
    ['--docs-page-background', colors.pageBackground], ['--docs-surface', colors.surface], ['--docs-raised-surface', colors.raisedSurface], ['--docs-text', colors.text], ['--docs-muted-text', colors.mutedText], ['--docs-border', colors.border], ['--docs-accent', colors.accent], ['--docs-accent-soft', colors.accentSoft], ['--docs-on-accent', colors.onAccent], ['--docs-focus-ring', colors.focusRing], ['--docs-code-background', colors.codeBackground],
  ];
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as CSSProperties;
}

export function DocsRendererProvider({ registry, theme: initialTheme = 'light', themeColors, onThemeChange, branding, children }: { registry: DocsRendererRegistry; children: ReactNode } & DocsHostConfiguration) {
  const [theme, setCurrentTheme] = useState<DocsTheme>(initialTheme);
  useEffect(() => setCurrentTheme(initialTheme), [initialTheme]);
  const setTheme = useCallback((nextTheme: DocsTheme) => { setCurrentTheme(nextTheme); onThemeChange?.(nextTheme); }, [onThemeChange]);
  const value = useMemo<DocsHostContextValue>(() => ({ registry, theme, setTheme, branding: { ...defaultBranding, ...branding } }), [branding, registry, setTheme, theme]);
  return <DocsHostContext.Provider value={value}><div className={`docs-host docs-theme-${theme}`} data-docs-theme={theme} style={themeStyle(themeColors?.[theme])}>{children}</div></DocsHostContext.Provider>;
}

export function useDocsRendererRegistry(): DocsRendererRegistry {
  return useContext(DocsHostContext).registry;
}

export function useDocsHostConfiguration(): Omit<DocsHostContextValue, 'registry'> {
  const { theme, setTheme, branding } = useContext(DocsHostContext);
  return { theme, setTheme, branding };
}
