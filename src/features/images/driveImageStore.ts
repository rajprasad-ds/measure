import {
  getLocalImageBlob,
  getPendingImages,
  markImageFailed,
  markImageUploaded,
  markImageUploading,
  resetImageUpload,
} from "./imageRepository";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "JEE Practice";
const GSI_CLIENT_SCRIPT = "https://accounts.google.com/gsi/client";

export interface ImageStore {
  upload(blob: Blob, meta: { id: string; mime: string }): Promise<{ remoteId: string }>;
  download(remoteId: string): Promise<Blob>;
  remove(remoteId: string): Promise<void>;
  reconnect(): Promise<void>;
}

let gsiLoadPromise: Promise<void> | null = null;
let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let tokenPromise: Promise<string> | null = null;

const TOKEN_EXPIRY_SAFETY_WINDOW_MS = 60_000;

function clearAccessToken() {
  accessToken = null;
  accessTokenExpiresAt = 0;
}

function handleUnauthorizedResponse(response: Response, operation: string) {
  if (response.status === 401 || response.status === 403) {
    clearAccessToken();
    throw new Error(
      `Google Drive authorization expired or was revoked during ${operation}. Reconnect Google Drive to continue. Your local data is safe.`,
    );
  }
}

function loadGSI(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No browser window."));
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (gsiLoadPromise) return gsiLoadPromise;
  gsiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_CLIENT_SCRIPT;
    script.async = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => reject(new Error("Could not load Google Identity Services."));
    document.head.appendChild(script);
  });
  return gsiLoadPromise;
}

function getClientId(): string {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!id) {
    throw new Error(
      "Google Drive is not configured. Add VITE_GOOGLE_CLIENT_ID to .env.local.",
    );
  }
  return id;
}

function requestAccessToken(forceConsent = false): Promise<string> {
  const gsi = (window as any).google?.accounts?.oauth2;
  if (!gsi) return Promise.reject(new Error("Google Identity Services is not ready. Please try again."));
  const clientId = getClientId();
  tokenPromise = new Promise((resolve, reject) => {
    const client = gsi.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      prompt: forceConsent ? "consent" : "",
      callback: (resp: any) => {
        tokenPromise = null;
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error || "Google Drive access was cancelled."));
        } else if (!resp.access_token) {
          clearAccessToken();
          reject(new Error("Google did not return a Drive access token. Please reconnect."));
        } else {
          accessToken = resp.access_token;
          accessTokenExpiresAt = Date.now() + Math.max(0, Number(resp.expires_in ?? 0)) * 1_000;
          resolve(accessToken);
        }
      },
    });
    // Request directly from the click handler so the browser permits the popup.
    client.requestAccessToken({ prompt: forceConsent ? "consent" : "" });
  });
  return tokenPromise;
}

async function ensureAccessToken(): Promise<string> {
  if (
    accessToken &&
    accessTokenExpiresAt - Date.now() > TOKEN_EXPIRY_SAFETY_WINDOW_MS
  ) return accessToken;
  if (accessToken) clearAccessToken();
  if (tokenPromise) return tokenPromise;
  if (!(window as any).google?.accounts?.oauth2) await loadGSI();
  throw new Error("Google Drive needs to be connected. Reconnect Google Drive to upload photos. Your local data is safe.");
}

export function hasDriveAccessToken(): boolean {
  return Boolean(
    accessToken &&
    accessTokenExpiresAt - Date.now() > TOKEN_EXPIRY_SAFETY_WINDOW_MS,
  );
}

export function prepareDriveConnection(): Promise<void> {
  return loadGSI();
}

async function getOrCreateFolderId(token: string): Promise<string> {
  const q = encodeURIComponent(
    `mimeType = "application/vnd.google-apps.folder" and name = '${FOLDER_NAME}' and trashed = false`,
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&orderBy=createdTime`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    handleUnauthorizedResponse(res, "folder lookup");
    throw new Error(`Drive folder search failed: ${res.status}`);
  }
  const data = await res.json();
  const files: Array<{ id: string; createdTime: string }> = data.files ?? [];
  if (files.length > 0) return files[0].id;

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  if (!createRes.ok) {
    handleUnauthorizedResponse(createRes, "folder creation");
    throw new Error(`Drive folder create failed: ${createRes.status}`);
  }
  const created = await createRes.json();
  return created.id as string;
}

export class DriveImageStore implements ImageStore {
  async upload(
    blob: Blob,
    meta: { id: string; mime: string },
  ): Promise<{ remoteId: string }> {
    const token = await ensureAccessToken();
    const folderId = await getOrCreateFolderId(token);

    const ext = meta.mime.split("/")[1] ?? "jpg";
    const metadata = {
      name: `${meta.id}.${ext}`,
      parents: [folderId],
    };
    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    );
    form.append("file", blob);

    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
    );
    if (!res.ok) {
      handleUnauthorizedResponse(res, "photo upload");
      const text = await res.text().catch(() => "");
      throw new Error(`Drive upload failed: ${res.status} ${text}`);
    }
    const file = await res.json();
    return { remoteId: file.id as string };
  }

  async download(remoteId: string): Promise<Blob> {
    const token = await ensureAccessToken();
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${remoteId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      handleUnauthorizedResponse(res, "photo download");
      throw new Error(`Drive download failed: ${res.status}`);
    }
    return res.blob();
  }

  async remove(remoteId: string): Promise<void> {
    const token = await ensureAccessToken();
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${remoteId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      handleUnauthorizedResponse(res, "photo deletion");
      throw new Error(`Drive delete failed: ${res.status}`);
    }
  }

  reconnect(): Promise<void> {
    clearAccessToken();
    tokenPromise = null;
    if ((window as any).google?.accounts?.oauth2) {
      return requestAccessToken(true).then(() => undefined);
    }
    return loadGSI().then(() => requestAccessToken(true)).then(() => undefined);
  }
}

export const driveImageStore = new DriveImageStore();

// ---------------------------------------------------------------------------
// Upload queue
// ---------------------------------------------------------------------------

const BACKOFF_MS = [5_000, 30_000, 2 * 60_000, 10 * 60_000];
const MAX_ATTEMPTS = 8;
let running = false;
const lastAttemptAtById = new Map<string, number>();

function backoffFor(attempts: number): number {
  if (attempts <= 0) return 0;
  return BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
}

export async function retryFailedUploads(): Promise<void> {
  const pending = await getPendingImages();
  for (const image of pending) {
    if (image.status === "failed" || image.status === "uploading") {
      await resetImageUpload(image.id);
      lastAttemptAtById.delete(image.id);
    }
  }
}

export async function processUploadQueue(
  store: ImageStore = driveImageStore,
): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Do not turn every queued photo into a failed upload just because this
    // page load has no in-memory Google token. Require an explicit connection
    // before changing any queue records.
    if (store === driveImageStore) await ensureAccessToken();
    const pending = await getPendingImages();
    const now = Date.now();

    for (const image of pending) {
      const lastTry = lastAttemptAtById.get(image.id) ?? 0;
      const nextRetry = lastTry + backoffFor(image.attempts ?? 0);
      if (now < nextRetry) continue;
      if ((image.attempts ?? 0) >= MAX_ATTEMPTS) continue;

      const blob = await getLocalImageBlob(image.id);
      if (!blob) {
        await markImageFailed(image.id, "Local photo is no longer available.");
        continue;
      }

      lastAttemptAtById.set(image.id, Date.now());
      await markImageUploading(image.id);
      try {
        const { remoteId } = await store.upload(blob, {
          id: image.id,
          mime: image.mime,
        });
        await markImageUploaded(image.id, remoteId);
        lastAttemptAtById.delete(image.id);
      } catch (error) {
        await markImageFailed(
          image.id,
          error instanceof Error ? error.message : "Upload failed.",
        );
        // An authorization failure invalidates the shared token. Stop here so
        // the remaining queue entries stay pending instead of being marked as
        // failed one by one without a usable connection.
        if (store === driveImageStore && !hasDriveAccessToken()) break;
      }
    }
  } finally {
    running = false;
  }
}

export function isUploadQueueRunning(): boolean {
  return running;
}
