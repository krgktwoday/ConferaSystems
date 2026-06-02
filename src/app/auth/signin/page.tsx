/**
 * src/app/auth/signin/page.tsx
 *
 * Sign-in page for the Hotel/Venue Platform.
 * Uses a Server Action to call Auth.js signIn() with the credentials provider.
 * On success the user is redirected to /dashboard.
 */

import { redirect } from "next/navigation";
import { getServerSession, signIn } from "@/lib/auth";
import SignInForm from "./SignInForm";

export const metadata = {
  title: "Sign in — Hotel & Venue Platform",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  // If already authenticated, skip the sign-in page.
  const session = await getServerSession();
  if (session) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/dashboard";
  const error = params.error;

  /**
   * Server Action: called by the form on submit.
   * Auth.js signIn() handles the Credentials flow and sets the session cookie.
   */
  async function handleSignIn(formData: FormData) {
    "use server";
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl,
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Hotel &amp; Venue Platform
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Sign in to your property account
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
            {error === "CredentialsSignin"
              ? "Invalid email or password. Please try again."
              : "An error occurred. Please try again."}
          </div>
        )}

        <SignInForm action={handleSignIn} />
      </div>
    </main>
  );
}
