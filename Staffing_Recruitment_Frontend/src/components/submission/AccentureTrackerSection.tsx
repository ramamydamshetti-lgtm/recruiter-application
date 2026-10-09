'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { FormSection } from '@/components/ui/FormSection';
import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  ACCENTURE_TRACKER_HEADERS,
  buildAccentureTrackerRow,
  type AccentureTrackerHeader,
  type AccentureTrackerRowState,
} from '@/lib/domain/submissions/accentureTracker';
import { mergeTrackerRowPreservingEdits } from '@/lib/domain/submissions/trackerRowSync';
import {
  OrderedTrackerBodyCells,
  OrderedTrackerHeaderCells,
  type TrackerCustomization,
} from './trackerCustomization';
import { TrackerTableShell, TrackerTableHeaderRow, TRACKER_TABLE_UI } from './trackerTableUi';

const ACCENTURE_HEADER_BG = '#D8E4BC';

type Props = {
  requirement: Requirement;
  requirementId: string;
  attachedCandidates: Candidate[];
  submissions: CandidateSubmission[];
  rows: AccentureTrackerRowState[];
  onRowsChange: Dispatch<SetStateAction<AccentureTrackerRowState[]>>;
  customization?: TrackerCustomization;
};

export function AccentureTrackerSection({
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
        const fresh = buildAccentureTrackerRow(c, requirement, sub);
        return mergeTrackerRowPreservingEdits(prevById.get(c.id), fresh);
      });
    });
  }, [attachedCandidates, requirement, requirementId, submissions, onRowsChange]);

  const updateCell = (candidateId: string, header: AccentureTrackerHeader, value: string) => {
    onRowsChange(
      rows.map((r) => (r.candidateId === candidateId ? { ...r, [header]: value } : r)),
    );
  };

  const headerBg = customization?.headerBgColor || ACCENTURE_HEADER_BG;

  return (
    <FormSection
      title="Client submission tracker"
      description="Accenture layout: light formal green header and black grid. Column order matches the standard template (including locations and rate card before contact and skills). Your edits appear in the embedded client-email tracker."
    >
      {attachedCandidates.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-zinc-400">
          Attach at least one candidate above to populate the tracker rows.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">Preparing tracker…</p>
      ) : (
        <TrackerTableShell headerBg={headerBg} minWidth={1400}>
          <TrackerTableHeaderRow headerBg={headerBg}>
            <OrderedTrackerHeaderCells
              baseHeaders={ACCENTURE_TRACKER_HEADERS}
              customization={customization}
              getMinWidth={(h) => (h.length > 18 ? 130 : 104)}
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
                    candidateLabel={row['Name of candidate']}
                    baseHeaders={ACCENTURE_TRACKER_HEADERS}
                    customization={customization}
                    onBaseCellChange={(candidateId, header, value) =>
                      updateCell(candidateId, header as AccentureTrackerHeader, value)
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
