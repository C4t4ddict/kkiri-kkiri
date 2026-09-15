type Props = { eyebrow?: string; title: string; description?: string };

export function PageTitle({ title, description }: Props) {
  return <div className="page-title">
    <h1>{title}</h1>
    {description && <p>{description}</p>}
  </div>;
}
