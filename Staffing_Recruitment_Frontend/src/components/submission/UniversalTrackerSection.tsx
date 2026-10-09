'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { FormSection } from '@/components/ui/FormSection';
import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  UNIVERSAL_TRACKER_HEADERS,
  buildUniversalTrackerRow,
  type UniversalTrackerHeader,
  type UniversalTrackerRowState,
} from '@/lib/domain/submissions/universalTracker';
import { universalTrackerDocumentTitle } from '@/lib/domain/submissions/trackerSelection';
import { mergeTrackerRowPreservingEdits } from '@/lib/domain/submissions/trackerRowSync';
import {
  OrderedTrackerBodyCells,
  OrderedTrackerHeaderCells,
  type TrackerCustomization,
} from './trackerCustomization';
import { TrackerTableShell, TrackerTableHeaderRow, TRACKER_TABLE_UI } from './trackerTableUi';

/** Yellow header — same family as LTTS / universal email tracker. */
const UNIVERSAL_HEADER_BG = '#f0c040';

type Props = {
  requirement: Requirement;
  requirementId: string;
  customClientName: string;
  attachedCandidates: Candidate[];
  submissions: CandidateSubmission[];
  rows: UniversalTrackerRowState[];
  onRowsChange: Dispatch<SetStateAction<UniversalTrackerRowState[]>>;
  customization?: TrackerCustomization;
};

export function UniversalTrackerSection({
  requirement,
  requirementId,
  customClientName,
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
        const fresh = buildUniversalTrackerRow(c, requirement, sub, idx);
        return mergeTrackerRowPreservingEdits(prevById.get(c.id), fresh);
      });
    });
  }, [attachedCandidates, requirement, requirementId, submissions, onRowsChange]);

  const updateCell = (candidateId: string, header: UniversalTrackerHeader, value: string) => {
    onRowsChange(
      rows.map((r) => (r.candidateId === candidateId ? { ...r, [header]: value } : r)),
    );
  };

  const headerBg = customization?.headerBgColor || UNIVERSAL_HEADER_BG;
  const trackerTitle = universalTrackerDocumentTitle(customClientName);

  return (
    <FormSection
      title="Client submission tracker"
      description={`Universal layout for custom clients. Review and edit before send — the same grid is embedded in the client email as "${trackerTitle}".`}
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
              baseHeaders={UNIVERSAL_TRACKER_HEADERS}
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
                    candidateLabel={row['Full Name']}
                    baseHeaders={UNIVERSAL_TRACKER_HEADERS}
                    customization={customization}
                    onBaseCellChange={(candidateId, header, value) =>
                      updateCell(candidateId, header as UniversalTrackerHeader, value)
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
