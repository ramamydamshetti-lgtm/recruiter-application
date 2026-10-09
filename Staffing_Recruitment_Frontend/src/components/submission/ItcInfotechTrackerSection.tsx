'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { FormSection } from '@/components/ui/FormSection';
import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  ITC_INFOTECH_TRACKER_HEADERS,
  buildItcInfotechTrackerRow,
  type ItcInfotechTrackerHeader,
  type ItcInfotechTrackerRowState,
} from '@/lib/domain/submissions/itcInfotechTracker';
import { mergeTrackerRowPreservingEdits } from '@/lib/domain/submissions/trackerRowSync';
import {
  OrderedTrackerBodyCells,
  OrderedTrackerHeaderCells,
  type TrackerCustomization,
} from './trackerCustomization';
import { TrackerTableShell, TrackerTableHeaderRow, TRACKER_TABLE_UI } from './trackerTableUi';

const ITC_HEADER_BG = '#DFE8F7';

type Props = {
  requirement: Requirement;
  requirementId: string;
  attachedCandidates: Candidate[];
  submissions: CandidateSubmission[];
  rows: ItcInfotechTrackerRowState[];
  onRowsChange: Dispatch<SetStateAction<ItcInfotechTrackerRowState[]>>;
  customization?: TrackerCustomization;
};

export function ItcInfotechTrackerSection({
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
        const fresh = buildItcInfotechTrackerRow(c, requirement, sub, idx);
        return mergeTrackerRowPreservingEdits(prevById.get(c.id), fresh);
      });
    });
  }, [attachedCandidates, requirement, requirementId, submissions, onRowsChange]);

  const updateCell = (candidateId: string, header: ItcInfotechTrackerHeader, value: string) => {
    onRowsChange(
      rows.map((r) => (r.candidateId === candidateId ? { ...r, [header]: value } : r)),
    );
  };

  const headerBg = customization?.headerBgColor || ITC_HEADER_BG;

  return (
    <FormSection
      title="Client submission tracker"
      description="Review and edit before send. Internal requirement IDs are omitted from the client view — the email uses this same layout."
    >
      {attachedCandidates.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-zinc-400">
          Attach at least one candidate above to populate the tracker rows.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">Preparing tracker…</p>
      ) : (
        <TrackerTableShell headerBg={headerBg} minWidth={1800}>
          <TrackerTableHeaderRow headerBg={headerBg}>
            <OrderedTrackerHeaderCells
              baseHeaders={ITC_INFOTECH_TRACKER_HEADERS}
              customization={customization}
              getMinWidth={(h) =>
                h === 'Skills / Technologies'
                  ? 280
                  : h === 'Highest qualification' || h === 'Notice period (last working day)'
                    ? 200
                    : h === 'Email' || h === 'LinkedIn URL'
                      ? 180
                      : 110
              }
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
                    candidateLabel={row.Name}
                    baseHeaders={ITC_INFOTECH_TRACKER_HEADERS}
                    customization={customization}
                    onBaseCellChange={(candidateId, header, value) =>
                      updateCell(candidateId, header as ItcInfotechTrackerHeader, value)
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
