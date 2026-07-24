type Props = { loading?: boolean; error?: string; empty?: string };

export function PageState({ loading, error, empty }: Props) {
  if (loading) return <div className="state-card">불러오는 중…</div>;
  if (error) return <div className="state-card error">{error}</div>;
  if (empty) return <div className="state-card">{empty}</div>;
  return null;
}
