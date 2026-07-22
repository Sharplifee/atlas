import { Nav } from "@/components/Nav";
import { NotConfigured } from "@/components/NotConfigured";
import { Badge } from "@/components/ui/Badge";
import { env } from "@/lib/env";
import { requireMember } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!env.isConfigured()) return <NotConfigured />;

  const ctx = await requireMember("viewer");
  const shadow = (ctx.workspace.settings as any)?.atlas?.shadow !== false;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface/40 px-3 py-4">
        <div className="px-3">
          <div className="text-sm font-semibold tracking-tight text-fg">
            ATLAS
          </div>
          <div className="mt-0.5 text-2xs text-muted">
            advertising intelligence
          </div>
        </div>

        <div className="mt-4 rounded-md border border-border bg-surface px-3 py-2">
          <div className="truncate text-sm text-fg" title={ctx.workspace.name}>
            {ctx.workspace.name}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge tone="muted">{ctx.role}</Badge>
            {shadow ? (
              <Badge tone="warn">shadow</Badge>
            ) : (
              <Badge tone="good">armed</Badge>
            )}
          </div>
        </div>

        <div className="mt-4 flex-1">
          <Nav />
        </div>

        <form action={signOut} className="px-1">
          <button
            type="submit"
            className="w-full rounded-md px-3 py-1.5 text-left text-2xs text-muted hover:text-fg"
          >
            Sign out · {ctx.email}
          </button>
        </form>
      </aside>

      <main className="flex-1 overflow-x-hidden px-8 py-6">{children}</main>
    </div>
  );
}
