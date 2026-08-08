export const docsThemes = ['light', 'dark'] as const;

export type DocsTheme = (typeof docsThemes)[number];

export function isDocsTheme(value: string): value is DocsTheme {
  return docsThemes.includes(value as DocsTheme);
}
