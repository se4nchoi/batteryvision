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

  const capture = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    if (!blob) return;
    setBusy(true);
    try {
      await api.upload(new File([blob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" }), true);
      onNotice("Frame captured. It is next into the inspection station.");
    } catch (e) {
      onNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="camfeed">
      <div className="frame">
        {stream ? <video ref={video} autoPlay playsInline muted className="frame-video" />
          : <div className="frame-empty">{error ?? "Camera off"}</div>}
        {stream && <span className="frame-tag live-tag">Live</span>}
      </div>
      <div className="camfeed-controls">
        {devices.length > 1 && (
          <select className="select" value={deviceId} onChange={(e) => { setDeviceId(e.target.value); start(e.target.value); }}>
            {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
          </select>
        )}
        {stream ? <button className="btn" onClick={stop}>Turn off</button> : <button className="btn" onClick={() => start()}>Turn on camera</button>}
        <button className="btn btn-primary" onClick={capture} disabled={!stream || !canInspect || busy}
          title={canInspect ? "Send this frame down the line" : "Select a model under Data source first"}>
          Capture
        </button>
      </div>
      {!canInspect && stream && <p className="hint">Select a trained model under Data source to inspect captured frames.</p>}
    </div>
  );
}
