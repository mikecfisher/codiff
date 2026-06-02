import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/CaretDown';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { PullRequestSource } from '../../lib/app-types.ts';
import type { HistoryEntry, ReviewSource } from '../../types.ts';
import { HistorySidebar } from './Sidebar.tsx';

const POPOVER_MARGIN = 12;
const POPOVER_MIN_WIDTH = 360;
const POPOVER_MAX_WIDTH = 460;
const POPOVER_OFFSET = 8;

const getPopoverStyle = (anchor: HTMLElement): CSSProperties => {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(
    POPOVER_MAX_WIDTH,
    Math.max(POPOVER_MIN_WIDTH, rect.width),
    window.innerWidth - POPOVER_MARGIN * 2,
  );
  const left = Math.min(
    Math.max(POPOVER_MARGIN, rect.left),
    Math.max(POPOVER_MARGIN, window.innerWidth - width - POPOVER_MARGIN),
  );
  const maxHeight = Math.max(
    220,
    window.innerHeight - rect.bottom - POPOVER_OFFSET - POPOVER_MARGIN,
  );

  return {
    left,
    maxHeight,
    top: rect.bottom + POPOVER_OFFSET,
    width,
  };
};

export function ReviewSourcePicker({
  branchSource,
  currentSource,
  entries,
  hasMore,
  loading,
  onLoadMore,
  onOpenChange,
  onSearchQueryChange,
  onSelectSource,
  open,
  pullRequestSource,
  repositoryLabel,
  searchQuery,
  sourceLabel,
}: {
  branchSource: Extract<ReviewSource, { type: 'branch' }> | null;
  currentSource: ReviewSource;
  entries: ReadonlyArray<HistoryEntry>;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  onOpenChange: (open: boolean) => void;
  onSearchQueryChange: (query: string) => void;
  onSelectSource: (source: ReviewSource) => void;
  open: boolean;
  pullRequestSource: PullRequestSource | null;
  repositoryLabel: string;
  searchQuery: string;
  sourceLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  const updatePopoverStyle = useCallback(() => {
    const anchor = rootRef.current;
    if (anchor) {
      setPopoverStyle(getPopoverStyle(anchor));
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(updatePopoverStyle);
    return () => window.cancelAnimationFrame(frame);
  }, [open, updatePopoverStyle]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }

      onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updatePopoverStyle);
    window.addEventListener('scroll', updatePopoverStyle, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updatePopoverStyle);
      window.removeEventListener('scroll', updatePopoverStyle, true);
    };
  }, [onOpenChange, open, updatePopoverStyle]);

  const popover = open
    ? createPortal(
        <div
          className="review-source-popover"
          ref={popoverRef}
          style={popoverStyle ?? { visibility: 'hidden' }}
        >
          <input
            aria-label="Filter history"
            className="sidebar-search review-source-search"
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            placeholder="Filter history"
            ref={inputRef}
            spellCheck={false}
            type="search"
            value={searchQuery}
          />
          <HistorySidebar
            branchSource={branchSource}
            currentSource={currentSource}
            entries={entries}
            hasMore={hasMore}
            loading={loading}
            onLoadMore={onLoadMore}
            onSelectSource={(source) => {
              onSelectSource(source);
              onOpenChange(false);
            }}
            pullRequestSource={pullRequestSource}
            searchQuery={searchQuery}
          />
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="review-source-picker" ref={rootRef}>
      <button
        aria-expanded={open}
        className="review-source-trigger"
        onClick={() => onOpenChange(!open)}
        title={`${repositoryLabel} · ${sourceLabel}`}
        type="button"
      >
        <span className="review-source-trigger-label">
          <span>{repositoryLabel}</span>
          <span>{sourceLabel}</span>
        </span>
        <CaretDown aria-hidden className="review-source-trigger-chevron" size={13} weight="bold" />
      </button>
      {popover}
    </div>
  );
}
