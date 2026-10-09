'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  GripVertical,
  Palette,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  insertExtraColumnInOrder,
  moveColumnInOrder,
  removeExtraColumnFromOrder,
  toggleColumnVisibility,
  type TrackerColumnOrderItem,
} from './trackerColumnOrder';

function normalizeHexColor(value: string, fallback: string): string {
  const v = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : fallback;
}

type Props = {
  columnOrder: TrackerColumnOrderItem[];
  onColumnOrderChange: (order: TrackerColumnOrderItem[]) => void;
  newColumnName: string;
  onNewColumnNameChange: (name: string) => void;
  onExtraColumnRemoved?: (columnId: string) => void;
  onDirty?: () => void;
  headerBgColor?: string;
  defaultHeaderBgColor?: string;
  onHeaderBgColorChange?: (color: string) => void;
  customizationSaved?: boolean;
  onSave?: () => void;
  showSaveBar?: boolean;
};

const COLUMN_DRAG_MIME = 'application/x-metaforge-tracker-column';

function ColumnChip({
  col,
  index,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onToggleVisibility,
  onRemoveExtra,
}: {
  col: TrackerColumnOrderItem;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (index: number) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onToggleVisibility: (columnId: string) => void;
  onRemoveExtra: (columnId: string) => void;
}) {
  const isCustom = col.kind === 'extra';

  return (
    <div
      draggable
      data-allow-drag="true"
      onDragStart={(e) => {
        e.dataTransfer.setData(COLUMN_DRAG_MIME, String(index));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(index);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      title={col.label}
      className={cn(
        'group inline-flex max-w-[220px] items-center gap-1 rounded-lg border px-1.5 py-1',
        'select-none transition-all duration-150',
        isDragging && 'scale-[0.97] opacity-40',
        isDropTarget && 'ring-2 ring-blue-400 ring-offset-1',
        col.visible
          ? isCustom
            ? 'border-blue-200 bg-blue-50/90 text-blue-900 shadow-sm'
            : 'border-emerald-200/90 bg-emerald-50/80 text-emerald-900 shadow-sm'
          : 'border-dashed border-slate-200 bg-slate-50/80 text-slate-400',
      )}
    >
      <span
        className="cursor-grab rounded p-0.5 text-slate-400 active:cursor-grabbing group-hover:text-slate-600"
        aria-hidden
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>

      <span
        className={cn(
          'min-w-0 flex-1 truncate text-xs font-medium leading-tight',
          !col.visible && 'line-through',
        )}
      >
        {col.label}
      </span>

      {isCustom ? (
        <span className="shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide text-blue-600/80">
          New
        </span>
      ) : null}

      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => onToggleVisibility(col.id)}
          className={cn(
            'rounded p-0.5 transition-colors',
            col.visible
              ? 'text-slate-400 hover:bg-white/80 hover:text-slate-700'
              : 'text-slate-500 hover:bg-white hover:text-emerald-600',
          )}
          aria-label={col.visible ? `Hide ${col.label}` : `Show ${col.label}`}
        >
          {col.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        {isCustom ? (
          <button
            type="button"
            onClick={() => onRemoveExtra(col.id)}
            className="rounded p-0.5 text-red-400 opacity-80 transition-all hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
            aria-label={`Remove ${col.label}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SectionLabel({
  icon,
  title,
  hint,
  badge,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  badge?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {icon ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500">
            {icon}
          </span>
        ) : null}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
          {hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null}
        </div>
      </div>
      {badge ? (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

export function TrackerColumnOrderEditor({
  columnOrder,
  onColumnOrderChange,
  newColumnName,
  onNewColumnNameChange,
  onExtraColumnRemoved,
  onDirty,
  headerBgColor,
  defaultHeaderBgColor = '#e8e8e8',
  onHeaderBgColorChange,
  customizationSaved,
  onSave,
  showSaveBar = false,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [insertIndex, setInsertIndex] = useState<number>(columnOrder.length);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    setInsertIndex((prev) => Math.min(prev, columnOrder.length));
  }, [columnOrder.length]);

  const stats = useMemo(() => {
    const visible = columnOrder.filter((c) => c.visible).length;
    const hidden = columnOrder.length - visible;
    const custom = columnOrder.filter((c) => c.kind === 'extra').length;
    return { visible, hidden, custom, total: columnOrder.length };
  }, [columnOrder]);

  const markDirty = () => onDirty?.();

  const handleMove = (fromIndex: number, toIndex: number) => {
    const next = moveColumnInOrder(columnOrder, fromIndex, toIndex);
    if (next !== columnOrder) {
      onColumnOrderChange(next);
      markDirty();
    }
  };

  const handleToggleVisibility = (columnId: string) => {
    onColumnOrderChange(toggleColumnVisibility(columnOrder, columnId));
    markDirty();
  };

  const handleRemoveExtra = (columnId: string) => {
    onColumnOrderChange(removeExtraColumnFromOrder(columnOrder, columnId));
    onExtraColumnRemoved?.(columnId);
    markDirty();
  };

  const handleAddColumn = () => {
    const name = newColumnName.trim();
    if (!name) {
      setAddError('Enter a column name');
      return;
    }
    if (columnOrder.some((c) => c.label.toLowerCase() === name.toLowerCase())) {
      setAddError('That column name already exists');
      return;
    }
    const { order } = insertExtraColumnInOrder(columnOrder, name, insertIndex);
    onColumnOrderChange(order);
    onNewColumnNameChange('');
    setInsertIndex(order.length);
    setAddError(null);
    markDirty();
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }
    handleMove(dragIndex, targetIndex);
    setDragIndex(null);
    setDropIndex(null);
  };

  const handleShowAll = () => {
    if (stats.hidden === 0) return;
    onColumnOrderChange(columnOrder.map((c) => ({ ...c, visible: true })));
    markDirty();
  };

  if (columnOrder.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center">
        <p className="text-sm text-slate-500">Attach candidates above to load tracker columns.</p>
      </div>
    );
  }

  const resolvedHeaderColor = normalizeHexColor(
    headerBgColor ?? '',
    normalizeHexColor(defaultHeaderBgColor, '#e8e8e8'),
  );

  return (
    <div className="space-y-3" data-allow-drag="true">
      {/* Add column — pinned at top */}
      <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 p-3">
        <SectionLabel
          title="Add custom column"
          hint="Inserts into the layout below — drag chips to fine-tune position"
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newColumnName}
            onChange={(e) => {
              onNewColumnNameChange(e.target.value);
              if (addError) setAddError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddColumn();
              }
            }}
            placeholder="Column name"
            className="h-9 min-w-[140px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20"
          />
          <div className="relative">
            <select
              value={insertIndex}
              onChange={(e) => setInsertIndex(Number(e.target.value))}
              className="h-9 min-w-[148px] appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20"
              aria-label="Insert position"
            >
              <option value={0}>At start</option>
              {columnOrder.map((col, index) => (
                <option key={col.id} value={index + 1}>
                  After {col.label.length > 18 ? `${col.label.slice(0, 18)}…` : col.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
          <button
            type="button"
            onClick={handleAddColumn}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Insert
          </button>
        </div>
        {addError ? <p className="mt-1.5 text-xs text-red-600">{addError}</p> : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        {/* Column chips */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SectionLabel
              title="Column layout"
              hint="Drag chips to reorder · eye icon to hide"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                {stats.visible} visible
                {stats.hidden > 0 ? ` · ${stats.hidden} hidden` : ''}
                {stats.custom > 0 ? ` · ${stats.custom} custom` : ''}
              </span>
              {stats.hidden > 0 ? (
                <button
                  type="button"
                  onClick={handleShowAll}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                >
                  Show all
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm border border-emerald-200 bg-emerald-50" />
              Base
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm border border-blue-200 bg-blue-50" />
              Custom
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm border border-dashed border-slate-300 bg-slate-50" />
              Hidden
            </span>
          </div>
          <div
            className="mt-2 max-h-[132px] overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/60 p-2"
            role="list"
            aria-label="Tracker columns"
          >
            <div className="flex flex-wrap gap-1.5">
              {columnOrder.map((col, index) => (
                <ColumnChip
                  key={col.id}
                  col={col}
                  index={index}
                  isDragging={dragIndex === index}
                  isDropTarget={dropIndex === index && dragIndex !== null && dragIndex !== index}
                  onDragStart={setDragIndex}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDropIndex(null);
                  }}
                  onDragOver={(e, i) => {
                    e.preventDefault();
                    setDropIndex(i);
                  }}
                  onDrop={(e, i) => {
                    e.preventDefault();
                    handleDrop(i);
                  }}
                  onToggleVisibility={handleToggleVisibility}
                  onRemoveExtra={handleRemoveExtra}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Appearance */}
        {onHeaderBgColorChange ? (
          <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm lg:min-w-[220px]">
            <SectionLabel
              icon={<Palette className="h-3.5 w-3.5" />}
              title="Appearance"
              hint="Header row color"
            />
            <div className="mt-2.5 flex items-center gap-2">
              <input
                type="color"
                value={resolvedHeaderColor}
                onChange={(e) => {
                  onHeaderBgColorChange(e.target.value);
                  markDirty();
                }}
                className="h-9 w-11 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
                aria-label="Tracker header background color"
              />
              <input
                type="text"
                value={headerBgColor ?? ''}
                onChange={(e) => {
                  onHeaderBgColorChange(e.target.value);
                  markDirty();
                }}
                placeholder={defaultHeaderBgColor}
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 font-mono text-xs uppercase tracking-wide focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20"
              />
            </div>
            <div
              className="mt-2 h-5 rounded-md border border-slate-200/80"
              style={{ backgroundColor: resolvedHeaderColor }}
              title="Header preview"
            />
          </div>
        ) : null}
      </div>

      {/* Save bar */}
      {showSaveBar && onSave ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2.5">
          <button
            type="button"
            onClick={onSave}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Check className="h-4 w-4" />
            Save layout
          </button>
          {customizationSaved ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <Check className="h-3.5 w-3.5" />
              Saved — tracker preview and client email use this layout
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              Confirm your column order and colors before sending
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
