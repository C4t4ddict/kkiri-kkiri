type Props = { eyebrow: string; title: string; description?: string };

export function PageTitle({ eyebrow, title, description }: Props) {
  return <div className="page-title">
    <span className="eyebrow">{eyebrow}</span>
    <h1>{title}</h1>
    {description && <p>{description}</p>}
  </div>;
}
