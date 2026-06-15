import { redirect } from 'next/navigation';
import { createAuthClient, createServiceClient } from '@/lib/supabase';
import DashboardView from '@/components/DashboardView';
import type { AllowedPermissions } from '@/lib/permissions';

export default async function DashboardPage() {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const service = createServiceClient();
  const { data: profile } = await service
    .from('profiles')
    .select('is_owner, is_admin, allowed_permissions')
    .eq('id', user.id)
    .maybeSingle();

  const isOwner = profile?.is_owner ?? false;
  const isAdmin = profile?.is_admin ?? false;
  const allowedPermissions = (profile?.allowed_permissions ?? null) as AllowedPermissions;

  return <DashboardView isOwner={isOwner} isAdmin={isAdmin} allowedPermissions={allowedPermissions} />;
}
