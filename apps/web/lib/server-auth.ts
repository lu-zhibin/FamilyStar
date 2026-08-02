import type { ApiResponse } from '@familystar/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import type { SessionIdentity } from './auth';

type PortalRole = SessionIdentity['role'];

function apiInternalUrl(): string {
  const value = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('API_INTERNAL_URL must be an HTTP(S) URL without credentials.');
  }
  return url.toString().replace(/\/$/, '');
}

export async function readPortalSession(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<SessionIdentity | null> {
  try {
    const response = await fetcher(`${apiInternalUrl()}/api/v1/auth/session`, {
      cache: 'no-store',
      headers: { Cookie: `familystar_session=${token}` },
    });
    const payload = (await response
      .json()
      .catch(() => null)) as ApiResponse<SessionIdentity> | null;
    return response.ok && payload?.success ? payload.data : null;
  } catch {
    return null;
  }
}

export async function requirePortalRole(expectedRole: PortalRole): Promise<void> {
  const token = cookies().get('familystar_session')?.value;
  if (!token) redirect('/');

  const session = await readPortalSession(token);
  if (!session) redirect('/');
  if (session.role !== expectedRole) {
    redirect(session.role === 'parent' ? '/dashboard' : '/child');
  }
}
