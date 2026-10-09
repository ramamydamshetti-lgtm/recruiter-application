'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Users, Mail, Phone, MapPin, Edit, Briefcase } from 'lucide-react';
import { PageBackNav } from '@/components/ui/PageBackNav';
import { PageHeader } from '@/components/ui/PageHeader';
import { getClient, type ClientRecord } from '@/lib/api/clients';
import { getRequirements } from '@/lib/api/requirements';
import type { Requirement } from '@/lib/domain/requirements/types';
import { StatusBadge, asSemanticStatus } from '@/components/requirements/StatusBadge';
import { getDashboardStatus } from '@/lib/domain/requirements/logic';

type Props = {
  clientId: string;
};

export function ClientDetailPage({ clientId }: Props) {
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [counts, setCounts] = useState<{
    requirements: number;
    submissions: number;
    selectedSubmissions: number;
  } | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [detail, reqs] = await Promise.all([
          getClient(clientId),
          getRequirements({ clientId }),
        ]);
        if (cancelled) return;
        setClient(detail.client);
        setCounts(detail.counts);
        setRequirements(reqs);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load client');
          setClient(null);
          setCounts(null);
          setRequirements([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div className="p-8 text-sm text-gray-500">Loading client…</div>
    );
  }

  if (error || !client) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-800">Client not found</h2>
          <p className="mt-2 text-sm text-gray-500">{error ?? 'The client could not be loaded.'}</p>
          <div className="mt-4 flex justify-start">
            <PageBackNav className="mb-0" />
          </div>
        </div>
      </div>
    );
  }

  const subtitle = [client.industry ?? '—', client.location ?? '—'].join(' • ');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageBackNav className="mb-0" />
        <div className="flex items-center gap-2">
          <Link
            href={`/clients/${client.id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <Edit className="h-4 w-4" />
            Edit
          </Link>
        </div>
      </div>

      <PageHeader title={client.name} subtitle={subtitle} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Client Information</h3>
            <p className="mb-4 text-xs text-gray-500">
              Data from the <strong>clients</strong> table (linked to <strong>requirements</strong> via{' '}
              <code className="rounded bg-gray-100 px-1">client_id</code>).
            </p>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">Industry</div>
                  <div className="font-medium text-gray-900">{client.industry ?? '—'}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">Location</div>
                  <div className="font-medium text-gray-900">{client.location ?? '—'}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">Status</div>
                  <div className="font-medium text-gray-900">
                    {client.isActive ? 'Active' : 'Inactive'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Point of Contact</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <span className="font-medium text-blue-600">
                    {client.pocName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="font-medium text-gray-900">{client.pocName}</div>
                  <div className="text-sm text-gray-500">Primary Contact</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">Email</div>
                  <div className="font-medium text-gray-900">{client.pocEmail}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">Phone</div>
                  <div className="font-medium text-gray-900">{client.pocPhone ?? '—'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Job demands for this client</h3>
            </div>
            <p className="mb-4 text-xs text-gray-500">
              Rows from <strong>requirements</strong> where <code className="rounded bg-gray-100 px-1">client_id</code>{' '}
              matches this client.
            </p>
            {requirements.length === 0 ? (
              <p className="text-sm text-gray-500">No requirements yet. Create one from Job Demands.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500">
                      <th className="pb-2 pr-4">ID</th>
                      <th className="pb-2 pr-4">Role</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {requirements.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-4 font-mono text-xs text-gray-600">
                          <Link href={`/requirements/${r.id}`} className="text-blue-600 hover:underline">
                            {r.requirementId ?? r.id}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-gray-900">{r.roleTitle}</td>
                        <td className="py-2">
                          <StatusBadge status={asSemanticStatus(getDashboardStatus(r))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Quick stats</h3>
            <p className="mb-3 text-xs text-gray-500">Aggregates from related tables.</p>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Requirements</span>
                <span className="font-medium text-gray-900">{counts?.requirements ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Submissions (all)</span>
                <span className="font-medium text-gray-900">{counts?.submissions ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Selected (submissions)</span>
                <span className="font-medium text-gray-900">{counts?.selectedSubmissions ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
