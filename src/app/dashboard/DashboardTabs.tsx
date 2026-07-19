"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard/cashflow", label: "Cashflow" },
  { href: "/dashboard/weekly", label: "Weekly by business line" },
  { href: "/dashboard/monthly", label: "Monthly P&L and equity" },
];

export default function DashboardTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 text-sm mb-8 border-b">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-2 -mb-px border-b-2 ${
              active ? "border-foreground font-medium" : "border-transparent text-zinc-500"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
