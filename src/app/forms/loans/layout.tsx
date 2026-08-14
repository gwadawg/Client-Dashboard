export default function LoanLogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-auto"
      style={{ background: "#F5F7FB", color: "#0B1220" }}
    >
      {children}
    </div>
  );
}
