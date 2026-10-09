'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { FormSection } from '@/components/ui/FormSection';
import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  LTTS_TRACKER_HEADERS,
  LTTS_VENDOR_DEFAULT,
  buildLttsTrackerRow,
  type LttsTrackerHeader,
  type LttsTrackerRowState,
} from '@/lib/domain/submissions/lttsTracker';
import { mergeTrackerRowPreservingEdits } from '@/lib/domain/submissions/trackerRowSync';
import {
  OrderedTrackerBodyCells,
  OrderedTrackerHeaderCells,
  type TrackerCustomization,
} from './trackerCustomization';
import { TrackerTableShell, TrackerTableHeaderRow, TRACKER_TABLE_UI } from './trackerTableUi';

const LTTS_HEADER_BG = '#FFFF00';

type Props = {
  requirement: Requirement;
  requirementId: string;
  attachedCandidates: Candidate[];
  submissions: CandidateSubmission[];
  rows: LttsTrackerRowState[];
  onRowsChange: Dispatch<SetStateAction<LttsTrackerRowState[]>>;
  customization?: TrackerCustomization;
};

export function LttsTrackerSection({
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
      return attachedCandidates.map((c, idx) => {
        const sub = submissions.find((s) => s.candidateId === c.id && s.jdId === requirementId);
        const fresh = buildLttsTrackerRow(c, requirement, sub, idx);
        return mergeTrackerRowPreservingEdits(prevById.get(c.id), fresh);
      });
    });
  }, [attachedCandidates, requirement, requirementId, submissions, onRowsChange]);

  const updateCell = (candidateId: string, header: LttsTrackerHeader, value: string) => {
    onRowsChange(
      rows.map((r) => (r.candidateId === candidateId ? { ...r, [header]: value } : r)),
    );
  };

  const headerBg = customization?.headerBgColor || LTTS_HEADER_BG;

  return (
    <FormSection
      title="Client submission tracker"
      description="LTTS / L&T layout: formal yellow header row and black grid. Review and edit before send — the same grid is embedded in the client email."
    >
      {attachedCandidates.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-zinc-400">
          Attach at least one candidate above to populate the tracker rows.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">Preparing tracker…</p>
      ) : (
        <TrackerTableShell headerBg={headerBg} minWidth={2000}>
          <TrackerTableHeaderRow headerBg={headerBg}>
            <OrderedTrackerHeaderCells
              baseHeaders={LTTS_TRACKER_HEADERS}
              customization={customization}
              getMinWidth={(h) => (h.length > 22 ? 160 : 100)}
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
                    candidateLabel={row['Full Name of the candidate']}
                    baseHeaders={LTTS_TRACKER_HEADERS}
                    customization={customization}
                    onBaseCellChange={(candidateId, header, value) =>
                      updateCell(candidateId, header as LttsTrackerHeader, value)
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
