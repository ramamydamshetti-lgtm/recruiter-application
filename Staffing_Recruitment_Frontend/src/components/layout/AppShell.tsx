'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ClipboardList,
  FileText,
  LogOut,
  Menu,
  Send,
  User,
  UserPlus,
  X,
  Moon,
  Sun,
  Calendar,
  Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { NotificationCenter } from '@/lib/contexts/NotificationContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { normalizeAppRole, type AppRole } from '@/lib/auth/roles';
import { ClientContentProtection } from '@/components/security/ClientContentProtection';
import { GlobalBackNav } from '@/components/layout/GlobalBackNav';
import { markNavViaSidebar } from '@/lib/navigation/navigationSource';
import { bumpFormMountKey } from '@/lib/formDrafts';

type NavItem = {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  subItems?: Array<{
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
};

const SIDEBAR_WIDTH = 300;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const currentUserRole = normalizeAppRole(currentUser?.role);

  const pathname = usePathname();
  const router = useRouter();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;

    const applyDateMinimum = () => {
      const today = new Date().toISOString().slice(0, 10);
      document.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach((input) => {
        if (input.dataset.allowPastDate === 'true') return;
        if (input.dataset.managedDate === 'true') return;
        if (!input.min || input.min < today) {
          input.min = today;
        }
      });
    };

    const scheduleApply = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(applyDateMinimum, 50);
    };

    // Defer until after React hydration — synchronous DOM writes cause mismatches.
    const hydrationTimer = setTimeout(() => {
      applyDateMinimum();
      observer = new MutationObserver(scheduleApply);
      observer.observe(document.body, { childList: true, subtree: true });
    }, 0);

    return () => {
      clearTimeout(hydrationTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      observer?.disconnect();
    };
  }, []);

  const roleTheme: Record<AppRole, string> = {
    Recruiter: 'from-purple-600 to-indigo-600',
    Admin: 'from-purple-600 to-indigo-600',
    Lead: 'from-purple-600 to-indigo-600',
  };

  const handleSignOut = () => {
    localStorage.clear();
    sessionStorage.clear();
    router.push('/login');
  };

  const items = useMemo<NavItem[]>(
    () => [
      {
        label: 'My Work',
        href: '/my-work',
        icon: FileText,
      },
      { label: 'Requirements', href: '/requirements', icon: ClipboardList },
      { label: 'Add Candidate', href: '/candidates/new', icon: UserPlus },
      { label: 'Submissions', href: '/submissions', icon: Send },
      { label: 'Interview Tracking', href: '/interviews', icon: Calendar },
      { label: 'Reports', href: '/reports', icon: BarChart3 },
    ],
    [currentUserRole],
  );

  const isActive = (href?: string) => {
    if (!href) return false;
    if (href === '/candidates') {
      if (!pathname) return false;
      if (pathname === '/candidates') return true;
      if (pathname.startsWith('/candidates/') && !pathname.startsWith('/candidates/new')) return true;
      return false;
    }
    return pathname === href || pathname?.startsWith(`${href}/`);
  };

  const SidebarContent = () => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-16">

      <div className="flex justify-center items-center py-8 w-full px-4">
  {!collapsed && (
    <Link
      href="/my-work"
      onClick={() => markNavViaSidebar('/my-work')}
      className="flex flex-col items-center gap-2 group drop-shadow-lg hover:drop-shadow-xl transition hover:cursor-pointer rounded-3xl p-2"
    >
      <div className="">
        <Image
          src="/Logo.png"
          alt="MetaForge"
          width={180}
          height={90}
          priority
          className="object-contain"
        />
      </div>
    </Link>
  )}
</div>
        {/* Collapse button (desktop only) */}
        <button
          onClick={() => {
            setCollapsed(prev => !prev);
          }}
          className="hidden lg:block text-white hover:bg-white/10 p-2 rounded-lg transition"
        >
          <Menu size={18} />
        </button>

        {/* Close button (mobile only) */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden text-white hover:bg-white/10 p-2 rounded-lg transition"
        >
          <X size={18} />
        </button>
      </div>

      {/* Role Badge */}
      {!collapsed && (
        <div className="px-4 mb-4">
       
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-2 px-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const hasSubItems = item.subItems && item.subItems.length > 0;

          const navClass = cn(
            'group flex items-center gap-3 px-2 py-2 rounded-xl transition-all duration-300 cursor-pointer',
            active
              ? `bg-gradient-to-r ${roleTheme[currentUserRole]} text-white shadow-lg`
              : 'text-slate-300 hover:bg-white/10 hover:text-white',
          );

          // Regular items without sub-items
          return (
            <motion.div
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              key={item.label}
            >
              <Link
                href={item.href!}
                className={navClass}
                onClick={() => {
                  markNavViaSidebar(item.href!);
                  if (item.href === '/candidates/new') {
                    bumpFormMountKey('candidate_entry');
                  }
                  setMobileOpen(false);
                }}
              >
                <div className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/10">
                  <Icon className="h-5 w-5" />
                </div>
                {!collapsed && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
              </Link>
            </motion.div>
          );
        })}
      </nav>

      <div className="space-y-2 px-3 pb-3 pt-2">
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <Link
            href="/my-profile"
            onClick={() => {
              markNavViaSidebar('/my-profile');
              setMobileOpen(false);
            }}
            className={cn(
              'group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-all duration-300',
              isActive('/my-profile')
                ? `bg-gradient-to-r ${roleTheme[currentUserRole]} text-white shadow-lg`
                : 'text-slate-300 hover:bg-white/10 hover:text-white',
            )}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
              <User className="h-5 w-5" />
            </div>
            {!collapsed && <span className="text-sm font-medium">My Profile</span>}
          </Link>
        </motion.div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleSignOut}
          className={cn(
            'group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-slate-300 transition-all duration-300',
            'hover:bg-white/10 hover:text-white',
          )}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
            <LogOut className="h-5 w-5" />
          </div>
          {!collapsed && <span className="text-sm font-medium">Logout</span>}
        </motion.button>
      </div>

    </>
  );

  return (
    <div
      className="min-h-screen bg-slate-100 dark:bg-slate-950 transition-colors"
      style={{ '--app-sidebar-width': collapsed ? '90px' : `${SIDEBAR_WIDTH}px` } as React.CSSProperties}
    >
      <ClientContentProtection />

      {/* ===== MOBILE TOP HEADER ===== */}
      <div className="lg:hidden flex items-center justify-between px-4 h-14 bg-white dark:bg-slate-900 shadow">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
         
          <NotificationCenter />
        </div>
      </div>

      {/* ===== DESKTOP SIDEBAR ===== */}
      <motion.aside
        animate={{ width: collapsed ? 90 : SIDEBAR_WIDTH }}
        transition={{ duration: 0.3 }}
        className="fixed inset-y-0 left-0 z-20 hidden lg:flex flex-col
       bg-[radial-gradient(circle_at_top_left,_#1e3a5f,_#0b1120_62%)]

        shadow-2xl border-r border-white/10 backdrop-blur-xl"
      >
        <SidebarContent />
      </motion.aside>

      {/* ===== MOBILE SIDEBAR ===== */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-30"
              onClick={() => setMobileOpen(false)}
            />

            {/* Drawer */}
            <motion.aside
              initial={{ x: -SIDEBAR_WIDTH }}
              animate={{ x: 0 }}
              exit={{ x: -SIDEBAR_WIDTH }}
              transition={{ duration: 0.3 }}
              className="fixed inset-y-0 left-0 z-40 w-[300px] flex flex-col
              bg-[radial-gradient(circle_at_top_left,_#1e3a5f,_#0b1120_62%)]
              shadow-2xl border-r border-white/10 backdrop-blur-xl"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ===== MAIN CONTENT ===== */}
      <div
        className={cn(
          'transition-all',
          collapsed ? 'lg:pl-[90px]' : 'lg:pl-[300px]'
        )}
      >
        <main className="p-4 lg:p-8">
          <GlobalBackNav />
          {children}
        </main>
      </div>
    </div>
  );
}
