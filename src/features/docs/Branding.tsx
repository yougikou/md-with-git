import { useDocsHostConfiguration } from './renderers';

export function BrandMark({ className = '' }: { className?: string }) {
  const { branding } = useDocsHostConfiguration();
  const image = branding.document?.icon || branding.document?.image;
  if (image) return <img className={`brand-mark brand-image ${className}`} src={image.src} alt={image.alt} />;
  return <span className={`brand-mark ${className}`} aria-label={branding.appName}>{branding.mark}</span>;
}

export function SettingsBrandImage() {
  const { branding } = useDocsHostConfiguration();
  const image = branding.settings?.image;
  return image ? <img className="settings-brand-image" src={image.src} alt={image.alt} /> : null;
}
