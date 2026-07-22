import { NotConfigured } from "@/components/NotConfigured";
import { env } from "@/lib/env";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!env.isConfigured()) return <NotConfigured />;
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-6">
        <div className="text-xl font-semibold tracking-tight">ATLAS</div>
        <div className="mt-1 text-2xs text-muted">
          advertising intelligence — judged on outcomes, not clicks
        </div>
      </div>
      {children}
    </div>
  );
}
