export type NoteBlock = Record<string, unknown>;

export type NoteKind = "page" | "category";

export type AuthUser = {
  id: string;
  username: string;
  isAdmin: boolean;
};

export type NoteSummary = {
  id: string;
  title: string;
  icon: string;
  kind: NoteKind;
  parentId: string | null;
  isArchived: boolean;
  shareToken: string | null;
  sharedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Note = NoteSummary & {
  content: NoteBlock[];
};

export type NoteCreateInput = {
  title?: string;
  icon?: string;
  kind?: NoteKind;
  parentId?: string | null;
  sortOrder?: number;
  content?: NoteBlock[];
};

export type NoteUpdateInput = {
  title?: string;
  icon?: string;
  parentId?: string | null;
  sortOrder?: number;
  content?: NoteBlock[];
  isArchived?: boolean;
};

export type BibleNote = {
  id: string;
  bookName: string;
  chapterNumber: number;
  verseStart: number;
  verseEnd: number;
  selectedText: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type BibleNoteCreateInput = {
  bookName: string;
  chapterNumber: number;
  verseStart: number;
  verseEnd?: number;
  selectedText?: string;
  body: string;
  tags?: string[];
};

export type BibleNoteUpdateInput = {
  body?: string;
  tags?: string[];
};

export type LoginInput = {
  username: string;
  password: string;
};

export type RegisterInput = LoginInput & {
  inviteCode: string;
};

export type SessionStatus = {
  ok: true;
  authRequired: boolean;
  authenticated: boolean;
  hasUsers: boolean;
  user: AuthUser | null;
};

export type UploadResult = {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
};

export type AdminUser = {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
  noteCount: number;
  uploadCount: number;
};

export type AdminUserCreateInput = {
  username: string;
  password: string;
  isAdmin?: boolean;
};

export type AdminUserUpdateInput = {
  username?: string;
  password?: string;
  isAdmin?: boolean;
};

export type AdminUpload = {
  id: string;
  userId: string;
  username: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
};

export type AdminUploadUpdateInput = {
  name: string;
};
