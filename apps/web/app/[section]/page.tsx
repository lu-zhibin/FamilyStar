import { notFound } from 'next/navigation';

import { ParentPortal } from '../../components/parent-portal';
import { ParentNotificationsPortal } from '../../components/notification-center';
import { isParentSection } from '../../lib/parent-portal';
import { requirePortalRole } from '../../lib/server-auth';

type SectionPageProps = Readonly<{ params: { section: string } }>;

export default async function SectionPage({ params }: SectionPageProps) {
  if (params.section === 'notifications') {
    await requirePortalRole('parent');
    return <ParentNotificationsPortal />;
  }
  if (!isParentSection(params.section)) notFound();
  await requirePortalRole('parent');
  return <ParentPortal section={params.section} />;
}
