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

export const AdminLocalStreamer = ({ cameraId }: Props) => {
  const [streaming, setStreaming] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stoppedRef = useRef(false);
  const uploadingRef = useRef(false);
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
    uploadingRef.current = false;
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

        if (uploadingRef.current) {
          scheduleNext(LOCAL_CAMERA_UPLOAD_INTERVAL_MS);
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
        uploadingRef.current = true;

        canvas.toBlob(
          (blob) => {
            void (async () => {
              try {
                if (!blob || stoppedRef.current) return;
                await uploadCameraFrame(cameraId, blob);
              } catch {
                // ignore transient upload errors
              } finally {
                uploadingRef.current = false;
                scheduleNext(0);
              }
            })();
          },
          "image/jpeg",
          LOCAL_CAMERA_JPEG_QUALITY,
        );
      };

      stoppedRef.current = false;
      uploadingRef.current = false;
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
