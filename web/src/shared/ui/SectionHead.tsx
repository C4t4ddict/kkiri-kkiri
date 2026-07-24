import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function SectionHead({ title, link }: { title: string; link?: string }) {
  return <div className="section-head">
    <h2>{title}</h2>
    {link && <Link to={link}>전체보기 <ChevronRight size={16} /></Link>}
  </div>;
}
