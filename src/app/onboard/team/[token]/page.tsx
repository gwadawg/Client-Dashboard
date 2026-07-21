import TeamInviteForm from "@/components/onboarding/TeamInviteForm";

export default async function TeamInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <TeamInviteForm token={token} />;
}
