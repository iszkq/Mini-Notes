import type {
  LoginInput,
  Note,
  NoteCreateInput,
  NoteSummary,
  NoteUpdateInput,
  RegisterInput,
  SessionStatus,
  UploadResult
} from "./shared";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function getStatus(): Promise<SessionStatus> {
  return apiRequest("/api/status");
}

export async function login(input: LoginInput): Promise<SessionStatus> {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function register(input: RegisterInput): Promise<SessionStatus> {
  return apiRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function logout(): Promise<{ ok: true }> {
  return apiRequest("/api/auth/logout", {
    method: "POST"
  });
}

export async function listNotes(): Promise<NoteSummary[]> {
  return apiRequest("/api/notes");
}

export async function getNote(id: string): Promise<Note> {
  return apiRequest(`/api/notes/${encodeURIComponent(id)}`);
}

export async function createNote(input: NoteCreateInput): Promise<Note> {
  return apiRequest("/api/notes", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateNote(
  id: string,
  input: NoteUpdateInput
): Promise<Note> {
  return apiRequest(`/api/notes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function deleteNote(id: string): Promise<{ ok: true }> {
  return apiRequest(`/api/notes/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export async function uploadAsset(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest("/api/uploads", {
    method: "POST",
    body: formData
  });
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (shouldSetJsonContentType(init.body) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(data?.error ?? response.statusText, response.status);
  }

  return data as T;
}

function shouldSetJsonContentType(body: RequestInit["body"]): body is string {
  return typeof body === "string";
}
