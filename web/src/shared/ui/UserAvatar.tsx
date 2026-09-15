import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { resolveApiMediaUrl } from '../api/media';
import type { User } from '../types/domain';

export function UserAvatar({ user, className = 'avatar' }: { user: Pick<User, 'name' | 'profile_picture'> & Partial<User>; className?: string }) {
  const imageUrl = resolveApiMediaUrl(user.profile_picture);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [imageUrl]);

  return <div className={`user-avatar ${className} ${!imageUrl || failed ? 'user-avatar-fallback' : ''}`}>
    {imageUrl && !failed
      ? <img src={imageUrl} alt={`${user.name} 프로필 사진`} onError={() => setFailed(true)} />
      : <UserRound className="user-avatar-symbol" role="img" aria-label={`${user.name || '사용자'} 기본 프로필`} strokeWidth={1.7} />}
  </div>;
}
