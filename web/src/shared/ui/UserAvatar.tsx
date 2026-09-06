import { useEffect, useState } from 'react';
import { resolveApiMediaUrl } from '../api/media';
import type { User } from '../types/domain';

export function UserAvatar({ user, className = 'avatar' }: { user: User; className?: string }) {
  const imageUrl = resolveApiMediaUrl(user.profile_picture);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [imageUrl]);

  return <div className={className}>
    {imageUrl && !failed
      ? <img src={imageUrl} alt={`${user.name} 프로필 사진`} onError={() => setFailed(true)} />
      : <span aria-hidden="true">{user.name?.slice(0, 1) || 'K'}</span>}
  </div>;
}
