import { redirect } from 'next/navigation';
import { createAuthClient, createServiceClient } from '@/lib/supabase';
import DashboardView from '@/components/DashboardView';
import type { AllowedPermissions } from '@/lib/permissions';
import type { View } from '@/lib/nav';
import type { ReportingType } from '@/lib/kpi-layouts';

export default async function DashboardPage() {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const service = createServiceClient();
  const [{ data: profile }, { data: linkedAgent }, { data: clients }] = await Promise.all([
    service
      .from('profiles')
      .select('is_owner, is_admin, allowed_permissions')
      .eq('id', user.id)
      .maybeSingle(),
    service
      .from('agents')
      .select('pay_type')
      .eq('user_id', user.id)
      .maybeSingle(),
    service
      .from('clients')
      .select('id, name, is_live, reporting_type')
      .order('name'),
  ]);

  const isOwner = profile?.is_owner ?? false;
  const isAdmin = profile?.is_admin ?? false;
  const allowedPermissions = (profile?.allowed_permissions ?? null) as AllowedPermissions;

  const homeView: View | null =
    linkedAgent?.pay_type === 'ccm'
      ? 'team_dashboard_ccm'
      : linkedAgent?.pay_type === 'media_buyer'
        ? 'team_dashboard_media'
        : null;

  const initialClients = (clients ?? []).map(c => ({
    id: c.id as string,
    name: c.name as string,
    is_live: c.is_live as boolean | undefined,
    reporting_type: c.reporting_type as ReportingType | undefined,
  }));

  return (
    <DashboardView
      isOwner={isOwner}
      isAdmin={isAdmin}
      allowedPermissions={allowedPermissions}
      homeView={homeView}
      initialClients={initialClients}
    />
  );
}
