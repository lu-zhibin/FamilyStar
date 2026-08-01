import { notFound } from 'next/navigation';

import { ChildPortal } from '../../../components/child-portal';
import { isChildSection } from '../../../lib/child-portal';

type ChildSectionPageProps = Readonly<{ params: { section: string } }>;

export default function ChildSectionPage({ params }: ChildSectionPageProps) {
  if (params.section === 'home' || !isChildSection(params.section)) notFound();
  return <ChildPortal section={params.section} />;
}
