'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Building2, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { getClients, type ClientRecord } from '@/lib/api/clients';

export function ClientsDashboard() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await getClients(debounced || undefined);
        if (!cancelled) setClients(list);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load clients');
          setClients([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const columns: Column<ClientRecord>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Client Name',
        cell: (client) => (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">{client.name}</div>
              <div className="text-sm text-gray-500">
                {client.clientCode ? `${client.clientCode} • ` : ''}
                {client.industry ?? '—'}
              </div>
            </div>
          </div>
        ),
      },
      {
        key: 'poc',
        header: 'Point of Contact',
        cell: (client) => (
          <div>
            <div className="font-medium text-gray-900">{client.pocName}</div>
            <div className="text-sm text-gray-500">{client.pocEmail}</div>
          </div>
        ),
      },
      {
        key: 'location',
        header: 'Location',
        cell: (client) => (
          <div className="flex items-center gap-1 text-gray-600">
            <MapPin className="h-4 w-4 shrink-0" />
            <span>{client.location ?? '—'}</span>
          </div>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        cell: (client) => (
          <div className="flex items-center gap-2">
            <Link
              href={`/clients/${client.id}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View
            </Link>
            <Link
              href={`/clients/${client.id}/edit`}
              className="text-sm font-medium text-gray-600 hover:text-gray-700"
            >
              Edit
            </Link>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients Management"
        subtitle="Manage client records (database: clients). Used when creating job demands."
        right={
          <Link
            href="/clients/new"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add New Client
          </Link>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients (name, POC, email, industry)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading clients…
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={clients}
          emptyText="No clients found. Add one to link job demands to the clients table."
          mobileCard={(client) => (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-gray-900 dark:text-zinc-100">{client.name}</div>
                  <div className="text-sm text-gray-500 dark:text-zinc-400">{client.industry ?? '—'}</div>
                </div>
                <div className="flex gap-2 text-sm">
                  <Link href={`/clients/${client.id}`} className="text-blue-600 hover:text-blue-700">
                    View
                  </Link>
                  <Link
                    href={`/clients/${client.id}/edit`}
                    className="text-gray-600 hover:text-gray-700 dark:text-zinc-300"
                  >
                    Edit
                  </Link>
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-600 dark:text-zinc-300">
                <div>{client.pocName}</div>
                <div>{client.pocEmail}</div>
                <div className="mt-1 flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {client.location ?? '—'}
                </div>
              </div>
            </div>
          )}
        />
      )}
    </div>
  );
}
