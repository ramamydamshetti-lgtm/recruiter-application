'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { FormSection } from '@/components/ui/FormSection';
import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  METAFORGE_INTERNAL_TRACKER_HEADERS,
  buildMetaforgeTrackerRow,
  type MetaforgeInternalTrackerHeader,
  type MetaforgeTrackerRowState,
} from '@/lib/domain/submissions/metaforgeTracker';
import { mergeTrackerRowPreservingEdits } from '@/lib/domain/submissions/trackerRowSync';
import {
  OrderedTrackerBodyCells,
  OrderedTrackerHeaderCells,
  type TrackerCustomization,
} from './trackerCustomization';
import { TrackerTableShell, TrackerTableHeaderRow, TRACKER_TABLE_UI } from './trackerTableUi';

/** Light sage/mint green — matches Internal MetaForge tracker reference. */
const METAFORGE_HEADER_BG = '#C6E0B4';

type Props = {
  requirement: Requirement;
  requirementId: string;
  attachedCandidates: Candidate[];
  submissions: CandidateSubmission[];
  rows: MetaforgeTrackerRowState[];
  onRowsChange: Dispatch<SetStateAction<MetaforgeTrackerRowState[]>>;
  customization?: TrackerCustomization;
};

export function MetaforgeTrackerSection({
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
      return attachedCandidates.map((c, index) => {
        const sub = submissions.find((s) => s.candidateId === c.id && s.jdId === requirementId);
        const fresh = buildMetaforgeTrackerRow(c, requirement, sub, index + 1);
        return mergeTrackerRowPreservingEdits(prevById.get(c.id), fresh);
      });
    });
  }, [attachedCandidates, requirement, requirementId, submissions, onRowsChange]);

  const updateCell = (candidateId: string, header: MetaforgeInternalTrackerHeader, value: string) => {
    if (header === 'Sl No') return;
    onRowsChange(
      rows.map((r) => (r.candidateId === candidateId ? { ...r, [header]: value } : r)),
    );
  };

  const headerBg = customization?.headerBgColor || METAFORGE_HEADER_BG;
  const readOnlyHeaders = new Set(['Sl No']);

  return (
    <FormSection
      title="Internal MetaForge tracker"
      description="Light green header and full grid, matching the internal MetaForge spreadsheet. Edit cells before you submit — the same data is embedded in the email (MetaForge header strip + grid styling)."
    >
      {attachedCandidates.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-zinc-400">
          Attach at least one candidate above to populate the tracker rows.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">Preparing tracker…</p>
      ) : (
        <TrackerTableShell headerBg={headerBg} minWidth={1600}>
          <TrackerTableHeaderRow headerBg={headerBg}>
            <OrderedTrackerHeaderCells
              baseHeaders={METAFORGE_INTERNAL_TRACKER_HEADERS}
              customization={customization}
              getMinWidth={(h) => (h.length > 22 ? 170 : 120)}
            />
          </TrackerTableHeaderRow>
          <tbody>
            {attachedCandidates.map((c) => {
              const row = rows.find((r) => r.candidateId === c.id);
              if (!row) return null;
              return (
                <tr key={row.candidateId} className={TRACKER_TABLE_UI.tbodyTr}>
                  <OrderedTrackerBodyCells
                    row={row}
                    candidateId={row.candidateId}
                    candidateLabel={row['Candidate Name']}
                    baseHeaders={METAFORGE_INTERNAL_TRACKER_HEADERS}
                    customization={customization}
                    onBaseCellChange={(candidateId, header, value) =>
                      updateCell(candidateId, header as MetaforgeInternalTrackerHeader, value)
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
