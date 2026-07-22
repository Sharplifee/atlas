"use client";

import { useTransition } from "react";
import { Toggle } from "@/components/ui/Toggle";
import {
  setRuleFlag,
  approveAction,
  revertAction,
  armWorkspace,
} from "@/lib/actions/rules";
import type { RuleKey } from "@/lib/types";

export function RuleToggles({
  ruleKey,
  enabled,
  armed,
}: {
  ruleKey: RuleKey;
  enabled: boolean;
  armed: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      <Toggle
        checked={enabled}
        onChange={(next) => setRuleFlag(ruleKey, { enabled: next })}
        labelOn="enabled"
        labelOff="disabled"
      />
      <Toggle
        checked={armed}
        disabled={!enabled}
        toneOn="bad"
        onChange={(next) => setRuleFlag(ruleKey, { armed: next })}
        labelOn="armed"
        labelOff="shadow"
      />
    </div>
  );
}

export function ApproveRevert({
  eventId,
  reverted,
}: {
  eventId: string;
  reverted: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() => start(() => approveAction(eventId))}
        className="rounded-md bg-good/20 px-2 py-1 text-2xs text-good disabled:opacity-50"
      >
        Approve
      </button>
      <button
        disabled={pending || reverted}
        onClick={() => start(() => revertAction(eventId))}
        className="rounded-md bg-bad/20 px-2 py-1 text-2xs text-bad disabled:opacity-50"
      >
        {reverted ? "Reverted" : "Revert"}
      </button>
    </span>
  );
}

export function ArmSwitch({ shadow }: { shadow: boolean }) {
  return (
    <Toggle
      checked={!shadow}
      toneOn="bad"
      onChange={(next) => armWorkspace(!next)}
      labelOn="ARMED — actions execute"
      labelOff="SHADOW — nothing touched"
    />
  );
}
