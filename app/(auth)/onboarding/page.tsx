import { redirect } from "next/navigation";
import { WorkspaceForm } from "@/components/forms/AuthForms";
import { getUser, listMemberships } from "@/lib/auth";

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const memberships = await listMemberships();
  if (memberships.length > 0) redirect("/");

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Create your workspace</h1>
      <p className="mb-4 text-2xs text-muted">
        A workspace holds your ad accounts, outcomes, rules, and briefs. Rules
        start in shadow mode — nothing touches spend until you arm them.
      </p>
      <WorkspaceForm />
    </div>
  );
}
