export type NoteBlock = Record<string, unknown>;

export type AuthUser = {
  id: string;
  username: string;
};

export type NoteSummary = {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
  isArchived: boolean;
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
  parentId?: string | null;
  content?: NoteBlock[];
};

export type NoteUpdateInput = {
  title?: string;
  icon?: string;
  parentId?: string | null;
  content?: NoteBlock[];
  isArchived?: boolean;
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
