import TerritoriesTabs from "./TerritoriesTabs";
import { getCurrentUserRole } from "@/lib/auth/role";

export default async function TerritoriesLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentUserRole();

  return (
    <>
      <TerritoriesTabs showSettlements={role === "admin"} />
      {children}
    </>
  );
}
