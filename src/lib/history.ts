import type { HistoryEntry, ReviewSource } from '../types.ts';
import { getSourceKey } from './source.ts';

export type HistoryEntryRow = {
  author: string | null;
  committedAt: number | null;
  gravatarUrl?: string;
  key: string;
  kind: 'entry';
  ref: string;
  scope?: HistoryEntry['scope'];
  source: ReviewSource;
  subject: string;
};

export type HistorySectionRow = {
  key: string;
  kind: 'section';
  label: string;
};

export type HistoryRow = HistoryEntryRow | HistorySectionRow;

export const getHistoryRows = ({
  branchSource,
  entries,
  pullRequestSource,
  searchQuery,
}: {
  branchSource: Extract<ReviewSource, { type: 'branch' }> | null;
  entries: ReadonlyArray<HistoryEntry>;
  pullRequestSource: Extract<ReviewSource, { type: 'pull-request' }> | null;
  searchQuery: string;
}): ReadonlyArray<HistoryRow> => {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const commitRows = entries.map((entry) => ({
    author: entry.author,
    committedAt: entry.committedAt,
    gravatarUrl: entry.gravatarUrl,
    key: `commit:${entry.ref}`,
    kind: 'entry' as const,
    ref: entry.ref,
    scope: entry.scope,
    source: { ref: entry.ref, type: 'commit' } satisfies ReviewSource,
    subject: entry.subject,
  }));
  const matchesQuery = (row: (typeof commitRows)[number]) =>
    !normalizedQuery ||
    row.subject.toLowerCase().includes(normalizedQuery) ||
    row.ref.toLowerCase().includes(normalizedQuery);

  if (pullRequestSource) {
    const hasScopedRows = commitRows.some((row) => row.scope != null);
    const pullRequestRows = commitRows
      .filter((row) => (hasScopedRows ? row.scope === 'pull-request' : row.scope == null))
      .filter(matchesQuery);
    const baseRows = hasScopedRows
      ? commitRows.filter((row) => row.scope === 'base').filter(matchesQuery)
      : [];
    return [
      !normalizedQuery
        ? {
            author: null,
            committedAt: null,
            gravatarUrl: undefined,
            key: getSourceKey(pullRequestSource),
            kind: 'entry' as const,
            ref: pullRequestSource.number ? `PR #${pullRequestSource.number}` : 'PR',
            source: pullRequestSource satisfies ReviewSource,
            subject: pullRequestSource.title || 'Pull Request',
          }
        : null,
      {
        key: 'history-section:pull-request',
        kind: 'section' as const,
        label: hasScopedRows ? 'Pull request commits' : 'Branch history',
      },
      ...pullRequestRows,
      { key: 'history-section:base', kind: 'section' as const, label: 'Base history' },
      ...baseRows,
    ].filter((row): row is NonNullable<typeof row> => row != null);
  }

  if (branchSource) {
    const localRows = commitRows.filter(matchesQuery);
    return [
      !normalizedQuery
        ? {
            author: null,
            committedAt: null,
            gravatarUrl: undefined,
            key: getSourceKey(branchSource),
            kind: 'entry' as const,
            ref: branchSource.ref,
            source: branchSource satisfies ReviewSource,
            subject: 'Branch history',
          }
        : null,
      ...localRows,
    ].filter((row): row is NonNullable<typeof row> => row != null);
  }

  const localRows = commitRows.filter(matchesQuery);
  return [
    !normalizedQuery
      ? {
          author: null,
          committedAt: null,
          gravatarUrl: undefined,
          key: 'working-tree',
          kind: 'entry' as const,
          ref: '',
          source: { type: 'working-tree' } satisfies ReviewSource,
          subject: 'Uncommitted',
        }
      : null,
    ...localRows,
  ].filter((row): row is NonNullable<typeof row> => row != null);
};

export const getHistoryNavigationSources = (
  rows: ReadonlyArray<HistoryRow>,
): ReadonlyArray<ReviewSource> => rows.flatMap((row) => (row.kind === 'entry' ? [row.source] : []));
