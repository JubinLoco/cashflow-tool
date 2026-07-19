import DashboardTabs from "./DashboardTabs";
import { getCurrentUserRole } from "@/lib/auth/role";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentUserRole();

  return (
    <main className="p-10 font-sans max-w-[1800px] w-full mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>
      {role === "admin" && <DashboardTabs />}
      {children}
    </main>
  );
}
