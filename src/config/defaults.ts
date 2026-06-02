import type { CodiffConfig, CodiffKeymap, CodiffSettings } from './types.ts';

export const defaultSettings: CodiffSettings = {
  copyCommentsOnClose: false,
  diffStyle: 'split',
  lastRepositoryPath: '',
  openAIModel: 'gpt-5.5',
  showOutdated: false,
  showWhitespace: false,
  theme: 'system',
  vimMode: false,
  wordWrap: false,
};

export const defaultKeymap: CodiffKeymap = {
  closeSearch: 'Escape',
  commandBar: 'Mod+Shift+p',
  diffSearch: 'Mod+f',
  discardComment: 'Escape',
  fileFilter: 'Mod+p',
  historyTab: 'Mod+3',
  nextSearchMatch: 'Enter',
  prevSearchMatch: 'Shift+Enter',
  submitComment: 'Mod+Enter',
  toggleSidebar: 'Mod+b',
  treeTab: 'Mod+1',
  walkthroughTab: 'Mod+l',
};

export const defaultConfig: CodiffConfig = {
  keymap: defaultKeymap,
  settings: defaultSettings,
};
