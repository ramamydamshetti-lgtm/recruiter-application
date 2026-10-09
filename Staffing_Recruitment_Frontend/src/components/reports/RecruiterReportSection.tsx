'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, FileSpreadsheet, FileDown, FileText } from 'lucide-react';
import { requirementDetailHref } from '@/lib/domain/requirements/logic';
import { useRequirementsStore } from '@/lib/domain/requirements/store';
import { useCandidatesStore } from '@/lib/domain/candidates/store';
import type { ReportFilters, ReportPeriodType } from '@/lib/domain/reports/types';
import { aggregateRecruiterReport } from '@/lib/domain/reports/reportAggregationController';
import { buildReportSearchQuery } from '@/lib/domain/reports/searchQueryBuilder';
import {
  exportRecruiterReportToExcel,
  exportRecruiterReportToCSV,
  exportRecruiterReportToPDF,
} from '@/lib/domain/reports/exportController';
import type { Recruiter } from '@/lib/domain/requirements/types';
import { ChartCard } from '@/components/ui/ChartCard';
import { Field, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/utils/cn';

const STATUS_OPTIONS = [
  'All',
  'Unassigned',
  'Assigned',
  'Submitted',
  'Interview',
  'Selected',
  'Rejected',
  'Closed',
];

const PERIOD_OPTIONS: { value: ReportPeriodType; label: string }[] = [
  { value: 'day', label: 'Day-wise' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

const PAGE_SIZE = 5;

function defaultFilters(): ReportFilters {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 2);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    periodType: 'month',
    status: 'All',
  };
}

type ReportType = 'client' | 'individual';
type ReportTypeOption = { value: ReportType; label: string };

export function RecruiterReportSection({
  recruiterId,
  reportType,
  setReportType,
  selectedRecruiterId,
  setSelectedRecruiterId,
  recruiters,
  reportTypeOptions,
}: {
  recruiterId: string;
  reportType: ReportType;
  setReportType: (t: ReportType) => void;
  selectedRecruiterId: string;
  setSelectedRecruiterId: (id: string) => void;
  recruiters: Recruiter[];
  reportTypeOptions: ReportTypeOption[];
}) {
  const router = useRouter();
  const { requirements } = useRequirementsStore();
  const { submissions } = useCandidatesStore();

  const handleRequirementsBarClick = useCallback(() => {
    router.push('/requirements');
  }, [router]);
  const handleSubmissionsBarClick = useCallback(() => {
    router.push('/submissions');
  }, [router]);
  const [filters, setFilters] = useState<ReportFilters>(defaultFilters);
  const [searchJobId, setSearchJobId] = useState('');
  const [searchClientName, setSearchClientName] = useState('');
  const [searchPoc, setSearchPoc] = useState('');
  const [searchStatus, setSearchStatus] = useState('All');
  const [page, setPage] = useState(1);

  const searchQuery = useMemo(
    () =>
      buildReportSearchQuery({
        jobId: searchJobId || undefined,
        clientName: searchClientName || undefined,
        poc: searchPoc || undefined,
        status: searchStatus !== 'All' ? searchStatus : undefined,
        startDate: filters.startDate,
        endDate: filters.endDate,
      }),
    [searchJobId, searchClientName, searchPoc, searchStatus, filters.startDate, filters.endDate],
  );

  const aggregate = useMemo(
    () =>
      aggregateRecruiterReport(requirements, submissions, recruiterId, filters, searchQuery),
    [requirements, submissions, recruiterId, filters, searchQuery],
  );

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return aggregate.requirementRows.slice(start, start + PAGE_SIZE);
  }, [aggregate.requirementRows, page]);

  const handleExportExcel = () => {
    exportRecruiterReportToExcel(aggregate.requirementRows, 'My_Performance_Report');
  };
  const handleExportCSV = () => {
    exportRecruiterReportToCSV(aggregate.requirementRows, 'My_Performance_Report');
  };
  const handleExportPDF = () => {
    const recruiter = recruiters.find((r) => r.id === recruiterId);
    const profile = {
      name: recruiter?.name ?? 'Unknown',
      email: recruiter?.email ?? '',
      role: recruiter?.title ?? '',
    };
    exportRecruiterReportToPDF(profile, {
      requirementsAssigned: aggregate.requirementsAssigned,
      candidatesSubmitted: aggregate.candidatesSubmitted,
      submissionSuccessRate: aggregate.submissionSuccessRate,
      openJobsHandled: aggregate.openJobsHandled,
      closedJobsHandled: aggregate.closedJobsHandled,
    });
  };

  const chartMax = useMemo(() => {
    const req = Math.max(...aggregate.personalTrend.map((d) => d.requirements), 1);
    const sub = Math.max(...aggregate.personalTrend.map((d) => d.submissions), 1);
    return Math.max(req, sub, 1);
  }, [aggregate.personalTrend]);

  return (
    <div className="space-y-8">
      {/* Reports Generation */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-5 text-lg font-semibold text-gray-900 dark:text-zinc-50">
          Reports Generation
        </h2>
        <div className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <Field label="Reports Type">
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as ReportType)}
                  className="flex max-w-xs items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {reportTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Recruiter">
                <select
                  value={selectedRecruiterId}
                  onChange={(e) => setSelectedRecruiterId(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {recruiters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.title})
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <FileDown className="h-4 w-4" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={handleExportPDF}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <FileText className="h-4 w-4" />
                  Export PDF
                </button>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-5 dark:border-zinc-800">
            <h3 className="mb-4 text-sm font-semibold text-gray-800 dark:text-zinc-200">Filters</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="From Date">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </Field>
              <Field label="To Date">
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </Field>
              <Field label="Report Period">
                <select
                  value={filters.periodType}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, periodType: e.target.value as ReportPeriodType }))
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {PERIOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <Select
                  value={filters.status ?? 'All'}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-5 dark:border-zinc-800">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-zinc-200">
              <Search className="h-4 w-4" />
              Advanced Search
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Requirement ID">
                <input
                  type="text"
                  placeholder="Filter by Requirement ID"
                  value={searchJobId}
                  onChange={(e) => setSearchJobId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </Field>
              <Field label="Client Name">
                <input
                  type="text"
                  placeholder="Filter by Client"
                  value={searchClientName}
                  onChange={(e) => setSearchClientName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </Field>
              <Field label="POC (Point of Contact)">
                <input
                  type="text"
                  placeholder="Point of Contact"
                  value={searchPoc}
                  onChange={(e) => setSearchPoc(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </Field>
              <Field label="Status">
                <select
                  value={searchStatus}
                  onChange={(e) => setSearchStatus(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="text-xs text-gray-500 dark:text-zinc-400 sm:self-center">
                Date range from filters above
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
            Requirements Assigned
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-zinc-50">
            {aggregate.requirementsAssigned}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
            Candidates Submitted
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-zinc-50">
            {aggregate.candidatesSubmitted}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
            Success Rate %
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-zinc-50">
            {aggregate.submissionSuccessRate}%
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
            Open Jobs
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-zinc-50">
            {aggregate.openJobsHandled}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
            Closed Jobs
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-zinc-50">
            {aggregate.closedJobsHandled}
          </div>
        </div>
      </div>

      {/* Personal trend chart – responsive, full width, proper axis scaling; updates when filters change */}
      <ChartCard
        title="Personal Performance Trend"
        subtitle="Click a bar to view requirements or submissions."
      >
        <div className="w-full min-h-[280px]" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height={280} minHeight={280}>
            <BarChart
              key={`${filters.periodType}-${filters.startDate}-${filters.endDate}`}
              data={aggregate.personalTrend}
              margin={{ top: 12, right: 12, left: 0, bottom: 8 }}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                domain={[0, Math.max(1, Math.ceil(chartMax * 1.1))]}
                allowDataOverflow={false}
                tick={{ fontSize: 11 }}
              />
              <Tooltip />
              <Bar
                dataKey="requirements"
                name="Requirements"
                fill="#2563eb"
                radius={[8, 8, 0, 0]}
                onClick={handleRequirementsBarClick}
              />
              <Bar
                dataKey="submissions"
                name="Submissions"
                fill="#16a34a"
                radius={[8, 8, 0, 0]}
                onClick={handleSubmissionsBarClick}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Requirements table with pagination */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-50">
            My Requirements (filtered)
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            Search by Requirement ID, Client Name, or Status. Paginated.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
              <tr>
                <th className="px-4 py-3">Requirement ID</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submissions</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row) => (
                <tr
                  key={row.jobId}
                  className="border-b border-gray-200/70 last:border-b-0 hover:bg-gray-50/60 dark:border-zinc-800/70 dark:hover:bg-zinc-900/30"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={requirementDetailHref({ requirementId: row.jobId })}
                      className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {row.jobId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-800 dark:text-zinc-200">{row.clientName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        row.status === 'Closed' && 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300',
                        row.status === 'Selected' && 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
                        row.status === 'Assigned' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                      )}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.submissionsCount}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-zinc-400">
                    {row.createdAt.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {aggregate.requirementRows.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-zinc-400">
            No requirements in selected range.
          </div>
        )}
        <div className="border-t border-gray-200 px-4 py-3 dark:border-zinc-800">
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            totalItems={aggregate.requirementRows.length}
            onPageChange={setPage}
          />
        </div>
      </div>
    </div>
  );
}
