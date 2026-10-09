'use client';

import React from 'react';

export function ToastHost({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[80] max-w-sm rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 shadow-lg">
      {message}
    </div>
  );
}
