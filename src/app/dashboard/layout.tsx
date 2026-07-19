import DashboardTabs from "./DashboardTabs";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="p-10 font-sans max-w-[1800px] w-full mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>
      <DashboardTabs />
      {children}
    </main>
  );
}
