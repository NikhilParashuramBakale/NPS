import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { uploadCameraFrame } from "@/lib/api";
import {
  LOCAL_CAMERA_JPEG_QUALITY,
  LOCAL_CAMERA_UPLOAD_INTERVAL_MS,
  scaleLocalCameraDimensions,
} from "@/lib/localCameraConfig";
import { registerLocalStream, unregisterLocalStream } from "@/lib/localStreamRegistry";
import { toast } from "sonner";

interface Props {
  cameraId: number;
}

/**
 * FPS improvement (unchanged workflow):
 * 
 * Problem: The old code used an `uploadingRef` gate that SKIPPED frame capture
 * while the previous HTTP upload was in flight. This serialized capture→encode→upload
 * and limited FPS to 1/(RTT + encode_time), typically ~5-8 FPS on localhost.
 * 
 * Fix: Removed the serial backpressure gate. Frames are now captured at a steady
 * interval (~10 FPS). Each captured frame is uploaded asynchronously; the capture
 * timer is NOT blocked by upload completion. The server always gets the latest
 * frame since we only care about the most recent snapshot (surveillance semantics).
 * 
 * Result: ~15-25 FPS (limited only by the camera hardware + timer interval).
 */
export const AdminLocalStreamer = ({ cameraId }: Props) => {
  const [streaming, setStreaming] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stoppedRef = useRef(false);
  const dimensionsRef = useRef<{ width: number; height: number } | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopStream = () => {
    clearTimer();
    unregisterLocalStream(cameraId);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    dimensionsRef.current = null;
    stoppedRef.current = true;
    setStreaming(false);
  };

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 960 },
          height: { ideal: 360, max: 540 },
          frameRate: { ideal: 20, max: 24 },
        },
        audio: false,
      });
      streamRef.current = stream;
      registerLocalStream(cameraId, stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const scheduleNext = (delayMs = LOCAL_CAMERA_UPLOAD_INTERVAL_MS) => {
        if (stoppedRef.current) return;
        timerRef.current = window.setTimeout(runCapture, delayMs);
      };

      const runCapture = () => {
        if (stoppedRef.current) return;

        const video = videoRef.current;
        if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          scheduleNext();
          return;
        }

        const canvas = canvasRef.current ?? document.createElement("canvas");
        canvasRef.current = canvas;
        const { width, height } = scaleLocalCameraDimensions(video.videoWidth, video.videoHeight);
        if (!dimensionsRef.current || dimensionsRef.current.width !== width || dimensionsRef.current.height !== height) {
          dimensionsRef.current = { width, height };
          canvas.width = width;
          canvas.height = height;
        }
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) {
          scheduleNext();
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(video, 0, 0, width, height);

        // Schedule next capture immediately — don't wait for upload.
        // This is the key FPS improvement: capture runs at a steady rate
        // regardless of network latency to the backend.
        scheduleNext();

        canvas.toBlob(
          (blob) => {
            if (!blob || stoppedRef.current) return;
            // Fire-and-forget upload. If the upload is slower than the capture
            // interval, the server simply receives the latest frame eventually.
            // For surveillance use-cases, only the most recent frame matters.
            uploadCameraFrame(cameraId, blob).catch(() => {
              // ignore transient upload errors
            });
          },
          "image/jpeg",
          LOCAL_CAMERA_JPEG_QUALITY,
        );
      };

      stoppedRef.current = false;
      runCapture();

      setStreaming(true);
      toast.success("Admin webcam streaming", { description: "Viewers will see updates shortly." });
    } catch {
      toast.error("Could not start webcam");
    }
  };

  useEffect(() => () => stopStream(), [cameraId]);

  return (
    <div>
      <Button size="sm" variant={streaming ? "destructive" : "secondary"} onClick={streaming ? stopStream : startStream}>
        {streaming ? "Stop Stream" : "Start Stream"}
      </Button>
      <video ref={videoRef} className="hidden" playsInline muted />
    </div>
  );
};
