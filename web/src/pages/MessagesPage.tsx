import { Check, MessageCircle, Search, Send, UserPlus, UsersRound, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { ConversationSummary, FriendOverview, FriendSearchResult, MessageThread } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { UserAvatar } from '../shared/ui/UserAvatar';

const timeLabel = (value?: string | null) => value
  ? new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '';

export function MessagesPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const selectedFriendId = Number(params.get('friend') || 0);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const friends = useAsync(() => api<FriendOverview>('/api/friends'), []);
  const conversations = useAsync(() => api<ConversationSummary[]>('/api/messages/conversations'), []);
  const thread = useAsync(() => selectedFriendId
    ? api<MessageThread>(`/api/messages/${selectedFriendId}`)
    : Promise.resolve<MessageThread | null>(null), [selectedFriendId]);

  useEffect(() => {
    if (!selectedFriendId && conversations.data?.[0]) {
      setParams({ friend: String(conversations.data[0].friend_id) }, { replace: true });
    }
  }, [conversations.data, selectedFriendId, setParams]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      api<FriendSearchResult[]>(`/api/friends/search?q=${encodeURIComponent(term)}`)
        .then(setSearchResults)
        .catch((reason) => setError(reason instanceof Error ? reason.message : '사용자를 검색하지 못했습니다'))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const refreshAll = async () => {
    await Promise.all([friends.reload(), conversations.reload()]);
    if (query.trim().length >= 2) {
      setSearchResults(await api<FriendSearchResult[]>(`/api/friends/search?q=${encodeURIComponent(query.trim())}`));
    }
  };
  const updateRequest = async (friendshipId: number, status: 'ACCEPTED' | 'REJECTED') => {
    setError('');
    try {
      await api(`/api/friends/requests/${friendshipId}`, { method: 'PUT', body: JSON.stringify({ status }) });
      await refreshAll();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '친구 요청을 처리하지 못했습니다');
    }
  };
  const requestFriend = async (recipientId: number) => {
    setError('');
    try {
      await api('/api/friends/requests', { method: 'POST', body: JSON.stringify({ recipient_id: recipientId }) });
      await refreshAll();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '친구 요청을 보내지 못했습니다');
    }
  };
  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const content = message.trim();
    if (!selectedFriendId || !content) return;
    setError('');
    try {
      await api(`/api/messages/${selectedFriendId}`, { method: 'POST', body: JSON.stringify({ content }) });
      setMessage('');
      await Promise.all([thread.reload(), conversations.reload()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '쪽지를 보내지 못했습니다');
    }
  };

  return <div className="messages-page">
    <header className="messages-page-head"><h1>쪽지함</h1><p>친구와 활동 아이디어와 팀 소식을 편하게 나눠보세요.</p></header>
    {error && <div className="form-error">{error}</div>}
    <div className="messages-layout">
      <aside className="message-sidebar">
        <label className="message-friend-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, 이메일로 친구 찾기" /></label>
        {query.trim().length >= 2 && <div className="friend-search-results"><strong>{searching ? '검색 중…' : '사용자 검색'}</strong>{searchResults.map((item) => <article key={item.user_id}><UserAvatar user={{ id: item.user_id, name: item.name, email: item.email, department: item.department, profile_picture: item.profile_picture }} /><div><b>{item.name}</b><small>{item.department || item.email}</small></div>{item.relationship === 'NONE' && <button onClick={() => requestFriend(item.user_id)} aria-label={`${item.name}님에게 친구 요청`}><UserPlus /></button>}{item.relationship === 'OUTGOING' && <em>요청됨</em>}{item.relationship === 'FRIEND' && <em>친구</em>}{item.relationship === 'INCOMING' && item.friendship_id && <span><button onClick={() => updateRequest(Number(item.friendship_id), 'ACCEPTED')}><Check /></button><button onClick={() => updateRequest(Number(item.friendship_id), 'REJECTED')}><X /></button></span>}</article>)}</div>}
        {Boolean(friends.data?.incoming.length) && <section className="friend-requests"><h2>받은 친구 요청 <span>{friends.data?.incoming.length}</span></h2>{friends.data?.incoming.map((item) => <article key={item.friendship_id}><UserAvatar user={{ id: item.user_id, name: item.name, email: item.email, department: item.department, profile_picture: item.profile_picture }} /><div><strong>{item.name}</strong><small>{item.department || item.email}</small></div><span><button onClick={() => updateRequest(item.friendship_id, 'ACCEPTED')} aria-label="수락"><Check /></button><button onClick={() => updateRequest(item.friendship_id, 'REJECTED')} aria-label="거절"><X /></button></span></article>)}</section>}
        <section className="conversation-list"><h2>친구 쪽지</h2><PageState loading={conversations.loading} error={conversations.error} empty={!conversations.loading && !conversations.data?.length ? '친구를 추가하면 쪽지를 보낼 수 있어요.' : undefined} />{conversations.data?.map((item) => <button className={selectedFriendId === item.friend_id ? 'active' : ''} onClick={() => setParams({ friend: String(item.friend_id) })} key={item.friend_id}><UserAvatar user={{ id: item.friend_id, name: item.name, email: '', department: item.department, profile_picture: item.profile_picture }} /><div><strong>{item.name}</strong><p>{item.last_message || '새 대화를 시작해보세요'}</p></div><span><small>{timeLabel(item.last_message_at)}</small>{Boolean(item.unread_count) && <em>{item.unread_count}</em>}</span></button>)}</section>
      </aside>
      <section className="message-thread">
        {selectedFriendId && thread.data?.friend ? <>
          <header><UserAvatar user={{ id: thread.data.friend.user_id, name: thread.data.friend.name, email: '', department: thread.data.friend.department, profile_picture: thread.data.friend.profile_picture }} /><div><h2>{thread.data.friend.name}</h2><p>{thread.data.friend.department || '끼리끼리 친구'}</p></div></header>
          <div className="message-bubbles">{thread.data.messages.length ? thread.data.messages.map((item) => <article className={item.sender_id === user?.id ? 'mine' : ''} key={item.message_id}><p>{item.content}</p><time>{timeLabel(item.created_at)}</time></article>) : <div className="thread-empty"><MessageCircle /><h3>첫 쪽지를 보내보세요</h3><p>활동이나 커리큘럼 이야기를 시작해보세요.</p></div>}</div>
          <form className="message-compose" onSubmit={sendMessage}><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={2} placeholder="쪽지를 입력하세요" /><button disabled={!message.trim()} aria-label="쪽지 보내기"><Send /></button></form>
        </> : <div className="thread-placeholder"><UsersRound /><h2>대화할 친구를 선택하세요</h2><p>왼쪽에서 친구를 선택하거나 새로운 친구를 찾아보세요.</p></div>}
      </section>
    </div>
  </div>;
}
