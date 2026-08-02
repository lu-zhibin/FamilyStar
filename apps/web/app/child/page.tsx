import { ChildPortal } from '../../components/child-portal';
import { requirePortalRole } from '../../lib/server-auth';

export default async function ChildHomePage() {
  await requirePortalRole('child');
  return <ChildPortal section="home" />;
}
