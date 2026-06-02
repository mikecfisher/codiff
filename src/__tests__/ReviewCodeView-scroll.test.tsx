/**
 * @vitest-environment jsdom
 */

import type { CodeViewItem } from '@pierre/diffs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { expect, test, vi } from 'vite-plus/test';
import { ReviewCodeView } from '../app/components/ReviewCodeView.tsx';
import { defaultKeymap } from '../config/defaults.ts';
import type { ChangedFile, ReviewSource } from '../types.ts';

const codeViewMock = vi.hoisted(() => ({
  scrollTo: vi.fn(),
}));

vi.mock('@pierre/diffs/react', async () => {
  const React = await import('react');

  return {
    CodeView: React.forwardRef(function MockCodeView(
      props: {
        className?: string;
        items: Array<CodeViewItem<unknown>>;
        onScroll?: (scrollTop: number, viewer: unknown) => void;
        renderCustomHeader?: (item: CodeViewItem<unknown>) => React.ReactNode;
      },
      ref: React.ForwardedRef<unknown>,
    ) {
      const itemsRef = React.useRef(props.items);
      const renderedIdsRef = React.useRef(new Set<string>());
      const scrollAttemptByIdRef = React.useRef(new Map<string, number>());
      const scrollTopRef = React.useRef(0);
      itemsRef.current = props.items;

      const viewer = React.useMemo(
        () => ({
          getHeight: () => 100,
          getRenderedItems: () =>
            itemsRef.current
              .filter((item) => renderedIdsRef.current.has(item.id))
              .map((item) => ({
                element: document.createElement('div'),
                id: item.id,
                instance: {
                  getLinePosition: (lineNumber: number) => ({
                    height: 20,
                    top: (lineNumber - 1) * 20,
                  }),
                },
                item,
                type: item.type,
                version: item.version,
              })),
          getScrollHeight: () => itemsRef.current.length * 200 + 600,
          getScrollTop: () => scrollTopRef.current,
          getTopForItem: (id: string) => {
            const index = itemsRef.current.findIndex((item) => item.id === id);
            return index === -1 ? undefined : index * 200 + 20;
          },
        }),
        [],
      );

      React.useImperativeHandle(
        ref,
        () => ({
          clearSelectedLines: () => {},
          getInstance: () => viewer,
          scrollTo: (target: { id?: string; offset?: number; position?: number; type: string }) => {
            codeViewMock.scrollTo(target);
            if (target.type === 'position') {
              scrollTopRef.current = target.position ?? scrollTopRef.current;
              props.onScroll?.(scrollTopRef.current, viewer);
              return;
            }

            if (!target.id) {
              return;
            }

            const attempts = (scrollAttemptByIdRef.current.get(target.id) ?? 0) + 1;
            scrollAttemptByIdRef.current.set(target.id, attempts);
            const itemTop = viewer.getTopForItem(target.id) ?? 0;
            scrollTopRef.current = Math.max(0, itemTop - (target.offset ?? 0));
            if (attempts >= 2) {
              renderedIdsRef.current.add(target.id);
            }
            props.onScroll?.(scrollTopRef.current, viewer);
          },
        }),
        [props, viewer],
      );

      return React.createElement(
        'div',
        { className: props.className },
        props.items.map((item) =>
          React.createElement(
            'div',
            { key: item.id },
            props.renderCustomHeader ? props.renderCustomHeader(item) : null,
          ),
        ),
      );
    }),
    WorkerPoolContextProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

const createChangedFile = (
  path: string,
  patch = `diff --git a/${path} b/${path}\n@@ -1 +1 @@\n-old\n+new\n`,
) =>
  ({
    fingerprint: `${path}:1`,
    path,
    sections: [
      {
        binary: false,
        id: `${path}:unstaged`,
        kind: 'unstaged',
        patch,
      },
    ],
    status: 'modified',
  }) satisfies ChangedFile;

const source = { type: 'working-tree' } satisfies ReviewSource;

const waitFor = async (assertion: () => void) => {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  throw lastError;
};

test('vim j moves the diff line cursor instead of selecting the next file', async () => {
  const patch = `diff --git a/src/first.ts b/src/first.ts\n@@ -1,3 +1,3 @@\n context\n-old\n+new\n tail\n`;
  const onSelectPath = vi.fn();
  codeViewMock.scrollTo.mockClear();

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <ReviewCodeView
          activeSearchMatch={null}
          collapsed={new Set()}
          comments={[]}
          diffStyle="split"
          files={[createChangedFile('src/first.ts', patch), createChangedFile('src/second.ts')]}
          focusCommentId={null}
          focusCommentRequest={0}
          forceExpandedPaths={new Set()}
          gitIdentity={null}
          isPullRequest={false}
          itemVersionByPath={{}}
          keymap={defaultKeymap}
          loadingSectionIds={new Set()}
          onAskCodex={() => {}}
          onCreateComment={() => {}}
          onDeleteComment={() => {}}
          onLoadSection={() => {}}
          onOpenFile={() => {}}
          onSelectPath={onSelectPath}
          onSelectPathFromScroll={() => {}}
          onSubmitComment={() => {}}
          onToggleCollapsed={() => {}}
          onToggleViewed={() => {}}
          onUpdateComment={() => {}}
          scrollTarget={null}
          searchQuery=""
          selectedPath="src/first.ts"
          showWhitespace={false}
          source={source}
          viewed={{}}
          vimEnabled
          walkthroughNotes={new Map()}
          wordWrap={false}
        />,
      );
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'j' }));
    });

    expect(onSelectPath).toHaveBeenLastCalledWith('src/first.ts');
    expect(codeViewMock.scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'diff:src/first.ts:unstaged',
        lineNumber: 2,
        side: 'additions',
        type: 'line',
      }),
    );
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});

test('vim Enter creates a comment for the selected diff line', async () => {
  const patch = `diff --git a/src/first.ts b/src/first.ts\n@@ -1,3 +1,3 @@\n context\n-old\n+new\n tail\n`;
  const onCreateComment = vi.fn();
  codeViewMock.scrollTo.mockClear();

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <ReviewCodeView
          activeSearchMatch={null}
          collapsed={new Set()}
          comments={[]}
          diffStyle="split"
          files={[createChangedFile('src/first.ts', patch)]}
          focusCommentId={null}
          focusCommentRequest={0}
          forceExpandedPaths={new Set()}
          gitIdentity={null}
          isPullRequest={false}
          itemVersionByPath={{}}
          keymap={defaultKeymap}
          loadingSectionIds={new Set()}
          onAskCodex={() => {}}
          onCreateComment={onCreateComment}
          onDeleteComment={() => {}}
          onLoadSection={() => {}}
          onOpenFile={() => {}}
          onSelectPath={() => {}}
          onSelectPathFromScroll={() => {}}
          onSubmitComment={() => {}}
          onToggleCollapsed={() => {}}
          onToggleViewed={() => {}}
          onUpdateComment={() => {}}
          scrollTarget={null}
          searchQuery=""
          selectedPath="src/first.ts"
          showWhitespace={false}
          source={source}
          viewed={{}}
          vimEnabled
          walkthroughNotes={new Map()}
          wordWrap={false}
        />,
      );
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'j' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    expect(onCreateComment).toHaveBeenCalledWith({
      filePath: 'src/first.ts',
      lineNumber: 2,
      sectionId: 'src/first.ts:unstaged',
      side: 'additions',
    });
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});

test('vim Control+D and Control+U scroll half pages and advance the selected diff line', async () => {
  const patch = `diff --git a/src/first.ts b/src/first.ts\n@@ -1,8 +1,8 @@\n context\n-old\n+new\n three\n four\n five\n six\n seven\n eight\n`;
  const onCreateComment = vi.fn();
  codeViewMock.scrollTo.mockClear();

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <ReviewCodeView
          activeSearchMatch={null}
          collapsed={new Set()}
          comments={[]}
          diffStyle="split"
          files={[createChangedFile('src/first.ts', patch)]}
          focusCommentId={null}
          focusCommentRequest={0}
          forceExpandedPaths={new Set()}
          gitIdentity={null}
          isPullRequest={false}
          itemVersionByPath={{}}
          keymap={defaultKeymap}
          loadingSectionIds={new Set()}
          onAskCodex={() => {}}
          onCreateComment={onCreateComment}
          onDeleteComment={() => {}}
          onLoadSection={() => {}}
          onOpenFile={() => {}}
          onSelectPath={() => {}}
          onSelectPathFromScroll={() => {}}
          onSubmitComment={() => {}}
          onToggleCollapsed={() => {}}
          onToggleViewed={() => {}}
          onUpdateComment={() => {}}
          scrollTarget={null}
          searchQuery=""
          selectedPath="src/first.ts"
          showWhitespace={false}
          source={source}
          viewed={{}}
          vimEnabled
          walkthroughNotes={new Map()}
          wordWrap={false}
        />,
      );
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'j' }));
      document.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'd' }),
      );
    });

    expect(codeViewMock.scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        position: 59,
        type: 'position',
      }),
    );

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'u' }),
      );
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    expect(codeViewMock.scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        position: 9,
        type: 'position',
      }),
    );
    expect(onCreateComment).toHaveBeenCalledWith({
      filePath: 'src/first.ts',
      lineNumber: 2,
      sectionId: 'src/first.ts:unstaged',
      side: 'additions',
    });
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});

test('reload scroll target is retried until the selected item renders', async () => {
  codeViewMock.scrollTo.mockClear();

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <ReviewCodeView
          activeSearchMatch={null}
          collapsed={new Set()}
          comments={[]}
          diffStyle="split"
          files={[createChangedFile('src/first.ts'), createChangedFile('src/second.ts')]}
          focusCommentId={null}
          focusCommentRequest={0}
          forceExpandedPaths={new Set()}
          gitIdentity={null}
          isPullRequest={false}
          itemVersionByPath={{}}
          keymap={defaultKeymap}
          loadingSectionIds={new Set()}
          onAskCodex={() => {}}
          onCreateComment={() => {}}
          onDeleteComment={() => {}}
          onLoadSection={() => {}}
          onOpenFile={() => {}}
          onSelectPath={() => {}}
          onSelectPathFromScroll={() => {}}
          onSubmitComment={() => {}}
          onToggleCollapsed={() => {}}
          onToggleViewed={() => {}}
          onUpdateComment={() => {}}
          scrollTarget={{ path: 'src/second.ts', request: 1 }}
          searchQuery=""
          selectedPath="src/second.ts"
          showWhitespace={false}
          source={source}
          viewed={{}}
          vimEnabled={false}
          walkthroughNotes={new Map()}
          wordWrap={false}
        />,
      );
    });

    await waitFor(() => {
      expect(codeViewMock.scrollTo).toHaveBeenCalledTimes(2);
    });
    expect(codeViewMock.scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'diff:src/second.ts:unstaged',
        type: 'item',
      }),
    );
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});
