import { useEffect, useState } from "react";
import { getImageRecord, getLocalImageBlob } from "./imageRepository";
import { driveImageStore } from "./driveImageStore";

type Props = { imageId?: string; alt: string };

export default function CardImage({ imageId, alt }: Props) {
  const [url, setUrl] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    let downloading = false;

    async function load() {
      if (!imageId) {
        setUrl("");
        setLoadError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const blob = await getLocalImageBlob(imageId);
        if (cancelled) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
          setLoadError(null);
          setLoading(false);
          return;
        }
        const record = await getImageRecord(imageId);
        if (cancelled) return;
        if (!record?.remoteId) {
          setUrl("");
          setLoadError("Photo isn’t downloaded on this device yet.");
          setLoading(false);
          return;
        }
        downloading = true;
        const driveBlob = await driveImageStore.download(record.remoteId);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(driveBlob);
        setUrl(objectUrl);
        setLoadError(null);
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "Could not load this photo.",
        );
        setLoading(false);
      } finally {
        if (!downloading) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId]);

  if (!imageId) return null;
  if (!url) {
    return (
      <p className="image-input-missing">
        {loading ? "Loading photo…" : loadError ?? "Loading photo…"}
      </p>
    );
  }
  return <img className="card-content-image" src={url} alt={alt} />;
}
