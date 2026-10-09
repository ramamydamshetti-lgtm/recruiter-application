'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { FormSection } from '@/components/ui/FormSection';
import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import type { UstRecruiterContext } from '@/lib/domain/submissions/ustTracker';
import {
  UST_TRACKER_HEADERS,
  buildUstTrackerRow,
  type UstTrackerHeader,
  type UstTrackerRowState,
} from '@/lib/domain/submissions/ustTracker';
import { mergeTrackerRowPreservingEdits } from '@/lib/domain/submissions/trackerRowSync';
import {
  OrderedTrackerBodyCells,
  OrderedTrackerHeaderCells,
  type TrackerCustomization,
} from './trackerCustomization';
import { TrackerTableShell, TrackerTableHeaderRow, TRACKER_TABLE_UI } from './trackerTableUi';

/** Preview: white header, black grid (aligned with UST Excel export). */
const UST_HEADER_BG = '#FFFFFF';

type Props = {
  requirement: Requirement;
  requirementId: string;
  attachedCandidates: Candidate[];
  submissions: CandidateSubmission[];
  recruiter: UstRecruiterContext | null;
  rows: UstTrackerRowState[];
  onRowsChange: Dispatch<SetStateAction<UstTrackerRowState[]>>;
  customization?: TrackerCustomization;
};

export function UstTrackerSection({
  requirement,
  requirementId,
  attachedCandidates,
  submissions,
  recruiter,
  rows,
  onRowsChange,
  customization,
}: Props) {
  useEffect(() => {
    onRowsChange((prev) => {
      const prevById = new Map(prev.map((r) => [r.candidateId, r]));
      return attachedCandidates.map((c) => {
        const sub = submissions.find((s) => s.candidateId === c.id && s.jdId === requirementId);
        const fresh = buildUstTrackerRow(c, requirement, sub, recruiter);
        return mergeTrackerRowPreservingEdits(prevById.get(c.id), fresh);
      });
    });
  }, [attachedCandidates, requirement, requirementId, submissions, recruiter, onRowsChange]);

  const updateCell = (candidateId: string, header: UstTrackerHeader, value: string) => {
    onRowsChange(
      rows.map((r) => (r.candidateId === candidateId ? { ...r, [header]: value } : r)),
    );
  };

  const headerBg = customization?.headerBgColor || UST_HEADER_BG;

  return (
    <FormSection
      title="Client submission tracker"
      description="UST layout: white header row with black grid (matches the shared template). Scroll horizontally to edit all columns — the same grid is embedded in the client email (MetaForge header + styling)."
    >
      {attachedCandidates.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-zinc-400">
          Attach at least one candidate above to populate the tracker rows.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">Preparing tracker…</p>
      ) : (
        <TrackerTableShell headerBg={headerBg} minWidth={2800}>
          <TrackerTableHeaderRow headerBg={headerBg}>
            <OrderedTrackerHeaderCells
              baseHeaders={UST_TRACKER_HEADERS}
              customization={customization}
              getMinWidth={(h) => (h.length > 22 ? 140 : 96)}
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
                    baseHeaders={UST_TRACKER_HEADERS}
                    customization={customization}
                    onBaseCellChange={(candidateId, header, value) =>
                      updateCell(candidateId, header as UstTrackerHeader, value)
                    }
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
