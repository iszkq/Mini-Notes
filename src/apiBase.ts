/** Shared URL helper for web, Worker-side utility modules, and Capacitor. */
const runtimeImportMeta = import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
};

const configuredBaseUrl = (runtimeImportMeta.env?.VITE_API_BASE_URL ?? "").trim();
// This is the default workers.dev address for the repository's Worker. It is
// only used by a Capacitor build; normal web deployments remain same-origin.
const DEFAULT_MOBILE_API_BASE_URL = "https://mini-notes.iszkq.workers.dev";
const runtimeLocation = (globalThis as { location?: { protocol?: string } }).location;
const isCapacitorRuntime = runtimeLocation?.protocol === "capacitor:";

export const API_BASE_URL = (configuredBaseUrl || (isCapacitorRuntime ? DEFAULT_MOBILE_API_BASE_URL : ""))
  .trim()
  .replace(/\/$/, "");

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
