'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ClipboardList, Mail, Lock, ArrowRight, KeyRound } from 'lucide-react';
import { APP_NAME } from '@/lib/branding';

type LoginMode = 'password' | 'code';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<LoginMode>('password');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [registeredBanner, setRegisteredBanner] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('registered') !== '1') return;

    const sent = q.get('emailSent');
    if (sent === '1') {
      setRegisteredBanner(
        'Account created. Check your Outlook inbox (and Junk) for the welcome email, then sign in below.',
      );
    } else if (sent === '0') {
      setRegisteredBanner(
        'Account created. We could not send the welcome email (check server SMTP in .env). You can still sign in below.',
      );
    } else {
      setRegisteredBanner('Account created successfully. Sign in with your password or request an email code.');
    }

    window.history.replaceState({}, '', '/login');
  }, []);

  useEffect(() => {
    setError('');
    setCodeSent(false);
    setCode('');
  }, [mode]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { login } = await import('@/lib/api/auth');
      await login(email, password);
      window.location.assign('/my-work');
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    setError('');
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setSendingCode(true);
    try {
      const { sendLoginOtp } = await import('@/lib/api/auth');
      await sendLoginOtp(email.trim());
      setCodeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (code.trim().length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      const { verifyLoginOtp } = await import('@/lib/api/auth');
      await verifyLoginOtp(email.trim(), code.trim());
      window.location.assign('/my-work');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code.');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100/90 to-[#e8edf5] dark:from-slate-950 dark:via-slate-900 dark:to-[#0b1120] px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-xl">
        <div className="mb-8 flex justify-center">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-[#1e3a5f] to-[#152a45] text-white shadow-md">
            <ClipboardList className="h-7 w-7" />
          </div>
        </div>
        <h1 className="font-display text-center text-xl font-semibold text-slate-800 dark:text-slate-100">
          Sign in
        </h1>
        <p className="mt-2 text-center text-sm font-medium text-[#1e3a5f] dark:text-slate-300">
          {APP_NAME}
        </p>
        <p className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
          Use your password or a one-time code sent to your email
        </p>

        <div className="mt-6 flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-100/80 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={() => setMode('password')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              mode === 'password'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => setMode('code')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              mode === 'code'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Email code
          </button>
        </div>

        {registeredBanner && (
          <div className="mt-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200 border border-emerald-200/60 dark:border-emerald-800/60">
            {registeredBanner}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 pl-10 pr-4 py-3 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
              />
            </div>
          </div>

          {mode === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 pl-10 pr-4 py-3 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign in'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}

          {mode === 'code' && (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                We&apos;ll email a 6-digit code to your inbox (valid 10 minutes). Use the same email you registered with.
              </p>
              <button
                type="button"
                onClick={handleSendCode}
                disabled={sendingCode || !email.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-sm font-semibold text-blue-700 dark:text-blue-300 transition hover:bg-blue-100 dark:hover:bg-blue-950/60 disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                {sendingCode ? 'Sending…' : codeSent ? 'Resend code' : 'Send code to my email'}
              </button>

              <div>
                <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Sign-in code
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-center text-2xl tracking-[0.4em] font-mono text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.trim().length !== 6}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying…' : 'Sign in with code'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
            Sign up
          </Link>
        </p>
      </div>

      <Link
        href="/"
        className="mt-6 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
      >
        ← Back to Welcome
      </Link>
    </div>
  );
}
