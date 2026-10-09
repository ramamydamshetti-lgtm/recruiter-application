'use client';

import { ToastContainer } from 'react-toastify';

/**
 * Client-only toast host for the root layout (react-toastify).
 */
export function AppToasts() {
  return (
    <ToastContainer
      position="top-right"
      autoClose={4500}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="light"
      limit={5}
      toastClassName="!rounded-xl !shadow-lg !text-sm"
    />
  );
}
