import { useEffect, useRef, useState, type PointerEvent } from "react";

type Props = { file: File; onCancel: () => void; onUse: (file: File) => void; saving?: boolean };

type Rect = { left: number; top: number; right: number; bottom: number };
type Point = { x: number; y: number };

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export default function CropEditor({ file, onCancel, onUse, saving = false }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ kind: "move" | "resize" | "pinch"; handle?: string; start: Point; rect: Rect; pan: Point; zoom: number; distance?: number; midpoint?: Point } | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const [sourceSize, setSourceSize] = useState({ width: 4, height: 3 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [rect, setRect] = useState<Rect>({ left: .06, top: .06, right: .94, bottom: .94 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [ratio, setRatio] = useState("free");
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let bitmap: ImageBitmap | undefined;
    void (async () => {
      try {
        bitmap = await createImageBitmap(file);
        if (cancelled) return;
        const quarter = ((rotation % 360) + 360) % 360;
        const w = quarter % 180 ? bitmap.height : bitmap.width;
        const h = quarter % 180 ? bitmap.width : bitmap.height;
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not prepare this photo.");
        ctx.translate(w / 2, h / 2);
        ctx.rotate(quarter * Math.PI / 180);
        ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
        sourceRef.current = canvas;
        setSourceSize({ width: w, height: h });
        setZoom(1); setPan({ x: 0, y: 0 });
        setRect({ left: .06, top: .06, right: .94, bottom: .94 });
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Could not open this photo."); }
      finally { bitmap?.close(); }
    })();
    return () => { cancelled = true; };
  }, [file, rotation]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => setStageSize({ width: stage.clientWidth, height: stage.clientHeight }));
    observer.observe(stage);
    setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    return () => observer.disconnect();
  }, [sourceSize]);

  useEffect(() => {
    const canvas = canvasRef.current, source = sourceRef.current;
    if (!canvas || !source || !stageSize.width || !stageSize.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(stageSize.width * dpr);
    canvas.height = Math.round(stageSize.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, stageSize.width, stageSize.height);
    ctx.save();
    ctx.translate(stageSize.width / 2 + pan.x, stageSize.height / 2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.drawImage(source, -stageSize.width / 2, -stageSize.height / 2, stageSize.width, stageSize.height);
    ctx.restore();
    const x = rect.left * stageSize.width, y = rect.top * stageSize.height;
    const w = (rect.right - rect.left) * stageSize.width, h = (rect.bottom - rect.top) * stageSize.height;
    ctx.fillStyle = "rgba(0,0,0,.52)";
    ctx.fillRect(0, 0, stageSize.width, y);
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, stageSize.width - x - w, h);
    ctx.fillRect(0, y + h, stageSize.width, stageSize.height - y - h);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,.48)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + w / 3, y); ctx.lineTo(x + w / 3, y + h); ctx.moveTo(x + 2 * w / 3, y); ctx.lineTo(x + 2 * w / 3, y + h); ctx.moveTo(x, y + h / 3); ctx.lineTo(x + w, y + h / 3); ctx.moveTo(x, y + 2 * h / 3); ctx.lineTo(x + w, y + 2 * h / 3); ctx.stroke();
  }, [stageSize, rect, zoom, pan, sourceSize]);

  function setAspect(next: string) {
    setRatio(next);
    if (next === "free" || !stageSize.width || !stageSize.height) return;
    const target = next === "1:1" ? 1 : next === "4:3" ? 4 / 3 : 16 / 9;
    let w = rect.right - rect.left, h = rect.bottom - rect.top;
    if (w * stageSize.width / (h * stageSize.height) > target) w = h * stageSize.height * target / stageSize.width;
    else h = w * stageSize.width / (target * stageSize.height);
    const cx = (rect.left + rect.right) / 2, cy = (rect.top + rect.bottom) / 2;
    w = Math.min(w, .96); h = Math.min(h, .96);
    setRect({ left: clamp(cx - w / 2, 0, 1 - w), right: clamp(cx + w / 2, w, 1), top: clamp(cy - h / 2, 0, 1 - h), bottom: clamp(cy + h / 2, h, 1) });
  }

  function pointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", start: p, rect, pan, zoom, distance: Math.hypot(b.x-a.x,b.y-a.y), midpoint: { x:(a.x+b.x)/2, y:(a.y+b.y)/2 } };
    } else gesture.current = { kind: "move", start: p, rect, pan, zoom };
  }
  function pointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current, stage = stageRef.current;
    if (!g || !stage) return;
    const bounds = stage.getBoundingClientRect();
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a,b] = [...pointers.current.values()];
      const distance = Math.hypot(b.x-a.x,b.y-a.y);
      const mid = { x:(a.x+b.x)/2-bounds.left-bounds.width/2, y:(a.y+b.y)/2-bounds.top-bounds.height/2 };
      const nextZoom = clamp(g.zoom * distance / Math.max(1,g.distance || 1), 1, 5);
      const scale = nextZoom / g.zoom;
      setZoom(nextZoom);
      setPan({ x: mid.x - (mid.x - g.pan.x) * scale, y: mid.y - (mid.y - g.pan.y) * scale });
    } else if (g.kind === "move") {
      setPan({ x: g.pan.x + e.clientX - g.start.x, y: g.pan.y + e.clientY - g.start.y });
    }
  }
  function pointerUp(e: PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      gesture.current = { kind: "move", start: p, rect, pan, zoom };
    }
  }

  function resizeCrop(handle: string, dx: number, dy: number) {
    const min = .12;
    setRect(old => {
      let { left, right, top, bottom } = old;
      const x = dx / Math.max(1, stageSize.width), y = dy / Math.max(1, stageSize.height);
      if (handle.includes("w")) left = clamp(left + x, 0, right - min);
      if (handle.includes("e")) right = clamp(right + x, left + min, 1);
      if (handle.includes("n")) top = clamp(top + y, 0, bottom - min);
      if (handle.includes("s")) bottom = clamp(bottom + y, top + min, 1);
      if (ratio !== "free") {
        const target = ratio === "1:1" ? 1 : ratio === "4:3" ? 4/3 : 16/9;
        const w = right-left, h = bottom-top;
        if (Math.abs(x) * stageSize.width > Math.abs(y) * stageSize.height) {
          const nh = w * stageSize.width / (target * stageSize.height);
          if (handle.includes("n")) top = clamp(bottom-nh,0,bottom-min); else bottom = clamp(top+nh,top+min,1);
        } else {
          const nw = h * stageSize.height * target / stageSize.width;
          if (handle.includes("w")) left = clamp(right-nw,0,right-min); else right = clamp(left+nw,left+min,1);
        }
      }
      return { left, right, top, bottom };
    });
  }

  function handleDown(handle: string, e: PointerEvent<HTMLButtonElement>) {
    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind: "resize", handle, start: { x:e.clientX, y:e.clientY }, rect, pan, zoom };
  }
  function handleMove(e: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current;
    if (g?.kind === "resize" && g.handle) resizeCrop(g.handle, e.clientX-g.start.x, e.clientY-g.start.y);
  }
  function handleUp() { gesture.current = null; }

  async function usePhoto() {
    const source = sourceRef.current;
    if (!source || !stageSize.width || !stageSize.height) return;
    try {
      const left = (rect.left*stageSize.width - (stageSize.width/2 + pan.x - stageSize.width*zoom/2)) / (stageSize.width*zoom);
      const top = (rect.top*stageSize.height - (stageSize.height/2 + pan.y - stageSize.height*zoom/2)) / (stageSize.height*zoom);
      const width = (rect.right-rect.left)/zoom, height = (rect.bottom-rect.top)/zoom;
      const sx = clamp(left,0,1)*source.width, sy = clamp(top,0,1)*source.height;
      const sw = Math.min(source.width-sx,width*source.width), sh = Math.min(source.height-sy,height*source.height);
      if (sw < 2 || sh < 2) throw new Error("Move the photo so the crop frame is over the image.");
      const out = document.createElement("canvas");
      out.width = 1200; out.height = Math.max(1,Math.round(1200*sh/sw));
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Could not export this crop.");
      ctx.drawImage(source,sx,sy,sw,sh,0,0,out.width,out.height);
      const blob = await new Promise<Blob>((resolve,reject)=>out.toBlob(b=>b?resolve(b):reject(new Error("Could not export this crop.")),"image/jpeg",.92));
      onUse(new File([blob],file.name.replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg",lastModified:Date.now()}));
    } catch(e) { setError(e instanceof Error ? e.message : "Could not crop this photo."); }
  }

  const handles = ["nw","n","ne","e","se","s","sw","w"];
  return <div className="crop-editor-backdrop">
    <section className="crop-editor" role="dialog" aria-modal="true" aria-label="Crop photo">
      <header className="crop-editor-header"><button type="button" onClick={onCancel} disabled={saving}>Cancel</button><strong>Crop photo</strong><button type="button" onClick={usePhoto} disabled={saving}>Done</button></header>
      <div className="crop-editor-stage-wrap">
        <div ref={stageRef} className="crop-editor-stage" style={{ aspectRatio: `${sourceSize.width} / ${sourceSize.height}`, width: `min(100%, calc(48dvh * ${sourceSize.width} / ${sourceSize.height}))` }}>
          <canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} className="crop-editor-canvas" />
          <div className="crop-editor-frame" style={{ left:`${rect.left*100}%`, top:`${rect.top*100}%`, width:`${(rect.right-rect.left)*100}%`, height:`${(rect.bottom-rect.top)*100}%` }}>
            {handles.map(h=><button key={h} type="button" aria-label={`Resize crop ${h}`} className={`crop-handle crop-handle-${h}`} onPointerDown={e=>handleDown(h,e)} onPointerMove={handleMove} onPointerUp={handleUp} onPointerCancel={handleUp}/>)}
          </div>
        </div>
      </div>
      <p className="crop-editor-hint">Drag the photo to reposition · Pinch to zoom · Drag the handles to crop</p>
      <nav className="crop-editor-ratios" aria-label="Crop aspect ratio">
        {["free","original","1:1","4:3","16:9"].map(v=><button key={v} type="button" aria-pressed={ratio===v} onClick={()=>setAspect(v)}>{v==="free"?"Free":v==="original"?"Original":v}</button>)}
      </nav>
      <div className="crop-editor-controls">
        <button type="button" onClick={()=>setRotation(r=>(r+270)%360)}>↶ Rotate</button>
        <label>Zoom <input type="range" min="1" max="5" step=".05" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/><span>{zoom.toFixed(1)}×</span></label>
        <button type="button" onClick={()=>{setZoom(1);setPan({x:0,y:0});setRect({left:.06,top:.06,right:.94,bottom:.94});setAspect("free");}}>Reset</button>
      </div>
      {error && <p role="alert" className="crop-editor-error">{error}</p>}
      <footer className="crop-editor-footer"><button type="button" onClick={onCancel} disabled={saving}>Cancel</button><button type="button" onClick={usePhoto} disabled={saving}>{saving?"Saving…":"Use photo"}</button></footer>
    </section>
  </div>;
}
