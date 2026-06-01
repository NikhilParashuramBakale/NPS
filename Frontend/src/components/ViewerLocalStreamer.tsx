import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { uploadViewerFrame } from "@/lib/api";
import { toast } from "sonner";

interface Props {
  cameraId: number;
}

export const ViewerLocalStreamer = ({ cameraId }: Props) => {
  const [streaming, setStreaming] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stoppedRef = useRef(false);

  const stopStream = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current as unknown as number);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    stoppedRef.current = true;
    setStreaming(false);
  };

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      let uploading = false;
      const minInterval = 50; // target interval in ms (~10 FPS)
      const targetWidth = 420; // downscale to reduce payload

      const runCapture = async () => {
        if (stoppedRef.current) return;
        const video = videoRef.current;
        if (!video) {
          timerRef.current = window.setTimeout(runCapture, minInterval) as unknown as number;
          return;
        }
        if (uploading) {
          timerRef.current = window.setTimeout(runCapture, minInterval) as unknown as number;
          return;
        }

        const canvas = canvasRef.current ?? document.createElement("canvas");
        canvasRef.current = canvas;
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 360;
        const scale = Math.min(1, targetWidth / vw);
        const width = Math.max(160, Math.floor(vw * scale));
        const height = Math.max(90, Math.floor(vh * scale));
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          timerRef.current = window.setTimeout(runCapture, minInterval) as unknown as number;
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        uploading = true;
        const start = performance.now();
        canvas.toBlob(async (blob) => {
          if (!blob) {
            uploading = false;
            timerRef.current = window.setTimeout(runCapture, minInterval) as unknown as number;
            return;
          }
          try {
            await uploadViewerFrame(cameraId, blob);
          } catch {
            // ignore
          } finally {
            const elapsed = performance.now() - start;
            uploading = false;
            const next = Math.max(0, minInterval - elapsed);
            timerRef.current = window.setTimeout(runCapture, next) as unknown as number;
          }
        }, "image/jpeg", 0.55);
      };

      // start immediately
      stoppedRef.current = false;
      timerRef.current = window.setTimeout(runCapture, 0) as unknown as number;

      setStreaming(true);
      toast.success("Viewer webcam streaming", { description: "Admin will see updates shortly." });
    } catch {
      toast.error("Could not start webcam");
    }
  };

  useEffect(() => () => stopStream(), []);

  return (
    <div>
      <Button size="sm" variant={streaming ? "destructive" : "secondary"} onClick={streaming ? stopStream : startStream}>
        {streaming ? "Stop Stream" : "Start Stream"}
      </Button>
      <video ref={videoRef} className="hidden" playsInline muted />
    </div>
  );
};
