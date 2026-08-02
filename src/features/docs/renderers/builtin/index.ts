import { createDocsRendererRegistry } from '../registry';
import { ChangeHistoryRenderer } from './ChangeHistoryRenderer';

export function createDefaultDocsRendererRegistry() {
  return createDocsRendererRegistry({ 'change-history': ChangeHistoryRenderer });
}

export { ChangeHistoryRenderer };
