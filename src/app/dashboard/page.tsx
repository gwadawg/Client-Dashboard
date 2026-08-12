import { redirect } from 'next/navigation';
import { createAuthClient, createServiceClient } from '@/lib/supabase';
import DashboardView from '@/components/DashboardView';
import type { AllowedPermissions } from '@/lib/permissions';
import type { View, TeamDashboardTab } from '@/lib/nav';
import type { ReportingType } from '@/lib/kpi-layouts';
import { defaultSeatForPayType } from '@/lib/team-dashboards/access';

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
      .select('id, name, is_live, reporting_type, launch_date, date_signed, lifecycle_status, churned_at')
      .order('name'),
  ]);

  const isOwner = profile?.is_owner ?? false;
  const isAdmin = profile?.is_admin ?? false;
  const allowedPermissions = (profile?.allowed_permissions ?? null) as AllowedPermissions;

  const homeSeat = defaultSeatForPayType(linkedAgent?.pay_type) as TeamDashboardTab | null;
  const homeView: View | null = homeSeat ? 'team_dashboard' : null;

  const initialClients = (clients ?? []).map(c => ({
    id: c.id as string,
    name: c.name as string,
    is_live: c.is_live as boolean | undefined,
    reporting_type: c.reporting_type as ReportingType | undefined,
    launch_date: (c.launch_date as string | null | undefined) ?? null,
    date_signed: (c.date_signed as string | null | undefined) ?? null,
    lifecycle_status: (c.lifecycle_status as string | null | undefined) ?? null,
    churned_at: (c.churned_at as string | null | undefined) ?? null,
  }));

  return (
    <DashboardView
      isOwner={isOwner}
      isAdmin={isAdmin}
      allowedPermissions={allowedPermissions}
      homeView={homeView}
      homeSeat={homeSeat}
      initialClients={initialClients}
    />
  );
}
