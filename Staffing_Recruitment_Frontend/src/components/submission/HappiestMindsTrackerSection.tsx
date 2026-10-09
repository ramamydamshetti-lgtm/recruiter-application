'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { FormSection } from '@/components/ui/FormSection';
import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  HAPPIEST_MINDS_TRACKER_HEADERS,
  buildHappiestMindsTrackerRow,
  type HappiestMindsTrackerHeader,
  type HappiestMindsTrackerRowState,
} from '@/lib/domain/submissions/happiestMindsTracker';
import { mergeTrackerRowPreservingEdits } from '@/lib/domain/submissions/trackerRowSync';
import {
  OrderedTrackerBodyCells,
  OrderedTrackerHeaderCells,
  type TrackerCustomization,
} from './trackerCustomization';
import { TrackerTableShell, TrackerTableHeaderRow, TRACKER_TABLE_UI } from './trackerTableUi';

/** Light green header — distinct from other trackers. */
const HAPPIEST_MINDS_HEADER_BG = '#E2EFDA';

type Props = {
  requirement: Requirement;
  requirementId: string;
  attachedCandidates: Candidate[];
  submissions: CandidateSubmission[];
  rows: HappiestMindsTrackerRowState[];
  onRowsChange: Dispatch<SetStateAction<HappiestMindsTrackerRowState[]>>;
  customization?: TrackerCustomization;
};

export function HappiestMindsTrackerSection({
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
        const fresh = buildHappiestMindsTrackerRow(c, requirement, sub);
        return mergeTrackerRowPreservingEdits(prevById.get(c.id), fresh);
      });
    });
  }, [attachedCandidates, requirement, requirementId, submissions, onRowsChange]);

  const updateCell = (candidateId: string, header: HappiestMindsTrackerHeader, value: string) => {
    onRowsChange(rows.map((r) => (r.candidateId === candidateId ? { ...r, [header]: value } : r)));
  };

  const headerBg = customization?.headerBgColor || HAPPIEST_MINDS_HEADER_BG;

  return (
    <FormSection
      title="Client submission tracker"
      description="Happiest Minds column layout. Source Name defaults to MetaForge; edit any cell before submit. The same grid is embedded in the client email."
    >
      {attachedCandidates.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-zinc-400">
          Attach at least one candidate above to populate the tracker rows.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">Preparing tracker…</p>
      ) : (
        <TrackerTableShell headerBg={headerBg} minWidth={2200}>
          <TrackerTableHeaderRow headerBg={headerBg}>
            <OrderedTrackerHeaderCells
              baseHeaders={HAPPIEST_MINDS_TRACKER_HEADERS}
              customization={customization}
              getMinWidth={(h) => (h.length > 36 ? 200 : 120)}
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
                    baseHeaders={HAPPIEST_MINDS_TRACKER_HEADERS}
                    customization={customization}
                    onBaseCellChange={(candidateId, header, value) =>
                      updateCell(candidateId, header as HappiestMindsTrackerHeader, value)
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
