import type { ComponentType } from 'react';

export interface YamlBlockContext {
  documentPath: string;
  repository: string;
  ref?: string;
  scope?: string;
}

export interface YamlBlockRendererProps {
  value: unknown;
  context: YamlBlockContext;
}

export type YamlBlockRenderer = ComponentType<YamlBlockRendererProps>;

export interface CodeBlockRendererProps {
  source: string;
  language: string;
  meta: string;
  context: YamlBlockContext;
}

export type CodeBlockRenderer = ComponentType<CodeBlockRendererProps>;

export interface DocsRendererRegistry {
  getYamlRenderer(name: string): YamlBlockRenderer | undefined;
  registerYamlRenderer(name: string, renderer: YamlBlockRenderer): () => void;
  getCodeBlockRenderer(language: string): CodeBlockRenderer | undefined;
  registerCodeBlockRenderer(language: string, renderer: CodeBlockRenderer): () => void;
}
