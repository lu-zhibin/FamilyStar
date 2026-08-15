import { notFound } from 'next/navigation';

import { ChildPortal } from '../../../components/child-portal';
import { ChildNotificationsPortal } from '../../../components/notification-center';
import { isChildSection } from '../../../lib/child-portal';
import { requirePortalRole } from '../../../lib/server-auth';

type ChildSectionPageProps = Readonly<{ params: { section: string } }>;

export default async function ChildSectionPage({ params }: ChildSectionPageProps) {
  if (params.section === 'notifications') {
    await requirePortalRole('child');
    return <ChildNotificationsPortal />;
  }
  if (params.section === 'home' || !isChildSection(params.section)) notFound();
  await requirePortalRole('child');
  return <ChildPortal section={params.section} />;
}
