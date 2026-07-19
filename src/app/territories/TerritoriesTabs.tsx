"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ALL_LINKS = [
  { href: "/territories", label: "Map" },
  { href: "/territories/rules", label: "How to Play" },
  { href: "/territories/settlements", label: "Settlements", adminOnly: true },
  { href: "/territories/trends", label: "Trends" },
];

export default function TerritoriesTabs({ showSettlements }: { showSettlements: boolean }) {
  const pathname = usePathname();
  const links = ALL_LINKS.filter((link) => !link.adminOnly || showSettlements);

  return (
    <nav className="border-b border-[var(--panel-border)] mb-6">
      <div className="max-w-[1600px] mx-auto w-full px-6 flex items-center gap-1 h-12">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--panel-surface)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
