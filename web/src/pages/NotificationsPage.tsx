import { BellRing, Check, MailOpen, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { NotificationItem } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

const channel = (type: NotificationItem['type']) => ({
  team_invitation: '팀 합류 제안', notice_comment: '댓글 알림', developer_reply: '개발자 답장', notice: '팀 공지',
}[type]);

const relativeTime = (value: string) => {
  const minutes = Math.floor(Math.max(0, Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
};

export function NotificationsPage() {
  const result = useAsync(() => api<NotificationItem[]>('/notifications'), []);
  const [responding, setResponding] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (result.data?.some((item) => !item.is_read)) api('/notifications/read', { method: 'PUT' }).catch(() => undefined);
  }, [result.data]);

  const respond = async (offerId: number, decision: 'ACCEPTED' | 'REJECTED') => {
    setResponding(offerId); setMessage('');
    try {
      await api(`/api/team-join-offers/${offerId}/respond`, { method: 'PUT', body: JSON.stringify({ decision }) });
      setMessage(decision === 'ACCEPTED' ? '팀에 합류했습니다. 나의 활동에서 확인하세요.' : '합류 제안을 거절했습니다.');
      await result.reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : '합류 제안을 처리하지 못했습니다.'); }
    finally { setResponding(null); }
  };

  return <>
    <PageTitle title="알림" description="팀 활동과 지원에 관한 중요한 소식을 모아봤어요." />
    {message && <div className="inline-message">{message}</div>}
    <PageState loading={result.loading} error={result.error} empty={!result.loading && !result.data?.length ? '아직 도착한 알림이 없습니다.' : undefined} />
    <div className="notification-list">{result.data?.map((item) => <article className={`notification-card ${item.is_read ? '' : 'unread'}`} key={item.notification_id}>
      <span className="notification-icon">{item.type === 'team_invitation' ? <UsersRound /> : item.is_read ? <MailOpen /> : <BellRing />}</span>
      <div className="notification-copy"><div className="notification-meta"><strong>{channel(item.type)}</strong><span>{relativeTime(item.created_at)}</span></div><h3>{item.title}</h3><p>{item.content}</p>
        {item.type === 'team_invitation' && item.offer_id && item.offer_status === 'PENDING' && <div className="button-row compact"><button className="ghost-button" disabled={responding === item.offer_id} onClick={() => respond(item.offer_id!, 'REJECTED')}>거절</button><button className="primary-button" disabled={responding === item.offer_id} onClick={() => respond(item.offer_id!, 'ACCEPTED')}>합류하기</button></div>}
        {item.type === 'team_invitation' && item.offer_status && item.offer_status !== 'PENDING' && <span className="notification-result"><Check />{item.offer_status === 'ACCEPTED' ? '합류 완료' : '처리 완료'}</span>}
        {item.team_id && <Link className="text-link" to={`/activity?team=${item.team_id}`}>활동 바로가기</Link>}
      </div>
    </article>)}</div>
  </>;
}
