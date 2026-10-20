import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

/*
 * Live view from a camera attached to this computer (USB webcam, laptop camera,
 * or a phone used as a webcam), via the browser's getUserMedia. "Capture" sends
 * the current frame to the line; the real model inspects it at the camera station.
 */

interface Props { canInspect: boolean; onNotice: (msg: string) => void }

export function CameraFeed({ canInspect, onNotice }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<{ side: number; count: number } | null>(null);

  const stop = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  };

  const start = async (id = deviceId) => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't access cameras (needs http://localhost or https).");
      return;
    }
    try {
      stream?.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: id ? { deviceId: { exact: id }, width: { ideal: 1280 } } : { width: { ideal: 1280 } },
        audio: false,
      });
      setStream(s);
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      setDevices(all);
      setDeviceId(s.getVideoTracks()[0]?.getSettings().deviceId ?? id);
    } catch (e) {
      const name = (e as DOMException).name;
      setError(
        name === "NotAllowedError" ? "Camera permission was denied. Allow it in the browser's site settings."
          : name === "NotFoundError" ? "No camera found. Plug one in and try again."
            : name === "NotReadableError" ? "The camera is in use by another app."
              : `Couldn't start the camera (${name}).`,
      );
    }
  };

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  const grabFrame = async (name: string): Promise<File | null> => {
    const v = video.current;
    if (!v || !v.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    return blob ? new File([blob], name, { type: "image/jpeg" }) : null;
  };

  const send = async (files: File[]) => {
    try {
      await api.upload(files, true);
      onNotice(files.length > 1
        ? `${files.length} sides captured as one cell. It is next into the inspection station.`
        : "Frame captured. It is next into the inspection station.");
    } catch (e) {
      onNotice((e as Error).message);
    }
  };

  const capture = async () => {
    setBusy(true);
    const f = await grabFrame(`camera_${Date.now()}.jpg`);
    if (f) await send([f]);
    setBusy(false);
  };

  // Guided 360-degree capture: the operator turns the cell 90 degrees between shots.
  const capture4 = async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    setBusy(true);
    const files: File[] = [];
    for (let side = 1; side <= 4; side++) {
      for (let count = 3; count >= 1; count--) {
        setGuide({ side, count });
        await sleep(side === 1 && count === 3 ? 900 : 700);
      }
      const f = await grabFrame(`camera_${Date.now()}_side${side}.jpg`);
      if (f) files.push(f);
    }
    setGuide(null);
    if (files.length === 4) await send(files);
    else onNotice("Capture stopped: the camera stopped delivering frames.");
    setBusy(false);
  };

  return (
    <div className="camfeed">
      <div className="frame">
        {stream ? <video ref={video} autoPlay playsInline muted className="frame-video" />
          : <div className="frame-empty">{error ?? "Camera off"}</div>}
        {stream && <span className="frame-tag live-tag">Live</span>}
        {guide && (
          <div className="guide">
            <div className="guide-count">{guide.count}</div>
            <div>Side {guide.side} of 4{guide.side > 1 ? ": turn the cell 90°" : ": hold the cell still"}</div>
          </div>
        )}
      </div>
      <div className="camfeed-controls">
        {devices.length > 1 && (
          <select className="select" value={deviceId} onChange={(e) => { setDeviceId(e.target.value); start(e.target.value); }}>
            {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
          </select>
        )}
        {stream ? <button className="btn" onClick={stop}>Turn off</button> : <button className="btn" onClick={() => start()}>Turn on camera</button>}
        <button className="btn" onClick={capture4} disabled={!stream || !canInspect || busy}
          title={canInspect ? "Capture 4 photos, turning the cell 90° between them" : "Select a model under Data source first"}>
          Capture 4 sides
        </button>
        <button className="btn btn-primary" onClick={capture} disabled={!stream || !canInspect || busy}
          title={canInspect ? "Send this frame down the line" : "Select a model under Data source first"}>
          Capture
        </button>
      </div>
      {!canInspect && stream && <p className="hint">Select a trained model under Data source to inspect captured frames.</p>}
    </div>
  );
}
