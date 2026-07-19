"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/auth/role";

export default function NavBar({ role }: { role: Role }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="flex gap-4 items-center p-4 border-b text-sm">
      {role === "admin" ? (
        <>
          <Link className="underline" href="/">
            Home
          </Link>
          <a className="underline" href="/forecast">
            Forecast
          </a>
          <a className="underline" href="/dashboard/cashflow">
            Dashboard
          </a>
          <a className="underline" href="/settings">
            Settings
          </a>
          <a className="underline" href="/territories">
            Territories
          </a>
        </>
      ) : (
        <>
          <a className="underline" href="/dashboard/weekly">
            Home
          </a>
          <a className="underline" href="/territories">
            Territories
          </a>
        </>
      )}
      <button onClick={handleSignOut} className="underline ml-auto">
        Sign out
      </button>
    </nav>
  );
}
