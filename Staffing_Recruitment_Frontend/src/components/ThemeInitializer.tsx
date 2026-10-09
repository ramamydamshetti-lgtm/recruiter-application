'use client';

import { useState, useEffect } from 'react';

export function ThemeInitializer() {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Only run on client side
    const initializeTheme = () => {
      try {
        const theme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = theme === 'dark' || (!theme && prefersDark);
        
        if (isDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (e) {
        // Ignore errors
      } finally {
        setIsInitialized(true);
      }
    };

    // Initialize immediately
    initializeTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', initializeTheme);

    return () => {
      mediaQuery.removeEventListener('change', initializeTheme);
    };
  }, []);

  // Prevent flash by rendering nothing until theme is initialized
  if (!isInitialized) {
    return null;
  }

  return null;
}
