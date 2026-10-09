"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import React from "react";

type ColorVariant =
  | "purple"
  | "amber"
  | "blue"
  | "indigo"
  | "cyan"
  | "emerald"
  | "rose";

type StatCardProps = {
  label: string;
  value: number;
  helper?: string;
  icon: React.ReactNode;
  color: ColorVariant;
  /** When set, entire card navigates here (keyboard + screen-reader friendly). */
  href?: string;
  /** Passed to Next.js `Link` — use `false` for same-page filter links to avoid jump-to-top. */
  linkScroll?: boolean;
};

/* 🎨 COLOR SYSTEM (STATIC — Tailwind Safe) */
const colorStyles: Record<ColorVariant, string> = {
  purple:
    "bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-slate-900 border-purple-200 dark:border-purple-700/40",
  amber:
    "bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-slate-900 border-amber-200 dark:border-amber-700/40",
  blue:
    "bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-slate-900 border-blue-200 dark:border-blue-700/40",
  indigo:
    "bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/40 dark:to-slate-900 border-indigo-200 dark:border-indigo-700/40",
  cyan:
    "bg-gradient-to-br from-cyan-100 to-cyan-50 dark:from-cyan-900/40 dark:to-slate-900 border-cyan-200 dark:border-cyan-700/40",
  emerald:
    "bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-slate-900 border-emerald-200 dark:border-emerald-700/40",
  rose:
    "bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-900/40 dark:to-slate-900 border-rose-200 dark:border-rose-700/40",
};

const iconStyles: Record<ColorVariant, string> = {
  purple: "bg-purple-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  cyan: "bg-cyan-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
};

export function StatCard({
  label,
  value,
  helper,
  icon,
  color,
  href,
  linkScroll,
}: StatCardProps) {
  const inner = (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 200 }}
      className={cn(
        "relative overflow-hidden rounded-2xl p-6 shadow-lg border transition-all duration-300",
        colorStyles[color],
        href && "group-hover:shadow-xl"
      )}
    >
      <div className="flex items-start justify-between">
        {/* LEFT CONTENT */}
        <div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {label}
          </p>

          <h3 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {value}
          </h3>

          {helper && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {helper}
            </p>
          )}
        </div>

        {/* ICON */}
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-2xl shadow-md",
            iconStyles[color]
          )}
        >
          {React.isValidElement(icon)
            ? React.cloneElement(
                icon as React.ReactElement<any, any>,
                {
                  className: cn("h-6 w-6 text-white", (icon as any)?.props?.className),
                }
              )
            : null}
      </div>
      </div>
    </motion.div>
  );

  if (href) {
    return (
      <Link
        href={href}
        scroll={linkScroll ?? true}
        className={cn(
          "group block rounded-2xl no-underline outline-none",
          "ring-offset-2 focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-offset-slate-950",
        )}
        aria-label={`${label}: ${value}${helper ? `. ${helper}` : ""}`}
      >
        {inner}
      </Link>
    );
  }

  return inner;
}
