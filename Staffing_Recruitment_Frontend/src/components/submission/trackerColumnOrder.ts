import { sanitizeClientFacingCellValue } from '@/lib/domain/submissions/clientFacingValue';

export type TrackerColumnOrderItem = {
  kind: 'base' | 'extra';
  id: string;
  label: string;
  visible: boolean;
};

export function createExtraColumnId(): string {
  return `col_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Merge template base headers with any saved/custom column order. */
export function syncTrackerColumnOrder(
  prev: TrackerColumnOrderItem[],
  baseHeaders: string[],
): TrackerColumnOrderItem[] {
  if (baseHeaders.length === 0) return [];

  if (prev.length === 0) {
    return baseHeaders.map((h) => ({
      kind: 'base',
      id: h,
      label: h,
      visible: true,
    }));
  }

  const next: TrackerColumnOrderItem[] = [];
  const seenBase = new Set<string>();

  for (const item of prev) {
    if (item.kind === 'extra') {
      next.push(item);
      continue;
    }
    if (baseHeaders.includes(item.label)) {
      next.push(item);
      seenBase.add(item.label);
    }
  }

  for (const h of baseHeaders) {
    if (!seenBase.has(h)) {
      next.push({ kind: 'base', id: h, label: h, visible: true });
    }
  }

  return next;
}

export function moveColumnInOrder(
  order: TrackerColumnOrderItem[],
  fromIndex: number,
  toIndex: number,
): TrackerColumnOrderItem[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return order;
  if (fromIndex >= order.length || toIndex >= order.length) return order;
  const next = [...order];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return order;
  next.splice(toIndex, 0, moved);
  return next;
}

export function toggleColumnVisibility(
  order: TrackerColumnOrderItem[],
  columnId: string,
): TrackerColumnOrderItem[] {
  return order.map((col) => (col.id === columnId ? { ...col, visible: !col.visible } : col));
}

export function removeExtraColumnFromOrder(
  order: TrackerColumnOrderItem[],
  columnId: string,
): TrackerColumnOrderItem[] {
  return order.filter((col) => col.id !== columnId);
}

export function insertExtraColumnInOrder(
  order: TrackerColumnOrderItem[],
  name: string,
  insertIndex: number,
): { order: TrackerColumnOrderItem[]; columnId: string } {
  const id = createExtraColumnId();
  const item: TrackerColumnOrderItem = {
    kind: 'extra',
    id,
    label: name,
    visible: true,
  };
  const next = [...order];
  const index = Math.max(0, Math.min(insertIndex, next.length));
  next.splice(index, 0, item);
  return { order: next, columnId: id };
}

export function getVisibleOrderedColumns(
  baseHeaders: readonly string[],
  columnOrder?: TrackerColumnOrderItem[],
  legacy?: { hiddenHeaders?: string[]; extraColumns?: Array<{ id: string; name: string }> },
): TrackerColumnOrderItem[] {
  if (columnOrder?.length) {
    return columnOrder.filter((c) => c.visible);
  }

  const hidden = new Set(legacy?.hiddenHeaders ?? []);
  const baseCols = baseHeaders
    .filter((h) => !hidden.has(h))
    .map((h) => ({ kind: 'base' as const, id: h, label: h, visible: true }));
  const extraCols = (legacy?.extraColumns ?? []).map((c) => ({
    kind: 'extra' as const,
    id: c.id,
    label: c.name,
    visible: true,
  }));
  return [...baseCols, ...extraCols];
}

type TrackerRowWithId = { candidateId: string } & Record<string, string>;

export function buildTrackerRenderPayload(
  columnOrder: TrackerColumnOrderItem[],
  selectedRows: TrackerRowWithId[],
  attachedCandidateIds: string[],
  extraCellValues: Record<string, Record<string, string>>,
): { headers: string[]; rows: Record<string, string>[] } {
  const visible = columnOrder.filter((c) => c.visible && c.label.trim().length > 0);
  const headers = visible.map((c) => c.label);
  const selectedByCandidate = new Map(selectedRows.map((r) => [r.candidateId, r]));

  const rows = attachedCandidateIds.map((candidateId) => {
    const base = selectedByCandidate.get(candidateId) ?? ({ candidateId } as TrackerRowWithId);
    const row: Record<string, string> = {};
    for (const col of visible) {
      if (col.kind === 'base') {
        row[col.label] = sanitizeClientFacingCellValue(String(base[col.label] ?? '').trim());
      } else {
        row[col.label] = sanitizeClientFacingCellValue(
          String(extraCellValues[candidateId]?.[col.id] ?? '').trim(),
        );
      }
    }
    return row;
  });

  return { headers, rows };
}
