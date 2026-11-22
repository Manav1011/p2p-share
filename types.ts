export type MessageType = 'text' | 'file';

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type?: string;
}

export interface Message {
  id: string;
  type: MessageType;
  content: string | FileMetadata; // Text content or File metadata
  formatted?: string; // HTML for markdown
  sender: 'me' | 'peer' | 'system';
  timestamp: number;
  blobUrl?: string; // For file previews
  progress?: number; // For file transfers (0-100)
  needsAcceptance?: boolean; // If true, shows "Save to Disk" button
}

export interface FileMetaData {
  type: 'file-meta';
  id: string;
  name: string;
  size: number;
  chunkSize: number;
  mimeType?: string;
}

export interface TextData {
  type: 'text';
  content: string;
}

// Extend Window for File System Access API
declare global {
  interface Window {
    showSaveFilePicker: (options?: any) => Promise<FileSystemFileHandle>;
  }
}