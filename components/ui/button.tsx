import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-emerald-700 text-white shadow-soft hover:bg-emerald-800 focus-visible:outline-emerald-600",
  secondary:
    "border border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-50 focus-visible:outline-ink-500",
  ghost: "text-ink-700 hover:bg-ink-100 focus-visible:outline-ink-500",
  danger:
    "border border-garnet-200 bg-garnet-50 text-garnet-800 hover:bg-garnet-100 focus-visible:outline-garnet-500",
  dark: "bg-ink-900 text-white hover:bg-ink-800 focus-visible:outline-ink-700"
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base"
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

export function ButtonLink({
  className,
  variant = "primary",
  size = "md",
  href,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
