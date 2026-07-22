"use client";

import { useTransition } from "react";
import { updateSlotStatus } from "@/lib/actions/calendar";

export function SlotControls({ slotId }: { slotId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1.5">
      <button
        disabled={pending}
        onClick={() => start(() => updateSlotStatus(slotId, "approved"))}
        className="rounded bg-good/20 px-2 py-0.5 text-2xs text-good disabled:opacity-50"
      >
        Approve
      </button>
      <button
        disabled={pending}
        onClick={() => start(() => updateSlotStatus(slotId, "rejected"))}
        className="rounded bg-bad/20 px-2 py-0.5 text-2xs text-bad disabled:opacity-50"
      >
        Reject
      </button>
      <button
        disabled={pending}
        onClick={() => start(() => updateSlotStatus(slotId, "shipped"))}
        className="rounded bg-accent/20 px-2 py-0.5 text-2xs text-accent disabled:opacity-50"
      >
        Shipped
      </button>
    </div>
  );
}
