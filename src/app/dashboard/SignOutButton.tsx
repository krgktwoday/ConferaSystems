"use client";

/**
 * src/app/dashboard/SignOutButton.tsx
 *
 * Client component for the sign-out button.
 * Calls Auth.js signOut() via a server action passed as prop.
 */

import { useTransition } from "react";

interface SignOutButtonProps {
  action: () => Promise<void>;
}

export default function SignOutButton({ action }: SignOutButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => action())}
      disabled={isPending}
      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
    >
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
