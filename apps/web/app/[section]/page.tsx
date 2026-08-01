import { notFound } from 'next/navigation';

import { ParentPortal } from '../../components/parent-portal';
import { isParentSection } from '../../lib/parent-portal';

type SectionPageProps = Readonly<{ params: { section: string } }>;

export default function SectionPage({ params }: SectionPageProps) {
  if (!isParentSection(params.section)) notFound();
  return <ParentPortal section={params.section} />;
}
