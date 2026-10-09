'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { FormSection } from '@/components/ui/FormSection';
import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  BRILLIO_TRACKER_HEADERS,
  BRILLIO_VENDOR_META_FORGE,
  buildBrillioTrackerRow,
  type BrillioTrackerHeader,
  type BrillioTrackerRowState,
} from '@/lib/domain/submissions/brillioTracker';
import { mergeTrackerRowPreservingEdits } from '@/lib/domain/submissions/trackerRowSync';
import {
  OrderedTrackerBodyCells,
  OrderedTrackerHeaderCells,
  type TrackerCustomization,
} from './trackerCustomization';
import { TrackerTableShell, TrackerTableHeaderRow, TRACKER_TABLE_UI } from './trackerTableUi';

/** Light blue header — distinct from other client trackers. */
const BRILLIO_HEADER_BG = '#DEEAF6';

type Props = {
  requirement: Requirement;
  requirementId: string;
  attachedCandidates: Candidate[];
  submissions: CandidateSubmission[];
  rows: BrillioTrackerRowState[];
  onRowsChange: Dispatch<SetStateAction<BrillioTrackerRowState[]>>;
  customization?: TrackerCustomization;
};

export function BrillioTrackerSection({
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
        const fresh = buildBrillioTrackerRow(c, requirement, sub, index + 1);
        return mergeTrackerRowPreservingEdits(prevById.get(c.id), fresh);
      });
    });
  }, [attachedCandidates, requirement, requirementId, submissions, onRowsChange]);

  const updateCell = (candidateId: string, header: BrillioTrackerHeader, value: string) => {
    if (header === 'Sl No' || header === 'Vendor name') return;
    onRowsChange(
      rows.map((r) =>
        r.candidateId === candidateId
          ? { ...r, [header]: value, 'Vendor name': BRILLIO_VENDOR_META_FORGE }
          : r,
      ),
    );
  };

  const headerBg = customization?.headerBgColor || BRILLIO_HEADER_BG;
  const readOnlyHeaders = new Set(['Sl No', 'Vendor name']);

  return (
    <FormSection
      title="Client submission tracker"
      description="Brillio column layout with MetaForge as vendor. Edit cells before submit — the same grid is embedded in the client email."
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
              baseHeaders={BRILLIO_TRACKER_HEADERS}
              customization={customization}
              getMinWidth={(h) => (h.length > 24 ? 160 : 110)}
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
                    baseHeaders={BRILLIO_TRACKER_HEADERS}
                    customization={customization}
                    onBaseCellChange={(candidateId, header, value) =>
                      updateCell(candidateId, header as BrillioTrackerHeader, value)
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
