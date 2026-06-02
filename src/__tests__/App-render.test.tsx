/**
 * @vitest-environment jsdom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, expect, test, vi } from 'vite-plus/test';
import App from '../App.tsx';
import { defaultConfig } from '../config/defaults.ts';
import {
  consumeReloadSelection,
  getReloadSelectionPath,
  writeReloadSelection,
} from '../lib/reload-selection.ts';
import type { ChangedFile, RepositoryState, ReviewSource } from '../types.ts';

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  ResizeObserver?: typeof ResizeObserver;
  Worker?: typeof Worker;
};
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
reactActEnvironment.ResizeObserver ??= class ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
};
class StubWorker extends EventTarget {
  constructor(_scriptURL: string | URL, _options?: WorkerOptions) {
    super();
  }
  onerror = null;
  onmessage = null;
  postMessage() {}
  terminate() {}
}
reactActEnvironment.Worker ??= StubWorker as unknown as typeof Worker;

const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: createMemoryStorage(),
});
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: createMemoryStorage(),
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const repositoryState = {
  branch: 'main',
  files: [],
  generatedAt: 1,
  launchPath: '/repo',
  root: '/repo',
  source: { type: 'working-tree' },
} satisfies RepositoryState;

const createChangedFile = (path: string, fingerprint = `${path}:1`) =>
  ({
    fingerprint,
    path,
    sections: [
      {
        binary: false,
        id: `${path}:unstaged`,
        kind: 'unstaged',
        patch: `diff --git a/${path} b/${path}\n@@ -1 +1 @@\n-old\n+new\n`,
      },
    ],
    status: 'modified',
  }) satisfies ChangedFile;

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

const createCodiffMock = (overrides: Partial<Window['codiff']> = {}): Window['codiff'] => ({
  askReviewAssistant: vi.fn(async () => ({
    reason: 'Unavailable in tests.',
    status: 'unavailable' as const,
  })),
  getCodexSkillStatus: vi.fn(async () => ({
    installed: true,
    path: '/Users/reviewer/.codex/skills/codiff',
  })),
  getConfig: vi.fn(async () => defaultConfig),
  getDiffImageContent: vi.fn(async () => ({
    reason: 'Unavailable in tests.',
    status: 'unavailable' as const,
  })),
  getDiffSectionContent: vi.fn(async () => {
    throw new Error('Unexpected diff section load.');
  }),
  getGitIdentity: vi.fn(async () => ({
    email: 'reviewer@example.com',
    name: 'Reviewer',
  })),
  getLaunchOptions: vi.fn(async () => ({
    repositoryPathProvided: true,
    walkthrough: false,
  })),
  getPreferences: vi.fn(async () => ({
    copyCommentsOnClose: true,
    diffStyle: 'split' as const,
    lastRepositoryPath: '/repo',
    openAIModel: defaultConfig.settings.openAIModel,
    showOutdated: false,
    showWhitespace: false,
    theme: 'system' as const,
    vimMode: false,
    wordWrap: false,
  })),
  getRepositoryHistory: vi.fn(async () => ({
    entries: [],
    root: '/repo',
  })),
  getRepositoryState: vi.fn(async () => repositoryState),
  getTerminalHelperStatus: vi.fn(async () => ({
    command: 'codiff',
    installed: true,
    path: '/usr/local/bin/codiff',
  })),
  getWalkthrough: vi.fn(async () => ({
    reason: 'Unavailable in tests.',
    status: 'unavailable' as const,
  })),
  installCodexSkill: vi.fn(async () => ({
    installed: true,
    path: '/Users/reviewer/.codex/skills/codiff',
  })),
  installTerminalHelper: vi.fn(async () => ({
    command: 'codiff',
    installed: true,
    path: '/usr/local/bin/codiff',
  })),
  onConfigChanged: vi.fn(() => () => {}),
  onCopyPendingCommentsRequest: vi.fn(() => () => {}),
  onFindInDiffs: vi.fn(() => () => {}),
  onRepositoryChanged: vi.fn(() => () => {}),
  openConfigFile: vi.fn(async () => {}),
  openFile: vi.fn(async () => {}),
  setDiffStyle: vi.fn(async () => {}),
  setShowOutdated: vi.fn(async () => {}),
  setWordWrap: vi.fn(async () => {}),
  showInFolder: vi.fn(async () => {}),
  submitPullRequestComment: vi.fn(async () => {
    throw new Error('Unexpected pull request comment submit.');
  }),
  submitPullRequestReview: vi.fn(async () => {}),
  ...overrides,
});

test('repository reload restores the selected file when it still exists', async () => {
  const firstFile = createChangedFile('src/first.ts');
  const secondFile = createChangedFile('src/second.ts');
  const nextState = {
    ...repositoryState,
    files: [firstFile, secondFile],
  } satisfies RepositoryState;

  writeReloadSelection(nextState, secondFile.path);

  window.codiff = createCodiffMock({
    getRepositoryState: vi.fn(async () => nextState),
  });

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
    });

    await waitFor(() => {
      expect(container.querySelector('.loading')).toBeNull();
      expect(
        container.querySelector('.codiff-file-header.selected .codiff-file-path')?.textContent,
      ).toBe(secondFile.path);
    });
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
    window.sessionStorage.clear();
  }
});

test('repository reload restores the selected file from the previous source', async () => {
  const firstFile = createChangedFile('src/first.ts');
  const secondFile = createChangedFile('src/second.ts');
  const source = { ref: 'abc1234', type: 'commit' } satisfies ReviewSource;
  const nextState = {
    ...repositoryState,
    files: [firstFile, secondFile],
    source,
  } satisfies RepositoryState;
  const getRepositoryState = vi.fn(async (requestedSource?: ReviewSource) =>
    requestedSource?.type === 'commit' ? nextState : repositoryState,
  );

  writeReloadSelection(nextState, secondFile.path);

  window.codiff = createCodiffMock({
    getRepositoryState,
  });

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
    });

    await waitFor(() => {
      expect(container.querySelector('.loading')).toBeNull();
      expect(
        container.querySelector('.codiff-file-header.selected .codiff-file-path')?.textContent,
      ).toBe(secondFile.path);
    });
    expect(getRepositoryState).toHaveBeenCalledWith(source);
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});

test('repository reload colors only git status glyphs for files changed after reload', async () => {
  const unchangedFile = createChangedFile('src/unchanged.ts', 'same');
  const changedFileBeforeReload = createChangedFile('src/changed.ts', 'before');
  const changedFileAfterReload = createChangedFile('src/changed.ts', 'after');
  const previousState = {
    ...repositoryState,
    files: [unchangedFile, changedFileBeforeReload],
  } satisfies RepositoryState;
  const nextState = {
    ...repositoryState,
    files: [unchangedFile, changedFileAfterReload],
  } satisfies RepositoryState;

  writeReloadSelection(previousState, changedFileBeforeReload.path);

  window.codiff = createCodiffMock({
    getRepositoryState: vi.fn(async () => nextState),
  });

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
    });

    await waitFor(() => {
      const shadowRoot = container.querySelector('file-tree-container')?.shadowRoot;
      const styleText =
        shadowRoot?.querySelector('style[data-codiff-reload-delta-git-status]')?.textContent ?? '';
      expect(styleText).toContain('[data-item-path="src/changed.ts"][data-item-git-status]');
      expect(styleText).not.toContain('[data-item-path="src/unchanged.ts"][data-item-git-status]');
      expect(styleText).toContain("> [data-item-section='git']");
      expect(
        shadowRoot?.querySelector(
          '[data-item-path="src/changed.ts"][data-item-git-status] > [data-item-section="git"]',
        ),
      ).toBeTruthy();
      expect(
        shadowRoot?.querySelector(
          '[data-item-path="src/unchanged.ts"][data-item-git-status] > [data-item-section="git"]',
        ),
      ).toBeTruthy();
    });
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});

test('before unload saves the current source and selected file for any reload trigger', async () => {
  const changedFile = createChangedFile('src/app.ts');
  const source = { ref: 'abc1234', type: 'commit' } satisfies ReviewSource;
  const nextState = {
    ...repositoryState,
    files: [changedFile],
    source,
  } satisfies RepositoryState;

  window.codiff = createCodiffMock({
    getRepositoryState: vi.fn(async () => nextState),
  });

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
    });

    await waitFor(() => {
      expect(container.querySelector('.loading')).toBeNull();
    });

    window.dispatchEvent(new Event('beforeunload'));

    const selection = consumeReloadSelection();
    expect(selection?.source).toEqual(source);
    expect(getReloadSelectionPath(selection, nextState)).toBe(changedFile.path);
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});

test('repository changes show the update banner without refreshing the working tree', async () => {
  let onRepositoryChanged: ((change: { root: string }) => void) | null = null;
  const getRepositoryState = vi.fn(async () => repositoryState);

  window.codiff = createCodiffMock({
    getRepositoryState,
    onRepositoryChanged: vi.fn((callback) => {
      onRepositoryChanged = callback;
      return () => {
        onRepositoryChanged = null;
      };
    }),
  });

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
    });

    await waitFor(() => {
      expect(container.querySelector('.loading')).toBeNull();
      expect(onRepositoryChanged).not.toBeNull();
    });

    expect(container.querySelector('.repository-change-banner.visible')).toBeNull();
    expect(getRepositoryState).toHaveBeenCalledTimes(1);

    await act(async () => {
      onRepositoryChanged?.({ root: '/repo' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('.repository-change-banner.visible')).not.toBeNull();
    expect(getRepositoryState).toHaveBeenCalledTimes(1);
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});

test('vim mode uses Control+D and Control+U for half-page diff scrolling', async () => {
  const changedFile = createChangedFile('src/app.ts');
  const scrollBy = vi.fn();
  const originalScrollBy = HTMLElement.prototype.scrollBy;
  const originalClientHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientHeight',
  );

  Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
    configurable: true,
    value: scrollBy,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 'classList' in this && this.classList.contains('code-view') ? 800 : 0;
    },
  });

  window.codiff = createCodiffMock({
    getConfig: vi.fn(async () => ({
      ...defaultConfig,
      settings: { ...defaultConfig.settings, vimMode: true },
    })),
    getRepositoryState: vi.fn(async () => ({
      ...repositoryState,
      files: [changedFile],
    })),
  });

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
    });

    await waitFor(() => {
      expect(container.querySelector('.code-view')).not.toBeNull();
    });

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'd' }),
      );
    });
    expect(scrollBy).toHaveBeenLastCalledWith({ behavior: 'smooth', top: 400 });

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'u' }),
      );
    });
    expect(scrollBy).toHaveBeenLastCalledWith({ behavior: 'smooth', top: -400 });
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    if (originalScrollBy) {
      HTMLElement.prototype.scrollBy = originalScrollBy;
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollBy;
    }
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
    }
    container.remove();
  }
});

test('source picker renders history in an unclipped portal and switches source', async () => {
  const changedFile = createChangedFile('src/app.ts');
  const historyEntries = [
    {
      author: 'Reviewer',
      committedAt: Date.now(),
      parents: [],
      ref: '1111111',
      subject: 'first long commit subject that should not collapse',
    },
    {
      author: 'Reviewer',
      committedAt: Date.now(),
      parents: [],
      ref: '2222222',
      subject: 'second long commit subject that should remain readable',
    },
  ];
  const getRepositoryState = vi.fn(async (source?: ReviewSource) => ({
    ...repositoryState,
    files: [changedFile],
    source: source ?? repositoryState.source,
  }));

  window.codiff = createCodiffMock({
    getRepositoryHistory: vi.fn(async () => ({
      entries: historyEntries,
      root: '/repo',
    })),
    getRepositoryState,
  });

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
    });

    await waitFor(() => {
      expect(container.querySelector('.review-source-trigger')).not.toBeNull();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.review-source-trigger')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      const popover = document.body.querySelector<HTMLElement>('.review-source-popover');
      expect(popover).not.toBeNull();
      expect(container.querySelector('.review-source-popover')).toBeNull();
      expect(popover?.style.position).toBe('');
      expect(popover?.style.width).toBe('360px');
      expect(popover?.textContent).toContain('second long commit subject');
    });

    const secondCommit = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.review-source-popover .history-entry'),
    ).find((button) => button.textContent?.includes('2222222'));
    expect(secondCommit).not.toBeUndefined();

    await act(async () => {
      secondCommit?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(getRepositoryState).toHaveBeenLastCalledWith({ ref: '2222222', type: 'commit' });
    });
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    document.body.querySelector('.review-source-popover')?.remove();
    container.remove();
  }
});

test('walkthrough launch errors stay in the review guide without replacing the file tree', async () => {
  const changedFile = {
    fingerprint: 'src/app.ts:1',
    path: 'src/app.ts',
    sections: [
      {
        binary: false,
        id: 'src/app.ts:unstaged',
        kind: 'unstaged',
        patch: 'diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n',
      },
    ],
    status: 'modified',
  } satisfies ChangedFile;
  const getWalkthrough = vi.fn(async () => ({
    reason: 'Codex walkthrough timed out.',
    status: 'unavailable' as const,
  }));

  window.codiff = createCodiffMock({
    getLaunchOptions: vi.fn(async () => ({
      repositoryPathProvided: true,
      walkthrough: true,
    })),
    getRepositoryState: vi.fn(async () => ({
      ...repositoryState,
      files: [changedFile],
    })),
    getWalkthrough,
  });

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Walkthrough unavailable');
    });

    expect(container.querySelector('.review-guide-sidebar')).not.toBeNull();
    expect(container.querySelector('.review-guide-status')).not.toBeNull();
    expect(container.querySelector('.sidebar .file-tree-shell')).not.toBeNull();
    expect(container.querySelectorAll('button[role="tab"]')).toHaveLength(0);
    expect(getWalkthrough).toHaveBeenCalledTimes(1);
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});
