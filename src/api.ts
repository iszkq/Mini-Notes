import type {
  AdminUpload,
  AdminUploadUpdateInput,
  AdminUser,
  AdminUserCreateInput,
  AdminUserUpdateInput,
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

export async function getPublicNote(shareToken: string): Promise<Note> {
  return apiRequest(`/api/public/notes/${encodeURIComponent(shareToken)}`);
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

export async function enableShare(id: string): Promise<Note> {
  return apiRequest(`/api/notes/${encodeURIComponent(id)}/share`, {
    method: "POST"
  });
}

export async function disableShare(id: string): Promise<Note> {
  return apiRequest(`/api/notes/${encodeURIComponent(id)}/share`, {
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

export async function listAdminUsers(): Promise<AdminUser[]> {
  return apiRequest("/api/admin/users");
}

export async function createAdminUser(input: AdminUserCreateInput): Promise<AdminUser> {
  return apiRequest("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateAdminUser(
  id: string,
  input: AdminUserUpdateInput
): Promise<AdminUser> {
  return apiRequest(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function deleteAdminUser(id: string): Promise<{ ok: true }> {
  return apiRequest(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export async function listAdminUploads(userId: string): Promise<AdminUpload[]> {
  return apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/uploads`);
}

export async function createAdminUpload(userId: string, file: File): Promise<AdminUpload> {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/uploads`, {
    method: "POST",
    body: formData
  });
}

export async function updateAdminUpload(
  id: string,
  input: AdminUploadUpdateInput
): Promise<AdminUpload> {
  return apiRequest(`/api/admin/uploads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function deleteAdminUpload(id: string): Promise<{ ok: true }> {
  return apiRequest(`/api/admin/uploads/${encodeURIComponent(id)}`, {
    method: "DELETE"
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
  const data = tryParseJson(text);
  const contentType = response.headers.get("Content-Type") ?? "";

  if (!response.ok) {
    const message = summarizeApiError(data, text, contentType, response.statusText);
    throw new ApiError(message || "请求失败。", response.status);
  }

  return (data ?? null) as T;
}

function shouldSetJsonContentType(body: RequestInit["body"]): body is string {
  return typeof body === "string";
}

function tryParseJson(value: string): unknown {
  if (!value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function summarizeApiError(
  data: unknown,
  text: string,
  contentType: string,
  statusText: string
): string {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    return data.error;
  }

  if (contentType.toLowerCase().includes("text/html") || /<!doctype html|<html/i.test(text)) {
    const code =
      /error code[:\s>]+(\d{3,5})/i.exec(text)?.[1] ??
      /cf-error-code[^>]*>(\d{3,5})</i.exec(text)?.[1];

    return code
      ? `服务暂时异常，请稍后重试。错误代码 ${code}。`
      : "服务暂时异常，请稍后重试。";
  }

  return text.trim() || statusText || "请求失败。";
}
