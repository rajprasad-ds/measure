import { useCallback, useEffect, useRef, useState } from "react";
import { driveImageStore, isUploadQueueRunning, processUploadQueue } from "./driveImageStore";
import {
  getImageRecord,
  getLocalImageBlob,
  markImageFailed,
  resetImageUpload,
  saveImageFile,
} from "./imageRepository";

type Props = {
  label: string;
  name: string;
  value?: string;
  ownerUserId?: string;
  onUploadComplete?: () => void;
  required?: boolean;
  onChange?: (imageId: string) => void;
};

export default function ImageInput({
  label,
  name,
  value,
  ownerUserId,
  onUploadComplete,
  required = false,
  onChange,
}: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [imageId, setImageId] = useState(value ?? "");
  const [previewUrl, setPreviewUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<{
    status: string;
    remoteId?: string;
    lastError?: string;
    attempts?: number;
  } | null>(null);

  useEffect(() => {
    setImageId(value ?? "");
  }, [value]);

  const refreshRecord = useCallback(async () => {
    if (!imageId) {
      setRecord(null);
      return;
    }
    const rec = await getImageRecord(imageId);
    if (rec) {
      setRecord({
        status: rec.status,
        remoteId: rec.remoteId,
        lastError: rec.lastError,
        attempts: rec.attempts,
      });
    } else {
      setRecord(null);
    }
  }, [imageId]);

  useEffect(() => {
    refreshRecord();
    // Re-check status every few seconds while an upload is in flight.
    const timer = setInterval(refreshRecord, 3000);
    return () => clearInterval(timer);
  }, [imageId, refreshRecord]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    if (!imageId) {
      setPreviewUrl("");
      return;
    }
    void getLocalImageBlob(imageId)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setPreviewUrl(objectUrl);
        } else if (record?.remoteId) {
          // Blob not local yet but uploaded to Drive: preview will load
          // through CardImage's download path; show nothing here.
          setPreviewUrl("");
        } else {
          setPreviewUrl("");
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load this image.",
          );
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, record?.remoteId]);

  async function chooseFile(file?: File) {
    if (!file) return;
    setIsSaving(true);
    setError(null);
    try {
      const nextId = await saveImageFile(file, ownerUserId);
      setImageId(nextId);
      onChange?.(nextId);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this image.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function retryUpload() {
    if (!imageId || !record) return;
    setError(null);
    try {
      await resetImageUpload(imageId);
      await processUploadQueue();
      onUploadComplete?.();
    } catch (queueError) {
      const message =
        queueError instanceof Error
          ? queueError.message
          : "Retry failed.";
      setError(message);
      await markImageFailed(imageId, message);
    }
  }

  async function reconnectDrive() {
    try {
      // Start the OAuth popup before any await so the browser recognizes the click.
      const connection = driveImageStore.reconnect();
      if (imageId) await resetImageUpload(imageId);
      await connection;
      await processUploadQueue();
      onUploadComplete?.();
    } catch (reconnectError) {
      setError(
        reconnectError instanceof Error
          ? reconnectError.message
          : "Could not reconnect Google Drive.",
      );
    }
  }

  const statusLabel = (() => {
    switch (record?.status) {
      case "local":
        return "Saved on this device";
      case "pending":
        return "Waiting to upload";
      case "uploading":
        return "Uploading photo…";
      case "uploaded":
        return record.remoteId ? "Uploaded" : "Uploaded";
      case "failed":
        return "Upload failed";
      default:
        return "Ready";
    }
  })();

  return (
    <div className="image-input">
      <span className="image-input-label">
        {label}
        {required && <span> · required</span>}
      </span>
      <input type="hidden" name={name} value={imageId} />
      {previewUrl ? (
        <img className="image-input-preview" src={previewUrl} alt={`${label} preview`} />
      ) : imageId ? (
        <p className="image-input-missing">
          {record?.remoteId ? "Stored in Google Drive." : "Photo isn’t downloaded on this device yet."}
        </p>
      ) : (
        <p className="image-input-hint">
          Take a photo or choose one. It’s stored offline on this device;
          It stays on this device until you submit the session.
        </p>
      )}
      <div className="image-input-actions">
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={isSaving}>
          {isSaving ? "Saving photo…" : "Take photo"}
        </button>
        <button type="button" onClick={() => galleryRef.current?.click()} disabled={isSaving}>
          Choose photo
        </button>
        {imageId && (
          <button
            type="button"
            onClick={() => {
              setImageId("");
              setPreviewUrl("");
              setError(null);
              setRecord(null);
              onChange?.("");
            }}
          >
            Remove
          </button>
        )}
      </div>
      <input
        ref={cameraRef}
        className="image-input-file"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label={`Take ${label.toLowerCase()}`}
        style={{ display: "none" }}
        onChange={(event) => {
          void chooseFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        className="image-input-file"
        type="file"
        accept="image/*"
        aria-label={`Choose ${label.toLowerCase()} from gallery`}
        style={{ display: "none" }}
        onChange={(event) => {
          void chooseFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {record && record.status !== "uploaded" && (
        <div className="image-status">
          <span className={`image-status-badge status-${record.status}`}>
            {statusLabel}
          </span>
          {record.status === "failed" && (
            <>
              <button className="image-status-button" type="button" onClick={retryUpload} disabled={isUploadQueueRunning()}>
                Retry upload
              </button>
              {record.lastError && (
                <span className="image-status-error">{record.lastError}</span>
              )}
            </>
          )}
          {record.status !== "local" && !record.remoteId && (
            <button className="image-status-button" type="button" onClick={reconnectDrive}>
              {record.status === "failed" ? "Reconnect Google Drive" : "Connect Google Drive"}
            </button>
          )}
        </div>
      )}
      {error && <p className="database-error" role="alert">{error}</p>}
    </div>
  );
}
