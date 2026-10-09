import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import '@/app/globals.css';
import { ConditionalAppShell } from '@/components/layout/ConditionalAppShell';
import { AuthProvider } from '@/lib/contexts/AuthContext';
import { RequirementsProvider } from '@/lib/domain/requirements/store';
import { CandidatesProvider } from '@/lib/domain/candidates/store';
import { SubmissionsProvider } from '@/lib/domain/submissions/store';
import { ThemeProvider } from '@/lib/contexts/ThemeContext';
import { ThemeInitializer } from '@/components/ThemeInitializer';
import { NotificationProvider } from '@/lib/contexts/NotificationContext';
import { AppToasts } from '@/components/ui/AppToasts';
import 'react-toastify/dist/ReactToastify.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Metaforge IT Solutions',
    template: '%s · Metaforge IT Solutions',
  },
  description:
    'Metaforge IT Solutions — enterprise staffing workflow, requirements, candidates, and submissions.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jakarta.variable} ${mono.variable} font-sans antialiased`}
      >
        <ThemeInitializer />
        <NotificationProvider>
          <ThemeProvider>
            <AuthProvider>
              <RequirementsProvider>
                <CandidatesProvider>
                  <SubmissionsProvider>
                    <ConditionalAppShell>{children}</ConditionalAppShell>
                    <AppToasts />
                  </SubmissionsProvider>
                </CandidatesProvider>
              </RequirementsProvider>
            </AuthProvider>
          </ThemeProvider>
        </NotificationProvider>
      </body>
    </html>
  );
}
