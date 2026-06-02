import { XIcon as X } from '@phosphor-icons/react/X';
import { useMemo } from 'react';
import type { WalkthroughError, WalkthroughNote } from '../../lib/app-types.ts';
import { renderInlineMarkdown } from '../../lib/markdown.tsx';
import { walkthroughActionLabel, walkthroughImpactLabel } from '../../lib/walkthrough.ts';
import type { ChangedFile, Walkthrough } from '../../types.ts';
import { WalkthroughSidebar } from './Sidebar.tsx';

export function ReviewGuideSidebar({
  files,
  onActivatePath,
  onClose,
  onGenerateWalkthrough,
  selectedPath,
  showWhitespace,
  walkthrough,
  walkthroughError,
  walkthroughLoading,
  walkthroughNotes,
}: {
  files: ReadonlyArray<ChangedFile>;
  onActivatePath: (path: string) => void;
  onClose: () => void;
  onGenerateWalkthrough: (options?: { force?: boolean }) => void;
  selectedPath: string | null;
  showWhitespace: boolean;
  walkthrough: Walkthrough | null;
  walkthroughError: WalkthroughError | null;
  walkthroughLoading: boolean;
  walkthroughNotes: ReadonlyMap<string, WalkthroughNote>;
}) {
  const selectedNote = selectedPath ? walkthroughNotes.get(selectedPath) : undefined;
  const selectedFile = useMemo(
    () => files.find((file) => file.path === selectedPath) ?? null,
    [files, selectedPath],
  );
  const canGenerate = files.length > 0 && !walkthroughLoading;

  return (
    <aside className="squircle review-guide-sidebar">
      <header className="review-guide-header">
        <div className="review-guide-title">
          <strong>Review Guide</strong>
          <span>{walkthrough ? 'Codex walkthrough' : 'Walkthrough'}</span>
        </div>
        <button aria-label="Close Review Guide" onClick={onClose} title="Close" type="button">
          <X aria-hidden size={15} weight="bold" />
        </button>
      </header>
      {walkthroughLoading ? (
        <div className="review-guide-status codex">
          <strong>Generating walkthrough…</strong>
          <span>Codex is ranking the highest-leverage review path.</span>
        </div>
      ) : walkthroughError ? (
        <div className="review-guide-status" title={walkthroughError.reason}>
          <strong>Walkthrough unavailable</strong>
          <span>{walkthroughError.reason}</span>
          {canGenerate ? (
            <button onClick={() => onGenerateWalkthrough({ force: true })} type="button">
              Try again
            </button>
          ) : null}
        </div>
      ) : walkthrough ? (
        <>
          <section className="review-guide-current-file">
            <span className="review-guide-section-label">Current file</span>
            <strong>{selectedFile?.path ?? selectedPath ?? 'No file selected'}</strong>
            {selectedNote ? (
              <>
                <span className="review-guide-current-meta">
                  {walkthroughImpactLabel[selectedNote.impact]} ·{' '}
                  {walkthroughActionLabel[selectedNote.action]}
                </span>
                <p>{renderInlineMarkdown(selectedNote.reason)}</p>
                <p>{renderInlineMarkdown(selectedNote.context)}</p>
              </>
            ) : selectedFile ? (
              <p>This file is not annotated in the walkthrough.</p>
            ) : (
              <p>Select a changed file to see its walkthrough note.</p>
            )}
          </section>
          <WalkthroughSidebar
            files={files}
            onActivatePath={onActivatePath}
            selectedPath={selectedPath}
            showWhitespace={showWhitespace}
            walkthroughNotes={walkthroughNotes}
            walkthroughSummary={walkthrough.summary}
          />
        </>
      ) : (
        <div className="review-guide-status">
          <strong>No walkthrough yet</strong>
          <span>Generate a Codex review guide for the current changes.</span>
          {canGenerate ? (
            <button onClick={() => onGenerateWalkthrough()} type="button">
              Generate Review Guide
            </button>
          ) : null}
        </div>
      )}
    </aside>
  );
}
