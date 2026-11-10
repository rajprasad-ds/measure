import { useEffect, useRef, useState } from "react";
import { getLocalImageBlob, saveImageFile } from "./imageRepository";

type Props = {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
  onChange?: (imageId: string) => void;
};

export default function ImageInput({
  label,
  name,
  value,
  required = false,
  onChange,
}: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [imageId, setImageId] = useState(value ?? "");
  const [previewUrl, setPreviewUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setImageId(value ?? "");
  }, [value]);

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
  }, [imageId]);

  async function chooseFile(file?: File) {
    if (!file) return;
    setIsSaving(true);
    setError(null);
    try {
      const nextId = await saveImageFile(file);
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
        <p className="image-input-missing">Photo isn’t downloaded on this device yet.</p>
      ) : (
        <p className="image-input-hint">
          Take a photo or choose one. It’s stored offline on this device;
          photo sync isn’t enabled yet.
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
        onChange={(event) => {
          void chooseFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {error && <p className="database-error" role="alert">{error}</p>}
    </div>
  );
}
