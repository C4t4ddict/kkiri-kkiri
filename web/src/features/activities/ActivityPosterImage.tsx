import { useState, type ReactNode } from 'react';
import { resolveApiMediaUrl } from '../../shared/api/media';

type ActivityPosterImageProps = {
  source?: string;
  alt: string;
  fallback: ReactNode;
  loading?: 'eager' | 'lazy';
};

export function ActivityPosterImage({ source, alt, fallback, loading = 'lazy' }: ActivityPosterImageProps) {
  const imageUrl = resolveApiMediaUrl(source);
  const [failedUrl, setFailedUrl] = useState<string>();

  if (!imageUrl || imageUrl === failedUrl) return fallback;
  return <img
    src={imageUrl}
    alt={alt}
    loading={loading}
    referrerPolicy="no-referrer"
    onError={() => setFailedUrl(imageUrl)}
  />;
}
