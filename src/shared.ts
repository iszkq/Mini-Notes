export type NoteBlock = Record<string, unknown>;

export type NoteKind = "page" | "category";

export type NoteTitleSize = "h1" | "h2" | "h3";

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
  titleSize: NoteTitleSize;
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
  titleSize?: NoteTitleSize;
  parentId?: string | null;
  sortOrder?: number;
  content?: NoteBlock[];
};

export type NoteUpdateInput = {
  title?: string;
  icon?: string;
  titleSize?: NoteTitleSize;
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
  selectedVerses: BibleNoteSelectedVerse[];
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type BibleNoteSelectedVerse = {
  verseNumber: number;
  text: string;
};

export type BibleNoteCreateInput = {
  bookName: string;
  chapterNumber: number;
  verseStart: number;
  verseEnd?: number;
  selectedText?: string;
  selectedVerses?: BibleNoteSelectedVerse[];
  body: string;
  tags?: string[];
};

export type BibleNoteUpdateInput = {
  body?: string;
  tags?: string[];
};

export type TenMinuteSection = {
  title: string;
  paragraphs: string[];
};

export type TenMinuteLesson = {
  id: string;
  name: string;
  title: string;
  sections: TenMinuteSection[];
};

export type TenMinuteTextSize = "small" | "normal" | "large";
export type TenMinuteLineSpacing = "compact" | "normal" | "loose";
export type TenMinuteTextWeight = "regular" | "medium";
export type TenMinuteTextAlign = "left" | "justify";

export type TenMinuteReaderSettings = {
  lineSpacing: TenMinuteLineSpacing;
  nameSidebarVisible: boolean;
  textAlign: TenMinuteTextAlign;
  textSize: TenMinuteTextSize;
  textWeight: TenMinuteTextWeight;
};

export type TenMinuteReaderData = {
  lessons: TenMinuteLesson[];
  settings: TenMinuteReaderSettings;
};

export type RevelationQaPrimaryCategory = {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type RevelationQaSecondaryCategory = {
  id: string;
  primaryId: string;
  name: string;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type RevelationQaItem = {
  id: string;
  secondaryId: string;
  question: string;
  answers: string[];
  tags: string[];
  source: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type RevelationQaSecondaryItemCount = {
  secondaryId: string;
  count: number;
};

export type RevelationQaLibrary = {
  primaryCategories: RevelationQaPrimaryCategory[];
  secondaryCategories: RevelationQaSecondaryCategory[];
  itemCounts: RevelationQaSecondaryItemCount[];
};

export type RevelationQaItemsPage = {
  items: RevelationQaItem[];
  limit: number;
  offset: number;
  total: number;
};

export type RevelationQaPrimaryCategoryCreateInput = {
  name: string;
  description?: string;
  sortOrder?: number;
};

export type RevelationQaPrimaryCategoryUpdateInput = {
  name?: string;
  description?: string;
  sortOrder?: number;
};

export type RevelationQaSecondaryCategoryCreateInput = {
  primaryId: string;
  name: string;
  description?: string;
  sortOrder?: number;
};

export type RevelationQaSecondaryCategoryUpdateInput = {
  primaryId?: string;
  name?: string;
  description?: string;
  sortOrder?: number;
};

export type RevelationQaItemCreateInput = {
  secondaryId: string;
  question: string;
  answers: string[];
  tags?: string[];
  source?: string;
  sortOrder?: number;
};

export type RevelationQaItemUpdateInput = {
  secondaryId?: string;
  question?: string;
  answers?: string[];
  tags?: string[];
  source?: string;
  sortOrder?: number;
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
  storageBytes: number;
  noteContentBytes: number;
  bibleNoteContentBytes: number;
  uploadBytes: number;
};

export type AdminStorageSummary = {
  totalBytes: number;
  noteContentBytes: number;
  bibleNoteContentBytes: number;
  uploadBytes: number;
  quotaBytes: number | null;
  remainingBytes: number | null;
};

export type AdminUsersResponse = {
  users: AdminUser[];
  storage: AdminStorageSummary;
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
