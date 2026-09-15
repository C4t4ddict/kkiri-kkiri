import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { resolveApiMediaUrl } from '../../shared/api/media';

export function CurriculumImage({ cover, logo, name }: { cover?: string; logo?: string; name: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const candidates = [cover, logo].map(url => resolveApiMediaUrl(url?.trim())).filter(url => /^https?:\/\//i.test(url));
  const source = candidates.find(url => !failed.includes(url));
  const isLogo = source === resolveApiMediaUrl(logo?.trim());
  return <div className={`cp-course-image${source ? isLogo ? ' is-logo' : '' : ' is-placeholder'}`}>
    {source ? <img src={source} alt={`${name} 기업 이미지`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(current => [...current, source])} />
      : <><Building2 size={28} strokeWidth={1.5} /><span>{name || '기업 이미지'}</span><small>기업 이미지 등록 예정</small></>}
  </div>;
}
