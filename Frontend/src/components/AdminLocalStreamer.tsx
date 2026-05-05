import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { uploadCameraFrame } from "@/lib/api";
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

  const stopStream = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreaming(false);
  };

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      timerRef.current = window.setInterval(() => {
        const video = videoRef.current;
        if (!video) return;
        const canvas = canvasRef.current ?? document.createElement("canvas");
        canvasRef.current = canvas;
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, width, height);
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          try {
            await uploadCameraFrame(cameraId, blob);
          } catch {
            // ignore single frame errors
          }
        }, "image/jpeg", 0.7);
      }, 1000);

      setStreaming(true);
      toast.success("Admin webcam streaming", { description: "Viewers will see updates shortly." });
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
