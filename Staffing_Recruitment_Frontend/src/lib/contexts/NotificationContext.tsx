'use client';

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { Bell, X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { formatDateTime } from '@/lib/utils/dateTime';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
}

export type NotificationAction =
  | { type: 'ADD_NOTIFICATION'; payload: Omit<Notification, 'id' | 'timestamp' | 'read'> }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'MARK_READ'; payload: string }
  | { type: 'MARK_ALL_READ' }
  | { type: 'CLEAR_ALL' };

const initialState: NotificationState = {
  notifications: [],
  unreadCount: 0,
};

function compactNotificationText(message: string): string {
  const normalized = String(message || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return normalized;
  if (normalized.length <= 110) return normalized;
  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0]?.trim() || normalized;
  const candidate = firstSentence.length >= 18 ? firstSentence : normalized;
  if (candidate.length <= 110) return candidate;
  return `${candidate.slice(0, 107).trimEnd()}...`;
}

function notificationReducer(state: NotificationState, action: NotificationAction): NotificationState {
  switch (action.type) {
    case 'ADD_NOTIFICATION': {
      const title = compactNotificationText(action.payload.title);
      const message = compactNotificationText(action.payload.message);
      const duplicate = state.notifications.some(
        (n) => n.title === title && n.message === message,
      );
      if (duplicate) {
        return state;
      }
      const newNotification: Notification = {
        ...action.payload,
        title,
        message,
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        read: false,
      };
      const updatedNotifications = [newNotification, ...state.notifications];
      return {
        notifications: updatedNotifications,
        unreadCount: updatedNotifications.filter(n => !n.read).length,
      };
    }
    case 'REMOVE_NOTIFICATION': {
      const updatedNotifications = state.notifications.filter(n => n.id !== action.payload);
      return {
        notifications: updatedNotifications,
        unreadCount: updatedNotifications.filter(n => !n.read).length,
      };
    }
    case 'MARK_READ': {
      const updatedNotifications = state.notifications.map(n =>
        n.id === action.payload ? { ...n, read: true } : n
      );
      return {
        notifications: updatedNotifications,
        unreadCount: updatedNotifications.filter(n => !n.read).length,
      };
    }
    case 'MARK_ALL_READ': {
      const updatedNotifications = state.notifications.map(n => ({ ...n, read: true }));
      return {
        notifications: updatedNotifications,
        unreadCount: 0,
      };
    }
    case 'CLEAR_ALL': {
      return {
        notifications: [],
        unreadCount: 0,
      };
    }
    default:
      return state;
  }
}

const NotificationContext = createContext<{
  state: NotificationState;
  dispatch: React.Dispatch<NotificationAction>;
} | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(notificationReducer, initialState);

  return (
    <NotificationContext.Provider value={{ state, dispatch }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}

export function NotificationCenter() {
  const { state, dispatch } = useNotifications();
  const [isOpen, setIsOpen] = React.useState(false);

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'success': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'error': return <AlertCircle className="h-5 w-5 text-red-500" />;
      default: return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getNotificationStyle = (type: NotificationType) => {
    switch (type) {
      case 'success': return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20';
      case 'warning': return 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20';
      case 'error': return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20';
      default: return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20';
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      dispatch({ type: 'MARK_READ', payload: notification.id });
    }
    if (notification.action) {
      notification.action.onClick();
    }
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <Bell className="h-5 w-5" />
        {state.unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
            {state.unreadCount > 99 ? '99+' : state.unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900 sm:right-0">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 p-3 sm:p-4 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base truncate">
              Notifications ({state.unreadCount})
            </h3>
            <div className="flex gap-1 sm:gap-2 flex-shrink-0">
              {state.unreadCount > 0 && (
                <button
                  onClick={() => dispatch({ type: 'MARK_ALL_READ' })}
                  className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 whitespace-nowrap"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => dispatch({ type: 'CLEAR_ALL' })}
                className="text-xs sm:text-sm text-red-600 hover:text-red-700 whitespace-nowrap"
              >
                Clear all
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 sm:max-h-96 overflow-y-auto">
            {state.notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-gray-500">
                <Bell className="h-10 w-10 sm:h-12 sm:w-12 mb-2 opacity-50" />
                <p className="text-sm sm:text-base">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {state.notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      !notification.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className={`p-3 sm:p-4 ${getNotificationStyle(notification.type)}`}>
                      <div className="flex items-start gap-2 sm:gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {getIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="truncate font-medium text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                              {notification.title}
                            </h4>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                dispatch({ type: 'REMOVE_NOTIFICATION', payload: notification.id });
                              }}
                              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 flex-shrink-0"
                            >
                              <X className="h-3 w-3 sm:h-4 sm:w-4" />
                            </button>
                          </div>
                          <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-2 sm:line-clamp-none">
                            {notification.message}
                          </p>
                          {notification.action && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                notification.action!.onClick();
                              }}
                              className="mt-2 text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-700"
                            >
                              {notification.action.label}
                            </button>
                          )}
                          <p className="mt-2 text-xs text-gray-500">
                            {formatDateTime(notification.timestamp)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      </div>
  );
}
