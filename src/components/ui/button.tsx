import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-accent text-slate-950 hover:bg-emerald-300 font-semibold",
  secondary: "bg-surface-2 text-slate-100 border border-border hover:border-accent/60",
  ghost: "text-slate-300 hover:bg-surface-2 hover:text-white",
  danger: "bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
} as const;

interface StyleProps {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export function buttonClass({ variant = "primary", size = "md" }: StyleProps = {}, className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & StyleProps) {
  return <button className={buttonClass({ variant, size }, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />;
}
