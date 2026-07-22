import { SignInForm } from "@/components/forms/AuthForms";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ check_email?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div>
      {sp.check_email && (
        <div className="mb-3 rounded-md border border-good/30 bg-good/10 px-3 py-2 text-2xs text-good">
          Account created. Check your email to confirm, then sign in.
        </div>
      )}
      <h1 className="mb-3 text-lg font-semibold">Sign in</h1>
      <SignInForm />
    </div>
  );
}
