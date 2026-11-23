import { database } from "../../database";
import type { LocalImageRecord } from "../../database";

const MAX_EDGE = 2_000;
const MAX_BYTES = 600 * 1_024;
const MAX_INPUT_BYTES = 20 * 1_024 * 1_024;

export async function saveImageFile(
  file: File,
  ownerUserId?: string,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Choose an image smaller than 20 MB.");
  }
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot resize images. Try a newer browser.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare this image.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await canvasToJpeg(canvas, attempt < 3 ? 0.72 - attempt * 0.08 : 0.48);
      if (blob.size <= MAX_BYTES) break;
      scale *= 0.82;
    }

    if (!blob) throw new Error("Could not prepare this image.");
    if (blob.size > MAX_BYTES) {
      throw new Error("This image is too detailed to store. Try a smaller image.");
    }

    const id = globalThis.crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await database.transaction(
      "rw",
      database.localImages,
      database.localImageBlobs,
      async () => {
        await database.localImages.add({
          id,
          mime: blob.type,
          width: Math.max(1, Math.round(bitmap.width * scale)),
          height: Math.max(1, Math.round(bitmap.height * scale)),
          bytes: blob.size,
          status: "local",
          syncStatus: "local",
          ownerUserId,
          attempts: 0,
          createdAt,
        });
        await database.localImageBlobs.add({ id, blob });
      },
    );
    return id;
  } finally {
    bitmap.close();
  }
}

export async function getLocalImageBlob(id: string): Promise<Blob | undefined> {
  return (await database.localImageBlobs.get(id))?.blob;
}

export async function getImageRecord(id: string): Promise<LocalImageRecord | undefined> {
  return database.localImages.get(id);
}

export async function getPendingImages(): Promise<LocalImageRecord[]> {
  return database.localImages
    .where("status")
    .anyOf(["pending", "failed", "uploading"])
    .toArray();
}

export async function markImageUploaded(
  id: string,
  remoteId: string,
): Promise<void> {
  await database.localImages.update(id, {
    status: "uploaded",
    remoteId,
    syncStatus: "pending",
    lastError: undefined,
  });
}

export async function markImageFailed(
  id: string,
  error: string,
): Promise<void> {
  const record = await database.localImages.get(id);
  if (!record) return;
  await database.localImages.update(id, {
    status: "failed",
    attempts: (record.attempts ?? 0) + 1,
    lastError: error,
  });
}

export async function resetImageUpload(id: string): Promise<void> {
  await database.localImages.update(id, {
    status: "pending",
    attempts: 0,
    lastError: undefined,
  });
}
export async function markImageUploading(id: string): Promise<void> {
  await database.localImages.update(id, { status: "uploading" });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not encode this image."));
      },
      "image/jpeg",
      quality,
    );
  });
}
