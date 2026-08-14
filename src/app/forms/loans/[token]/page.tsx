import LoanLogForm from "@/components/loan-log/LoanLogForm";

export default async function LoanLogPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <LoanLogForm token={decodeURIComponent(token)} />;
}
