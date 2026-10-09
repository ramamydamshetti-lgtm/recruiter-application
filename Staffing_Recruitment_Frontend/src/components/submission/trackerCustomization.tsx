'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';
import {
  filterInternalRequirementIdFromCell,
  sanitizeClientFacingCellValue,
} from '@/lib/domain/submissions/clientFacingValue';
import { formatTrackerSkillsPlain } from '@/lib/domain/submissions/trackerSkillCell';
import { getVisibleOrderedColumns, type TrackerColumnOrderItem } from './trackerColumnOrder';
import { TRACKER_TABLE_UI } from './trackerTableUi';

export type TrackerExtraColumn = { id: string; name: string };

export type TrackerCustomization = {
  /** Optional override for the header row background color (hex). */
  headerBgColor?: string;
  /** Unified column order (base + custom). When set, drives table layout. */
  columnOrder?: TrackerColumnOrderItem[];
  /** @deprecated Use columnOrder visibility instead. */
  hiddenHeaders?: string[];
  /** @deprecated Use columnOrder instead. */
  extraColumns?: TrackerExtraColumn[];
  /** candidateId -> columnId -> cell value for extra columns. */
  extraCellValues?: Record<string, Record<string, string>>;
  /** Edit handler for extra cells. */
  onExtraCellChange?: (candidateId: string, columnId: string, value: string) => void;
};

export type { TrackerColumnOrderItem };

/**
 * Returns the list of base headers the customization wants to keep visible.
 * @deprecated Prefer getVisibleOrderedColumns with columnOrder.
 */
export function filterVisibleHeaders<T extends string>(
  baseHeaders: readonly T[],
  customization?: TrackerCustomization,
): T[] {
  if (customization?.columnOrder?.length) {
    return customization.columnOrder
      .filter((c) => c.visible && c.kind === 'base')
      .map((c) => c.label as T);
  }
  if (!customization?.hiddenHeaders?.length) return [...baseHeaders];
  const hidden = new Set(customization.hiddenHeaders);
  return baseHeaders.filter((h) => !hidden.has(h as unknown as string));
}

function resolveVisibleColumns(
  baseHeaders: readonly string[],
  customization?: TrackerCustomization,
): TrackerColumnOrderItem[] {
  return getVisibleOrderedColumns(baseHeaders, customization?.columnOrder, {
    hiddenHeaders: customization?.hiddenHeaders,
    extraColumns: customization?.extraColumns,
  });
}

function normalizedHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isSerialHeader(header: string): boolean {
  const h = normalizedHeader(header);
  return h === 'sl no' || h === 'slno' || h === 's no' || h === 'serial no' || h === 'sr no';
}

function isSkillHeader(header: string): boolean {
  const h = normalizedHeader(header);
  return h === 'skill' || h === 'skills' || h.includes('skill set') || h.includes('technology');
}

function isMobileHeader(header: string): boolean {
  const h = normalizedHeader(header);
  return h.includes('mobile') || h.includes('phone') || h.includes('contact no');
}

function isEmailHeader(header: string): boolean {
  const h = normalizedHeader(header);
  return h.includes('mail') || h.includes('email');
}

function isRateHeader(header: string): boolean {
  const h = normalizedHeader(header);
  return h.includes('rate') || h.includes('ctc') || h.includes('salary');
}

function columnClassName(header: string): string {
  return cn(
    isSerialHeader(header) && 'w-10 min-w-9 max-w-10 text-center',
    isSkillHeader(header) && 'min-w-[160px] max-w-[260px]',
    (isMobileHeader(header) || isEmailHeader(header)) && 'whitespace-nowrap break-normal',
    isRateHeader(header) && 'whitespace-nowrap break-normal',
  );
}

function columnMinWidth(header: string, fallback?: number): number | undefined {
  if (isSerialHeader(header)) return 38;
  if (isSkillHeader(header)) return 160;
  return fallback;
}

/** Renders `<th>` cells in the saved column order (base + custom interleaved). */
export function OrderedTrackerHeaderCells({
  baseHeaders,
  customization,
  className,
  thStyle,
  getMinWidth,
}: {
  baseHeaders: readonly string[];
  customization?: TrackerCustomization;
  className?: string;
  thStyle?: React.CSSProperties;
  getMinWidth?: (label: string) => number | undefined;
}) {
  const columns = resolveVisibleColumns(baseHeaders, customization);
  if (!columns.length) return null;
  return (
    <>
      {columns.map((col) => (
        <th
          key={col.id}
          className={cn(TRACKER_TABLE_UI.th, columnClassName(col.label), className)}
          style={{
            ...(thStyle ?? {}),
            minWidth: columnMinWidth(
              col.label,
              getMinWidth?.(col.label) ?? (col.kind === 'extra' ? 132 : undefined),
            ),
            maxWidth: isSkillHeader(col.label) ? 260 : undefined,
          }}
        >
          {col.label}
        </th>
      ))}
    </>
  );
}

/** Renders `<td>` cells in the saved column order for one tracker row. */
export function OrderedTrackerBodyCells<T extends Record<string, string>>({
  row,
  candidateId,
  candidateLabel,
  baseHeaders,
  customization,
  onBaseCellChange,
  cellClassName,
  inputClassName,
  readOnlyHeaders,
}: {
  row: T;
  candidateId: string;
  candidateLabel?: string;
  baseHeaders: readonly string[];
  customization?: TrackerCustomization;
  onBaseCellChange: (candidateId: string, header: string, value: string) => void;
  cellClassName?: string;
  inputClassName?: string;
  readOnlyHeaders?: ReadonlySet<string>;
}) {
  const columns = resolveVisibleColumns(baseHeaders, customization);
  if (!columns.length) return null;
  const extraValues = customization?.extraCellValues?.[candidateId] ?? {};

  return (
    <>
      {columns.map((col) => {
        if (col.kind === 'extra') {
          return (
            <td key={col.id} className={cn(TRACKER_TABLE_UI.td, cellClassName)}>
              <input
                className={cn(
                  'w-full min-w-[88px] rounded border border-transparent bg-transparent px-1 py-1',
                  'text-black focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30',
                  'dark:text-zinc-100',
                  inputClassName,
                )}
                value={extraValues[col.id] ?? ''}
                onChange={(e) =>
                  customization?.onExtraCellChange?.(candidateId, col.id, e.target.value)
                }
                aria-label={`${col.label}${candidateLabel ? ` for ${candidateLabel}` : ''}`}
              />
            </td>
          );
        }

        const readOnly = readOnlyHeaders?.has(col.label);
        const editValue = filterInternalRequirementIdFromCell(row[col.label]);
        const displayValue = sanitizeClientFacingCellValue(row[col.label]);
        const readOnlyValue = isSkillHeader(col.label)
          ? formatTrackerSkillsPlain(displayValue)
          : displayValue;
        return (
          <td key={col.id} className={cn(TRACKER_TABLE_UI.td, columnClassName(col.label), cellClassName)}>
            {readOnly ? (
              <span className={TRACKER_TABLE_UI.readOnly} title={col.label}>
                {readOnlyValue}
              </span>
            ) : (
              <input
                className={cn(TRACKER_TABLE_UI.input, inputClassName)}
                value={editValue}
                onChange={(e) => onBaseCellChange(candidateId, col.label, e.target.value)}
                aria-label={`${col.label}${candidateLabel ? ` for ${candidateLabel}` : ''}`}
              />
            )}
          </td>
        );
      })}
    </>
  );
}

/** @deprecated Use OrderedTrackerHeaderCells. */
export function ExtraTrackerHeaderCells({
  extraColumns,
  className,
  thStyle,
}: {
  extraColumns?: TrackerExtraColumn[];
  className?: string;
  thStyle?: React.CSSProperties;
}) {
  if (!extraColumns?.length) return null;
  return (
    <>
      {extraColumns.map((col) => (
        <th
          key={col.id}
          className={className}
          style={{ ...(thStyle ?? {}), minWidth: 140 }}
        >
          {col.name}
        </th>
      ))}
    </>
  );
}

/** @deprecated Use OrderedTrackerBodyCells. */
export function ExtraTrackerBodyCells({
  candidateId,
  candidateLabel,
  extraColumns,
  extraCellValues,
  onExtraCellChange,
  cellClassName,
  inputClassName,
}: {
  candidateId: string;
  candidateLabel?: string;
  extraColumns?: TrackerExtraColumn[];
  extraCellValues?: Record<string, Record<string, string>>;
  onExtraCellChange?: (candidateId: string, columnId: string, value: string) => void;
  cellClassName?: string;
  inputClassName?: string;
}) {
  if (!extraColumns?.length) return null;
  const values = extraCellValues?.[candidateId] ?? {};
  return (
    <>
      {extraColumns.map((col) => (
        <td key={col.id} className={cn(TRACKER_TABLE_UI.td, cellClassName)}>
          <input
            className={cn(
              'w-full min-w-[88px] rounded border border-transparent bg-transparent px-1 py-1',
              'text-black focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30',
              'dark:text-zinc-100',
              inputClassName,
            )}
            value={values[col.id] ?? ''}
            onChange={(e) => onExtraCellChange?.(candidateId, col.id, e.target.value)}
            aria-label={`${col.name}${candidateLabel ? ` for ${candidateLabel}` : ''}`}
          />
        </td>
      ))}
    </>
  );
}
