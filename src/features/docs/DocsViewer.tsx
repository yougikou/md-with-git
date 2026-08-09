import { I18nProvider } from '../../i18n';
import DocsPage from './DocsPage';

/**
 * Route-level Viewer component. Mount it under a route ending in `/*` inside
 * the host application's Router; it deliberately does not create a Router.
 */
export function DocsViewer() {
  return <I18nProvider><DocsPage /></I18nProvider>;
}
