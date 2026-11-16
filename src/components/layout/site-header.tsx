"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { XpBadge } from "./xp-badge";

const links = [
  { href: "/learn", label: "Belajar" },
  { href: "/lab", label: "Lab" },
  { href: "/tools/subnet", label: "Kalkulator Subnet" },
  { href: "/dashboard", label: "Dashboard" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-white">
          <ShieldCheck className="size-6 text-accent" />
          <span>
            NetSec<span className="text-accent">Lab</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                pathname.startsWith(l.href) ? "bg-surface-2 text-white" : "text-muted hover:text-white",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <XpBadge />
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-border px-2 py-1 md:hidden">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn("shrink-0 rounded-md px-3 py-1 text-xs", pathname.startsWith(l.href) ? "bg-surface-2 text-white" : "text-muted")}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
