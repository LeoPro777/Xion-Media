import { create } from 'zustand';

export interface ChannelProgressItem {
  id: string; // integration ID or channel ID
  postId?: string;
  name: string;
  network: string; // 'Facebook', 'Instagram', 'TikTok', 'YouTube', 'Telegram', 'Threads', 'X (Twitter)'
  platformKey: string; // 'facebook', 'instagram', 'tiktok', 'youtube', 'telegram', 'threads', 'x'
  badgeLetter: string;
  avatarBg: string;
  avatarPicture?: string;
  networkColor: string;
  targetType: string;
  isDraft: boolean;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  statusMessage: string;
  error?: string;
  releaseURL?: string;
  settings?: any;
  postData?: any;
}

export interface PublishProgressState {
  isOpen: boolean;
  isMinimized: boolean;
  group: string;
  title: string;
  contentSnippet: string;
  thumbnail?: string;
  mediaType: 'video' | 'image';
  channels: ChannelProgressItem[];
  
  openProgressModal: (params: {
    group: string;
    title?: string;
    contentSnippet?: string;
    thumbnail?: string;
    mediaType?: 'video' | 'image';
    channels: ChannelProgressItem[];
  }) => void;
  updateChannel: (id: string, updates: Partial<ChannelProgressItem>) => void;
  updateChannels: (channels: ChannelProgressItem[]) => void;
  minimize: () => void;
  restore: () => void;
  close: () => void;
  retryCallback?: (channel: ChannelProgressItem) => void;
  setRetryCallback: (cb: (channel: ChannelProgressItem) => void) => void;
}

export const usePublishProgressStore = create<PublishProgressState>((set) => ({
  isOpen: false,
  isMinimized: false,
  group: '',
  title: '',
  contentSnippet: '',
  thumbnail: undefined,
  mediaType: 'video',
  channels: [],
  retryCallback: undefined,

  openProgressModal: (params) => {
    set({
      isOpen: true,
      isMinimized: false,
      group: params.group,
      title: params.title || 'Publicación Multiplataforma',
      contentSnippet: params.contentSnippet || '',
      thumbnail: params.thumbnail,
      mediaType: params.mediaType || 'video',
      channels: params.channels,
    });
  },

  updateChannel: (id, updates) => {
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === id || ch.postId === id ? { ...ch, ...updates } : ch
      ),
    }));
  },

  updateChannels: (channels) => {
    set({ channels });
  },

  minimize: () => set({ isMinimized: true }),
  restore: () => set({ isMinimized: false }),
  close: () => set({ isOpen: false, isMinimized: false, group: '', channels: [] }),
  setRetryCallback: (cb) => set({ retryCallback: cb }),
}));

