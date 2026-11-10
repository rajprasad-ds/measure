import { useEffect, useState } from "react";
import { getLocalImageBlob } from "./imageRepository";

type Props = { imageId?: string; alt: string };

export default function CardImage({ imageId, alt }: Props) {
  const [url, setUrl] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    if (!imageId) {
      setUrl("");
      setLoadError(null);
      return;
    }
    void getLocalImageBlob(imageId)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
          setLoadError(null);
        } else {
          setUrl("");
          setLoadError("Photo isn’t downloaded on this device yet.");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Could not load this photo.",
          );
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId]);

  if (!imageId) return null;
  if (!url) {
    return <p className="image-input-missing">{loadError ?? "Loading photo…"}</p>;
  }
  return <img className="card-content-image" src={url} alt={alt} />;
}
