'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { FormSection } from '@/components/ui/FormSection';
import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  KPMG_TRACKER_HEADERS,
  KPMG_VENDOR_META_FORGE,
  buildKpmgTrackerRow,
  type KpmgTrackerHeader,
  type KpmgTrackerRowState,
} from '@/lib/domain/submissions/kpmgTracker';
import { mergeTrackerRowPreservingEdits } from '@/lib/domain/submissions/trackerRowSync';
import {
  OrderedTrackerBodyCells,
  OrderedTrackerHeaderCells,
  type TrackerCustomization,
} from './trackerCustomization';
import { getVisibleOrderedColumns } from './trackerColumnOrder';
import { TrackerTableShell, TRACKER_TABLE_UI } from './trackerTableUi';

/** Light formal green — preview matches Excel export. */
const KPMG_HEADER_BG = '#D8E4BC';

type Props = {
  requirement: Requirement;
  requirementId: string;
  attachedCandidates: Candidate[];
  submissions: CandidateSubmission[];
  rows: KpmgTrackerRowState[];
  onRowsChange: Dispatch<SetStateAction<KpmgTrackerRowState[]>>;
  customization?: TrackerCustomization;
};

export function KpmgTrackerSection({
  requirement,
  requirementId,
  attachedCandidates,
  submissions,
  rows,
  onRowsChange,
  customization,
}: Props) {
  useEffect(() => {
    onRowsChange((prev) => {
      const prevById = new Map(prev.map((r) => [r.candidateId, r]));
      return attachedCandidates.map((c) => {
        const sub = submissions.find((s) => s.candidateId === c.id && s.jdId === requirementId);
        const fresh = buildKpmgTrackerRow(c, requirement, sub);
        return mergeTrackerRowPreservingEdits(prevById.get(c.id), fresh);
      });
    });
  }, [attachedCandidates, requirement, requirementId, submissions, onRowsChange]);

  const updateCell = (candidateId: string, header: KpmgTrackerHeader, value: string) => {
    if (header === 'Vendor') return;
    onRowsChange(
      rows.map((r) =>
        r.candidateId === candidateId ? { ...r, [header]: value, Vendor: KPMG_VENDOR_META_FORGE } : r,
      ),
    );
  };

  const headerBg = customization?.headerBgColor || KPMG_HEADER_BG;
  const totalCols = getVisibleOrderedColumns(KPMG_TRACKER_HEADERS, customization?.columnOrder, {
    hiddenHeaders: customization?.hiddenHeaders,
    extraColumns: customization?.extraColumns,
  }).length;
  const readOnlyHeaders = new Set(['Vendor']);

  return (
    <FormSection
      title="Client submission tracker"
      description="Light formal green header row and black grid. Vendor is always MetaForge. Review and edit before you send — the same data is embedded in the client email (with MetaForge header strip and grid styling)."
    >
      {attachedCandidates.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-zinc-400">
          Attach at least one candidate above to populate the tracker rows.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">Preparing tracker…</p>
      ) : (
        <TrackerTableShell headerBg={headerBg} minWidth={1200}>
          <thead>
            <tr>
              <th
                colSpan={totalCols}
                className="h-3 border border-slate-300 p-0"
                aria-hidden
              />
            </tr>
            <tr style={{ backgroundColor: headerBg }} className="font-semibold">
              <OrderedTrackerHeaderCells
                baseHeaders={KPMG_TRACKER_HEADERS}
                customization={customization}
                getMinWidth={(h) => (h.length > 20 ? 160 : 110)}
              />
            </tr>
          </thead>
          <tbody>
            {attachedCandidates.map((c) => {
              const row = rows.find((r) => r.candidateId === c.id);
              if (!row) return null;
              return (
                <tr key={row.candidateId} className={TRACKER_TABLE_UI.tbodyTr}>
                  <OrderedTrackerBodyCells
                    row={row}
                    candidateId={row.candidateId}
                    candidateLabel={row['Name of candidate']}
                    baseHeaders={KPMG_TRACKER_HEADERS}
                    customization={customization}
                    onBaseCellChange={(candidateId, header, value) =>
                      updateCell(candidateId, header as KpmgTrackerHeader, value)
                    }
                    readOnlyHeaders={readOnlyHeaders}
                  />
                </tr>
              );
            })}
          </tbody>
        </TrackerTableShell>
      )}
    </FormSection>
  );
}
