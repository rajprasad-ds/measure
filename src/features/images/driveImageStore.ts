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
  upload(blob: Blob, meta: { id: string; mime: string; ownerUserId: string }): Promise<{ remoteId: string }>;
  download(remoteId: string): Promise<Blob>;
  remove(remoteId: string): Promise<void>;
  reconnect(ownerUserId: string): Promise<void>;
}

let gsiLoadPromise: Promise<void> | null = null;
let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let tokenPromise: Promise<string> | null = null;
let tokenPromiseOwnerUserId: string | null = null;
let authorizedOwnerUserId: string | null = null;
let authorizationGeneration = 0;

const TOKEN_EXPIRY_SAFETY_WINDOW_MS = 60_000;

function emitDriveDiagnostic(event: string, details: Record<string, string | number | boolean | null> = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("measure:drive-diagnostic", { detail: { event, at: new Date().toISOString(), ...details } }));
}

export function clearDriveAuthorization() {
  emitDriveDiagnostic("authorization_cleared", { hadToken: Boolean(accessToken), hadPendingRequest: Boolean(tokenPromise) });
  authorizationGeneration += 1;
  accessToken = null;
  accessTokenExpiresAt = 0;
  tokenPromise = null;
  tokenPromiseOwnerUserId = null;
  authorizedOwnerUserId = null;
}

function handleUnauthorizedResponse(response: Response, operation: string) {
  if (response.status === 401 || response.status === 403) {
    clearDriveAuthorization();
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

function requestAccessToken(forceConsent: boolean, ownerUserId: string): Promise<string> {
  emitDriveDiagnostic("token_request_started", { forceConsent, gsiReady: Boolean((window as any).google?.accounts?.oauth2) });
  const gsi = (window as any).google?.accounts?.oauth2;
  if (!gsi) return Promise.reject(new Error("Google Identity Services is not ready. Please try again."));
  const clientId = getClientId();
  const requestGeneration = authorizationGeneration;
  tokenPromiseOwnerUserId = ownerUserId;
  tokenPromise = new Promise((resolve, reject) => {
    const client = gsi.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      prompt: forceConsent ? "select_account consent" : "",
      callback: (resp: any) => {
        emitDriveDiagnostic("token_callback_received", { hasError: Boolean(resp.error), errorCode: typeof resp.error === "string" ? resp.error : null, hasAccessToken: Boolean(resp.access_token), expiresInSeconds: Number(resp.expires_in ?? 0) });
        if (requestGeneration !== authorizationGeneration) {
          reject(new Error("Google Drive authorization was cleared because the signed-in account changed. Reconnect Drive to continue."));
          return;
        }
        tokenPromise = null;
        tokenPromiseOwnerUserId = null;
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error || "Google Drive access was cancelled."));
        } else if (!resp.access_token) {
          clearDriveAuthorization();
          reject(new Error("Google did not return a Drive access token. Please reconnect."));
        } else {
          const token = resp.access_token as string;
          accessToken = token;
          authorizedOwnerUserId = ownerUserId;
          accessTokenExpiresAt = Date.now() + Math.max(0, Number(resp.expires_in ?? 0)) * 1_000;
          emitDriveDiagnostic("token_saved", { tokenValid: hasDriveAccessToken(ownerUserId), expiresInSeconds: Number(resp.expires_in ?? 0) });
          resolve(token);
        }
      },
    });
    // Request directly from the click handler so the browser permits the popup.
    client.requestAccessToken({ prompt: forceConsent ? "select_account consent" : "" });
  });
  return tokenPromise;
}

async function ensureAccessToken(ownerUserId?: string): Promise<string> {
  if (
    accessToken &&
    accessTokenExpiresAt - Date.now() > TOKEN_EXPIRY_SAFETY_WINDOW_MS
  ) {
    if (ownerUserId && authorizedOwnerUserId !== ownerUserId) {
      throw new Error("Google Drive is connected to a different Measure account. Switch back to the account that owns these photos.");
    }
    return accessToken;
  }
  if (accessToken) clearDriveAuthorization();
  if (tokenPromise) {
    if (ownerUserId && tokenPromiseOwnerUserId !== ownerUserId) {
      throw new Error("A Google Drive connection is already being prepared for a different Measure account.");
    }
    return tokenPromise;
  }
  if (!(window as any).google?.accounts?.oauth2) await loadGSI();
  throw new Error("Google Drive needs to be connected. Reconnect Google Drive to upload photos. Your local data is safe.");
}

export function hasDriveAccessToken(ownerUserId?: string): boolean {
  return Boolean(
    accessToken &&
    accessTokenExpiresAt - Date.now() > TOKEN_EXPIRY_SAFETY_WINDOW_MS &&
    (!ownerUserId || authorizedOwnerUserId === ownerUserId),
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
    meta: { id: string; mime: string; ownerUserId: string },
  ): Promise<{ remoteId: string }> {
    const token = await ensureAccessToken(meta.ownerUserId);
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

  reconnect(ownerUserId: string): Promise<void> {
    emitDriveDiagnostic("reconnect_started", { hasOwner: Boolean(ownerUserId) });
    if (!ownerUserId) return Promise.reject(new Error("Sign in to Measure before connecting Google Drive."));
    clearDriveAuthorization();
    if ((window as any).google?.accounts?.oauth2) {
      return requestAccessToken(true, ownerUserId).then(() => undefined);
    }
    return loadGSI().then(() => requestAccessToken(true, ownerUserId)).then(() => undefined);
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

export async function retryFailedUploads(ownerUserId: string): Promise<void> {
  const pending = await getPendingImages(ownerUserId);
  for (const image of pending) {
    if (image.status === "failed" || image.status === "uploading") {
      await resetImageUpload(image.id, ownerUserId);
      lastAttemptAtById.delete(image.id);
    }
  }
}

export type UploadQueueProgress = {
  completed: number;
  total: number;
  failed: number;
  currentImageId: string | null;
};

export async function processUploadQueue(
  ownerUserId: string,
  store: ImageStore = driveImageStore,
  onProgress?: (progress: UploadQueueProgress) => void,
): Promise<void> {
  if (!ownerUserId) throw new Error("A signed-in account is required to upload photos.");
  if (running) return;
  running = true;
  try {
    const pending = await getPendingImages(ownerUserId);
    // No queued photos means Drive authorization is irrelevant. This lets
    // session/card metadata sync without requiring a Drive token unnecessarily.
    if (pending.length === 0) {
      onProgress?.({ completed: 0, total: 0, failed: 0, currentImageId: null });
      return;
    }
    // Do not turn queued photos into failed uploads just because this page load
    // has no in-memory Google token. Require explicit connection first.
    if (store === driveImageStore) await ensureAccessToken(ownerUserId);
    const now = Date.now();
    const eligible = pending.filter((image) => {
      const lastTry = lastAttemptAtById.get(image.id) ?? 0;
      return now >= lastTry + backoffFor(image.attempts ?? 0) &&
        (image.attempts ?? 0) < MAX_ATTEMPTS;
    });
    let completed = 0;
    let failed = 0;
    onProgress?.({ completed, total: eligible.length, failed, currentImageId: null });

    for (const image of pending) {
      const lastTry = lastAttemptAtById.get(image.id) ?? 0;
      const nextRetry = lastTry + backoffFor(image.attempts ?? 0);
      if (now < nextRetry) continue;
      if ((image.attempts ?? 0) >= MAX_ATTEMPTS) continue;

      onProgress?.({ completed, total: eligible.length, failed, currentImageId: image.id });
      if (store === driveImageStore) await ensureAccessToken(ownerUserId);
      const blob = await getLocalImageBlob(image.id);
      if (!blob) {
        await markImageFailed(image.id, ownerUserId, "Local photo is no longer available.");
        completed += 1;
        failed += 1;
        onProgress?.({ completed, total: eligible.length, failed, currentImageId: null });
        continue;
      }
      lastAttemptAtById.set(image.id, Date.now());
      await markImageUploading(image.id, ownerUserId);
      try {
        const { remoteId } = await store.upload(blob, {
          id: image.id,
          mime: image.mime,
          ownerUserId,
        });
        await markImageUploaded(image.id, ownerUserId, remoteId);
        lastAttemptAtById.delete(image.id);
        completed += 1;
        onProgress?.({ completed, total: eligible.length, failed, currentImageId: null });
      } catch (error) {
        if (store === driveImageStore && hasDriveAccessToken() && !hasDriveAccessToken(ownerUserId)) {
          await resetImageUpload(image.id, ownerUserId);
          break;
        }
        await markImageFailed(
          image.id,
          ownerUserId,
          error instanceof Error ? error.message : "Upload failed.",
        );
        completed += 1;
        failed += 1;
        onProgress?.({ completed, total: eligible.length, failed, currentImageId: null });
        // An authorization failure invalidates the shared token. Stop here so
        // the remaining queue entries stay pending instead of being marked as
        // failed one by one without a usable connection.
        if (store === driveImageStore && !hasDriveAccessToken(ownerUserId)) break;
      }
    }
  } finally {
    running = false;
  }
}

export function isUploadQueueRunning(): boolean {
  return running;
}
