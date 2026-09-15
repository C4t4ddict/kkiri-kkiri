import { Layers3, Orbit, ShoppingBag, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { resolveApiMediaUrl } from '../../shared/api/media';
import type { Curriculum } from '../../shared/types/domain';

const exampleIcons = {
  'demo-orbit-cloud': Orbit,
  'demo-morrow-commerce': ShoppingBag,
  'demo-layer-data': Layers3,
  'demo-kkiri-practice': UsersRound,
};

export function OrganizationIcon({ curriculum }: { curriculum: Curriculum }) {
  const resolved = resolveApiMediaUrl(curriculum.organization_logo_url?.trim());
  const imageUrl = /^https?:\/\//i.test(resolved) ? resolved : '';
  const [failedUrl, setFailedUrl] = useState('');
  const ExampleIcon = curriculum.is_example
    ? exampleIcons[curriculum.organization_slug as keyof typeof exampleIcons]
    : undefined;
  const hasImage = imageUrl && failedUrl !== imageUrl;
  return <span className={`cp-organization-icon${hasImage ? ' has-logo' : ''}`} aria-hidden="true"
    title={`${curriculum.organization_name}${hasImage ? ' 로고' : curriculum.is_example ? ' 예시 아이콘' : ' 대표 문자'}`}>
    {hasImage ? <img src={imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(imageUrl)} />
      : ExampleIcon ? <ExampleIcon size={21} strokeWidth={1.7} />
        : <span>{Array.from(curriculum.organization_name.trim())[0]?.toUpperCase() || 'K'}</span>}
  </span>;
}
