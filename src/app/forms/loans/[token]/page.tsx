import ClientLogShell from "@/components/loan-log/ClientLogShell";

export default async function LoanLogPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ClientLogShell token={decodeURIComponent(token)} />;
}
