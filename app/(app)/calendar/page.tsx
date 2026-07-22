import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SlotControls } from "@/components/SlotControls";
import { shortDate } from "@/lib/format";
import type { CreativeSlot } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusTone: Record<string, "good" | "warn" | "bad" | "accent" | "muted"> = {
  proposed: "warn",
  approved: "good",
  edited: "accent",
  rejected: "bad",
  shipped: "accent",
};

export default async function CalendarPage() {
  const ctx = await requireMember("viewer");
  const db = await createClient();
  const canWrite = ctx.role !== "viewer";

  const { data: slots } = await db
    .from("creative_slots")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
    .order("slot_date", { ascending: true })
    .limit(200);

  const byDate = new Map<string, CreativeSlot[]>();
  for (const s of (slots as CreativeSlot[]) ?? []) {
    const arr = byDate.get(s.slot_date) ?? [];
    arr.push(s);
    byDate.set(s.slot_date, arr);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Creative calendar</h1>
        <p className="text-2xs text-muted">
          A rolling 2-week plan Atlas proposes; you approve, edit, or reject each
          slot. Creative ships before the peak, not after.
        </p>
      </div>

      {byDate.size === 0 ? (
        <EmptyState
          title="No creative slots yet"
          hint="Atlas proposes a 2-week calendar in its weekly run. Each slot carries a hook, full copy draft, visual brief, and intent."
        />
      ) : (
        <div className="space-y-4">
          {[...byDate.entries()].map(([date, daySlots]) => (
            <Card key={date} title={shortDate(date)}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {daySlots.map((s) => (
                  <div key={s.id} className="rounded-md border border-border bg-surface-2 p-3">
                    <div className="flex items-center justify-between">
                      <Badge tone={statusTone[s.status] ?? "muted"}>{s.status}</Badge>
                      <span className="text-2xs text-muted">
                        {s.geo ?? "—"} · {s.format ?? "—"}
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-medium text-fg">{s.hook}</div>
                    {s.copy_draft && (
                      <p className="mt-1 text-2xs text-fg-soft">{s.copy_draft}</p>
                    )}
                    {s.visual_brief && (
                      <p className="mt-1 text-2xs text-muted">Visual: {s.visual_brief}</p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-2xs text-muted">{s.intent ?? ""}</span>
                      {canWrite && <SlotControls slotId={s.id} />}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
