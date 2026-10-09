'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  getRequirements,
  type RequirementsQueryFilters,
  createRequirement as apiCreateRequirement,
  updateRequirementStatus as apiUpdateStatus,
  assignRequirement as apiAssign,
  revokeRequirement as apiRevoke,
} from '@/lib/api/requirements';
import type { Requirement, RequirementStatus } from './types';
import type { Recruiter } from './types';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import { pushAppNotification } from '@/lib/notifications/pushAppNotification';

type CreateRequirementInput = Omit<
  Requirement,
  'createdAt' | 'updatedAt' | 'updatedBy' | 'isDeleted' | 'deletedAt' | 'submissionsCount'
> & {
  createdAt?: string;
};

const emptyOwner = { id: '', name: '', email: '', title: '' };

type RequirementsStore = {
  requirements: Requirement[];
  isLoading: boolean;
  error: string | null;
  addRequirement: (input: CreateRequirementInput, updatedBy: string) => Promise<Requirement>;
  updateRequirementStatus: (
    id: string,
    status: RequirementStatus,
    updatedBy: string,
  ) => Promise<void>;
  assignRequirement: (id: string, owner: Recruiter, updatedBy: string) => Promise<void>;
  revokeRequirement: (
    id: string,
    updatedBy: string,
    options?: { recruiterIds?: string[]; assignmentIds?: string[] },
  ) => Promise<void>;
  refresh: (filters?: RequirementsQueryFilters) => Promise<void>;
};

const RequirementsContext = createContext<RequirementsStore | null>(null);
// Keep this short so ingestion updates appear quickly on dashboard.
const REQUIREMENTS_CACHE_TTL_MS = 2000;

export function RequirementsProvider({ children }: { children: React.ReactNode }) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { dispatch } = useNotifications();
  const cacheRef = useRef<Map<string, { ts: number; data: Requirement[] }>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<Requirement[]>>>(new Map());
  const requestSeqRef = useRef(0);
  const knownRequirementIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedKnownIdsRef = useRef(false);

  const refresh = useCallback(async (filters?: RequirementsQueryFilters) => {
    const requestSeq = ++requestSeqRef.current;
    const token = localStorage.getItem('token');
    if (!token) {
      // No token, don't fetch requirements
      setRequirements([]);
      setIsLoading(false);
      return;
    }

    const key = JSON.stringify(filters ?? {});
    const now = Date.now();
    const cached = cacheRef.current.get(key);
    if (cached && now - cached.ts < REQUIREMENTS_CACHE_TTL_MS) {
      if (requestSeq === requestSeqRef.current) {
        setRequirements(cached.data);
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      let promise = inFlightRef.current.get(key);
      if (!promise) {
        promise = getRequirements(filters).finally(() => {
          inFlightRef.current.delete(key);
        });
        inFlightRef.current.set(key, promise);
      }
      const data = await promise;
      cacheRef.current.set(key, { ts: Date.now(), data });
      // Ignore first successful load; only notify for newly arriving requirements afterward.
      const latestIds = new Set(data.map((item) => item.id));
      if (!hasInitializedKnownIdsRef.current) {
        knownRequirementIdsRef.current = latestIds;
        hasInitializedKnownIdsRef.current = true;
      } else {
        const hasNewRequirement = data.some(
          (item) => !knownRequirementIdsRef.current.has(item.id),
        );
        if (hasNewRequirement) {
          for (const item of data) {
            if (!knownRequirementIdsRef.current.has(item.id)) {
              pushAppNotification(dispatch, {
                dedupeKey: `requirement:new:${item.id}`,
                type: 'info',
                title: 'New Requirement',
                message: 'You have new requirement available',
              });
            }
          }
        }
        knownRequirementIdsRef.current = latestIds;
      }
      if (requestSeq === requestSeqRef.current) {
        setRequirements(data);
      }
    } catch (e) {
      if (requestSeq === requestSeqRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load requirements');
        setRequirements([]);
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh({ limit: 500 });
  }, [refresh]);

  const addRequirement = useCallback(
    async (input: CreateRequirementInput, updatedBy: string): Promise<Requirement> => {
      try {
        const req = await apiCreateRequirement(input, updatedBy);
        cacheRef.current.clear();
        setRequirements((prev) => [req, ...prev]);
        return req;
      } catch (e) {
        throw e;
      }
    },
    [],
  );

  const updateRequirementStatus = useCallback(
    async (id: string, status: RequirementStatus, updatedBy: string) => {
      try {
        const updated = await apiUpdateStatus(id, status, updatedBy);
        cacheRef.current.clear();
        setRequirements((prev) =>
          prev.map((r) => (r.id === id ? updated : r)),
        );
      } catch (e) {
        throw e;
      }
    },
    [],
  );

  const assignRequirement = useCallback(
    async (id: string, owner: Recruiter, updatedBy: string) => {
      try {
        const updated = await apiAssign(id, owner, updatedBy);
        const merged = {
          ...updated,
          assignment: 'Assigned' as const,
          assignedBy: updatedBy,
          assignedOn: updated.assignedOn ?? new Date().toISOString(),
        };
        cacheRef.current.clear();
        setRequirements((prev) =>
          prev.map((r) => (r.id === id ? merged : r)),
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('requirements-assignment-changed'));
        }
      } catch (e) {
        const isDbDisabled =
          (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 503) ||
          (e && typeof e === 'object' && 'message' in e && String((e as { message: string }).message).toLowerCase().includes('disabled'));
        if (isDbDisabled) {
          setRequirements((prev) =>
            prev.map((r) =>
              r.id === id
                ? {
                    ...r,
                    owner,
                    assignment: 'Assigned' as const,
                    assignedBy: updatedBy,
                    assignedOn: new Date().toISOString(),
                    status: 'Assigned' as RequirementStatus,
                  }
                : r
            )
          );
          return;
        }
        throw e;
      }
    },
    [],
  );

  const revokeRequirement = useCallback(
    async (
      id: string,
      updatedBy: string,
      options?: { recruiterIds?: string[]; assignmentIds?: string[] },
    ) => {
    try {
      const updated = await apiRevoke(id, updatedBy, options);
      cacheRef.current.clear();
      setRequirements((prev) =>
        prev.map((r) => (r.id === id ? updated : r)),
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('requirements-assignment-changed'));
      }
    } catch (e) {
      const isDbDisabled =
        (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 503) ||
        (e && typeof e === 'object' && 'message' in e && String((e as { message: string }).message).toLowerCase().includes('disabled'));
      if (isDbDisabled) {
        setRequirements((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  owner: { ...emptyOwner },
                  assignedRecruiters: undefined,
                  assignment: 'Unassigned' as const,
                  status: 'Open' as RequirementStatus,
                  assignedBy: undefined,
                  assignedOn: null,
                  activeAssigneeId: null,
                }
              : r
          )
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('requirements-assignment-changed'));
        }
        return;
      }
      throw e;
    }
  },
  []);

  const value = useMemo<RequirementsStore>(
    () => ({
      requirements,
      isLoading,
      error,
      addRequirement,
      updateRequirementStatus,
      assignRequirement,
      revokeRequirement,
      refresh,
    }),
    [
      requirements,
      isLoading,
      error,
      addRequirement,
      updateRequirementStatus,
      assignRequirement,
      revokeRequirement,
      refresh,
    ],
  );

  return (
    <RequirementsContext.Provider value={value}>
      {children}
    </RequirementsContext.Provider>
  );
}

export function useRequirementsStore() {
  const ctx = useContext(RequirementsContext);
  if (!ctx) throw new Error('useRequirementsStore must be used within RequirementsProvider');
  return ctx;
}
