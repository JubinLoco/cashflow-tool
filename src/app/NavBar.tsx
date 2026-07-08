"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NavBar() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="flex gap-4 items-center p-4 border-b text-sm">
      <a className="underline" href="/">
        Home
      </a>
      <a className="underline" href="/forecast">
        Forecast
      </a>
      <a className="underline" href="/dashboard">
        Dashboard
      </a>
      <a className="underline" href="/settings">
        Settings
      </a>
      <button onClick={handleSignOut} className="underline ml-auto">
        Sign out
      </button>
    </nav>
  );
}
