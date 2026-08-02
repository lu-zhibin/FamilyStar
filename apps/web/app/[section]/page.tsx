import { notFound } from 'next/navigation';

import { ParentPortal } from '../../components/parent-portal';
import { isParentSection } from '../../lib/parent-portal';
import { requirePortalRole } from '../../lib/server-auth';

type SectionPageProps = Readonly<{ params: { section: string } }>;

export default async function SectionPage({ params }: SectionPageProps) {
  if (!isParentSection(params.section)) notFound();
  await requirePortalRole('parent');
  return <ParentPortal section={params.section} />;
}
