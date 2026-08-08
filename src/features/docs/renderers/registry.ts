import type { CodeBlockRenderer, DocsRendererRegistry, YamlBlockRenderer } from './types';

export function createDocsRendererRegistry(initial: Record<string, YamlBlockRenderer> = {}, initialCodeBlocks: Record<string, CodeBlockRenderer> = {}): DocsRendererRegistry {
  const renderers = new Map(Object.entries(initial));
  const codeBlockRenderers = new Map(Object.entries(initialCodeBlocks).map(([language, renderer]) => [language.toLocaleLowerCase(), renderer]));
  return {
    getYamlRenderer(name) {
      return renderers.get(name);
    },
    registerYamlRenderer(name, renderer) {
      if (!name.trim()) throw new Error('YAML renderer name cannot be empty.');
      const previous = renderers.get(name);
      renderers.set(name, renderer);
      return () => {
        if (renderers.get(name) === renderer) {
          if (previous) renderers.set(name, previous);
          else renderers.delete(name);
        }
      };
    },
    getCodeBlockRenderer(language) {
      return codeBlockRenderers.get(language.toLocaleLowerCase());
    },
    registerCodeBlockRenderer(language, renderer) {
      const normalized = language.trim().toLocaleLowerCase();
      if (!normalized) throw new Error('Code block language cannot be empty.');
      const previous = codeBlockRenderers.get(normalized);
      codeBlockRenderers.set(normalized, renderer);
      return () => {
        if (codeBlockRenderers.get(normalized) === renderer) {
          if (previous) codeBlockRenderers.set(normalized, previous);
          else codeBlockRenderers.delete(normalized);
        }
      };
    },
  };
}
