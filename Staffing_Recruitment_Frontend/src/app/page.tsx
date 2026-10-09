'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Award, Sparkles, TrendingUp, Heart } from 'lucide-react';
import { APP_NAME, APP_NAME_SHORT, COMPANY_NAME } from '@/lib/branding';

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100/80 to-[#e8edf5] dark:from-slate-950 dark:via-slate-900 dark:to-[#0b1120]">
      {/* Top Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="flex items-center gap-4 ml-8">
          <Image 
            src="/Metaforge_Logo.png" 
            alt={`${APP_NAME} — ${COMPANY_NAME}`}
            width={180} 
            height={60} 
            className="object-contain"
          />
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-xl bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-[#152a45]"
        >
          Login
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      {/* Hero & Intro */}
      <main className=" pt-28 pb-20 px-4 md:px-6 max-w-7xl mx-auto">
        <section className="text-center mb-16">
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-slate-100 to-[#e8edf5] dark:from-slate-800/50 dark:to-slate-900/50 rounded-full border border-slate-200/80 dark:border-slate-700">
              <Heart className="h-4 w-4 text-[#7c2d3a] animate-pulse" />
              <span className="text-sm font-medium text-[#1e3a5f] dark:text-slate-200">
                Built for recruiters who move fast
              </span>
              <Heart className="h-4 w-4 text-red-500 animate-pulse" />
            </div>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-slate-900 dark:text-white tracking-tight mb-4">
            <span className="block text-slate-800 dark:text-slate-100">Welcome to</span>
            <span className="block bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] bg-clip-text text-transparent">
              {APP_NAME}
            </span>
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Run requirements, candidates, and submissions in one calm, professional workspace — so you can focus on{' '}
            <span className="font-semibold text-[#1e3a5f] dark:text-slate-200">people and outcomes</span>.
          </p>
        </section>

        {/* Company Introduction */}
        <section className="space-y-8">
          <h2 className="font-display text-2xl font-semibold text-slate-800 dark:text-slate-100">
            About {COMPANY_NAME}
          </h2>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-50 to-[#eef2f8] dark:from-slate-900/40 dark:to-slate-900/20 p-6 shadow-sm hover:shadow-lg transition-all hover:scale-105">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#1e3a5f] to-[#2d4a6f] flex items-center justify-center mb-4">
                <Award className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2">Elite Recruiter</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Join our community of top-performing recruiters changing lives daily.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 p-6 shadow-sm hover:shadow-lg transition-all hover:scale-105">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-600 to-green-600 flex items-center justify-center mb-4">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2">Career Growth</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Accelerate your career with industry-leading tools and insights.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-6 shadow-sm hover:shadow-lg transition-all hover:scale-105">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2">Smart Matching</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                AI-powered tools to find the perfect candidate every time.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-6 shadow-sm hover:shadow-lg transition-all hover:scale-105">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center mb-4">
                <Heart className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2">Make an Impact</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Transform careers and build the future, one placement at a time.
              </p>
            </div>
          </div>

          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            {COMPANY_NAME} delivers recruitment and technology solutions that help teams source, assess, and
            place talent with confidence. The {APP_NAME} brings requirements, candidates, submissions, and
            reporting together so your process stays clear from intake to offer.
          </p>
        </section>

        {/* CTA */}
        <section className="mt-16 text-center">
          <div className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-[#1e3a5f] to-[#152a45] text-white shadow-xl">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-medium uppercase tracking-wider">Exclusive Access</span>
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-2xl font-bold mb-2">Ready to Transform Lives?</h3>
            <p className="text-slate-200 mb-6">
              Sign in to open your workspace and continue where you left off.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-white text-[#1e3a5f] px-8 py-4 text-base font-bold shadow-lg transition hover:bg-slate-100 hover:scale-[1.02]"
            >
              Sign in to {APP_NAME_SHORT}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            ⭐ Trusted by 500+ recruiters worldwide • 🏆 Industry-leading platform • 🚀 Join the revolution
          </p>
        </section>
      </main>
    </div>
  );
}
