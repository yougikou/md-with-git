import type { YamlBlockRenderer, DocsRendererRegistry } from './types';

export function createDocsRendererRegistry(initial: Record<string, YamlBlockRenderer> = {}): DocsRendererRegistry {
  const renderers = new Map(Object.entries(initial));
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
  };
}
