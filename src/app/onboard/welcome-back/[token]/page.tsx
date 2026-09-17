import type { Metadata } from "next";
import WelcomeBackForm from "@/components/onboarding/WelcomeBackForm";

export const metadata: Metadata = {
  title: "Welcome back — Waiz Media",
  description: "Confirm or update your information to get set back up with Waiz Media.",
};

export default async function WelcomeBackOnboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <WelcomeBackForm token={token} />;
}
