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

type CropAspect = "original" | "square" | "landscape";

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
  const editorCanvasRef = useRef<HTMLCanvasElement>(null);
  const [imageId, setImageId] = useState(value ?? "");
  const [previewUrl, setPreviewUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editorUrl, setEditorUrl] = useState("");
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [cropAspect, setCropAspect] = useState<CropAspect>("original");
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [record, setRecord] = useState<{
    status: string;
    remoteId?: string;
    lastError?: string;
    attempts?: number;
  } | null>(null);

  useEffect(() => { setImageId(value ?? ""); }, [value]);

  const refreshRecord = useCallback(async () => {
    if (!imageId) { setRecord(null); return; }
    const rec = await getImageRecord(imageId);
    if (rec) setRecord({ status: rec.status, remoteId: rec.remoteId, lastError: rec.lastError, attempts: rec.attempts });
    else setRecord(null);
  }, [imageId]);

  useEffect(() => {
    refreshRecord();
    const timer = setInterval(refreshRecord, 3000);
    return () => clearInterval(timer);
  }, [imageId, refreshRecord]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    if (!imageId) { setPreviewUrl(""); return; }
    void getLocalImageBlob(imageId).then((blob) => {
      if (cancelled) return;
      if (blob) { objectUrl = URL.createObjectURL(blob); setPreviewUrl(objectUrl); }
      else setPreviewUrl("");
    }).catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load this image.");
    });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [imageId, record?.remoteId]);

  useEffect(() => {
    let cancelled = false;
    async function drawPreview() {
      if (!selectedFile || !editorCanvasRef.current) return;
      setIsPreparingPreview(true);
      try {
        const bitmap = await createImageBitmap(selectedFile);
        if (cancelled) { bitmap.close(); return; }
        const quarterTurn = ((rotation % 360) + 360) % 360;
        const rotatedWidth = quarterTurn % 180 === 0 ? bitmap.width : bitmap.height;
        const rotatedHeight = quarterTurn % 180 === 0 ? bitmap.height : bitmap.width;
        const rotated = document.createElement("canvas");
        rotated.width = rotatedWidth;
        rotated.height = rotatedHeight;
        const rotatedContext = rotated.getContext("2d");
        if (!rotatedContext) throw new Error("Could not prepare this image.");
        rotatedContext.translate(rotatedWidth / 2, rotatedHeight / 2);
        rotatedContext.rotate((quarterTurn * Math.PI) / 180);
        rotatedContext.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
        bitmap.close();

        const aspect = cropAspect === "square" ? 1 : cropAspect === "landscape" ? 4 / 3 : rotatedWidth / rotatedHeight;
        let cropWidth = rotatedWidth;
        let cropHeight = cropWidth / aspect;
        if (cropHeight > rotatedHeight) { cropHeight = rotatedHeight; cropWidth = cropHeight * aspect; }
        cropWidth /= zoom;
        cropHeight /= zoom;
        const sx = (rotatedWidth - cropWidth) * (panX + 1) / 2;
        const sy = (rotatedHeight - cropHeight) * (panY + 1) / 2;
        const outputWidth = 960;
        const outputHeight = Math.max(1, Math.round(outputWidth / aspect));
        const canvas = editorCanvasRef.current;
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare this image.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, outputWidth, outputHeight);
        context.drawImage(rotated, sx, sy, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
      } catch (previewError) {
        if (!cancelled) setError(previewError instanceof Error ? previewError.message : "Could not preview this image.");
      } finally {
        if (!cancelled) setIsPreparingPreview(false);
      }
    }
    void drawPreview();
    return () => { cancelled = true; };
  }, [selectedFile, rotation, zoom, panX, panY, cropAspect]);

  function openEditor(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Choose an image file."); return; }
    if (file.size > 20 * 1024 * 1024) { setError("Choose an image smaller than 20 MB."); return; }
    if (typeof createImageBitmap !== "function") { setError("This browser cannot edit images. Try a newer browser."); return; }
    setError(null);
    setSelectedFile(file);
    setEditorUrl(URL.createObjectURL(file));
    setRotation(0);
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setCropAspect("original");
  }

  function closeEditor() {
    if (editorUrl) URL.revokeObjectURL(editorUrl);
    setEditorUrl("");
    setSelectedFile(null);
    setRotation(0);
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setCropAspect("original");
  }

  async function applyEdit() {
    const canvas = editorCanvasRef.current;
    if (!canvas || !selectedFile) return;
    setIsSaving(true);
    setError(null);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Could not prepare this image."));
      }, "image/jpeg", 0.92));
      const editedFile = new File([blob], selectedFile.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
      const nextId = await saveImageFile(editedFile, ownerUserId);
      setImageId(nextId);
      onChange?.(nextId);
      closeEditor();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this image.");
    } finally {
      setIsSaving(false);
    }
  }

  async function retryUpload() {
    if (!imageId || !record) return;
    setError(null);
    try { await resetImageUpload(imageId); await processUploadQueue(); onUploadComplete?.(); }
    catch (queueError) {
      const message = queueError instanceof Error ? queueError.message : "Retry failed.";
      setError(message); await markImageFailed(imageId, message);
    }
  }

  async function reconnectDrive() {
    try {
      const connection = driveImageStore.reconnect();
      if (imageId) await resetImageUpload(imageId);
      await connection; await processUploadQueue(); onUploadComplete?.();
    } catch (reconnectError) {
      setError(reconnectError instanceof Error ? reconnectError.message : "Could not reconnect Google Drive.");
    }
  }

  const statusLabel = (() => {
    switch (record?.status) {
      case "local": return "Saved on this device";
      case "pending": return "Waiting to upload";
      case "uploading": return "Uploading photo…";
      case "uploaded": return "Uploaded";
      case "failed": return "Upload failed";
      default: return "Ready";
    }
  })();

  return (
    <div className="image-input">
      <span className="image-input-label">{label}{required && <span> · required</span>}</span>
      <input type="hidden" name={name} value={imageId} />
      {previewUrl ? (
        <img className="image-input-preview" src={previewUrl} alt={`${label} preview`} />
      ) : imageId ? (
        <p className="image-input-missing">{record?.remoteId ? "Stored in Google Drive." : "Photo isn’t downloaded on this device yet."}</p>
      ) : (
        <p className="image-input-hint">Take a photo or choose one. You can rotate and crop it before it is saved on this device.</p>
      )}
      <div className="image-input-actions">
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={isSaving}>{isSaving ? "Saving photo…" : "Take photo"}</button>
        <button type="button" onClick={() => galleryRef.current?.click()} disabled={isSaving}>Choose photo</button>
        {imageId && <button type="button" onClick={() => { setImageId(""); setPreviewUrl(""); setError(null); setRecord(null); onChange?.(""); }}>Remove</button>}
      </div>
      <input ref={cameraRef} className="image-input-file" type="file" accept="image/*" capture="environment" aria-label={`Take ${label.toLowerCase()}`} style={{ display: "none" }} onChange={(event) => { openEditor(event.target.files?.[0]); event.target.value = ""; }} />
      <input ref={galleryRef} className="image-input-file" type="file" accept="image/*" aria-label={`Choose ${label.toLowerCase()} from gallery`} style={{ display: "none" }} onChange={(event) => { openEditor(event.target.files?.[0]); event.target.value = ""; }} />

      {editorUrl && (
        <div className="image-editor-backdrop" role="presentation">
          <section className="image-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="image-editor-title">
            <h3 id="image-editor-title">Adjust photo</h3>
            <p>Rotate the image or choose a crop shape. Zoom in to trim the edges before saving.</p>
            <canvas ref={editorCanvasRef} className="image-editor-preview" aria-label="Edited photo preview" />
            <div className="image-editor-controls">
              <div className="image-editor-control-row">
                <label>Rotate</label>
                <button type="button" onClick={() => setRotation((value) => (value + 270) % 360)}>↶ 90°</button>
                <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)}>↷ 90°</button>
              </div>
              <div className="image-editor-control-row">
                <label>Crop shape</label>
                <button type="button" aria-pressed={cropAspect === "original"} onClick={() => setCropAspect("original")}>Original</button>
                <button type="button" aria-pressed={cropAspect === "square"} onClick={() => setCropAspect("square")}>Square</button>
                <button type="button" aria-pressed={cropAspect === "landscape"} onClick={() => setCropAspect("landscape")}>4:3</button>
              </div>
              <div className="image-editor-control-row">
                <label htmlFor={`image-zoom-${name}`}>Crop</label>
                <input id={`image-zoom-${name}`} type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
                <span>{zoom.toFixed(1)}×</span>
              </div>
              <div className="image-editor-control-row">
                <label htmlFor={`image-pan-x-${name}`}>Horizontal</label>
                <input id={`image-pan-x-${name}`} type="range" min="-1" max="1" step="0.05" value={panX} onChange={(event) => setPanX(Number(event.target.value))} />
              </div>
              <div className="image-editor-control-row">
                <label htmlFor={`image-pan-y-${name}`}>Vertical</label>
                <input id={`image-pan-y-${name}`} type="range" min="-1" max="1" step="0.05" value={panY} onChange={(event) => setPanY(Number(event.target.value))} />
              </div>
            </div>
            <div className="image-editor-actions">
              <button type="button" onClick={closeEditor} disabled={isSaving}>Cancel</button>
              <button type="button" onClick={() => void applyEdit()} disabled={isSaving || isPreparingPreview}>{isSaving ? "Saving…" : "Use this photo"}</button>
            </div>
          </section>
        </div>
      )}

      {record && record.status !== "uploaded" && (
        <div className="image-status">
          <span className={`image-status-badge status-${record.status}`}>{statusLabel}</span>
          {record.status === "failed" && <><button className="image-status-button" type="button" onClick={retryUpload} disabled={isUploadQueueRunning()}>Retry upload</button>{record.lastError && <span className="image-status-error">{record.lastError}</span>}</>}
          {record.status !== "local" && !record.remoteId && <button className="image-status-button" type="button" onClick={reconnectDrive}>{record.status === "failed" ? "Reconnect Google Drive" : "Connect Google Drive"}</button>}
        </div>
      )}
      {error && <p className="database-error" role="alert">{error}</p>}
    </div>
  );
}
