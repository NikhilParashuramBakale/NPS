import { useEffect, useRef } from "react";
import { getLocalStream, subscribeLocalStream } from "@/lib/localStreamRegistry";

interface Props {
  cameraId: number;
  objectFit?: "cover" | "contain";
}

/** Zero-latency preview for the browser that is actively publishing the webcam stream. */
export const LocalStreamMirror = ({ cameraId, objectFit = "cover" }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const attach = () => {
      const video = videoRef.current;
      if (!video) return;
      const stream = getLocalStream(cameraId);
      if (stream && video.srcObject !== stream) {
        video.srcObject = stream;
        void video.play().catch(() => undefined);
      } else if (!stream) {
        video.srcObject = null;
      }
    };

    attach();
    return subscribeLocalStream(cameraId, attach);
  }, [cameraId]);

  const fitClass = objectFit === "contain" ? "object-contain" : "object-cover";

  return (
    <video
      ref={videoRef}
      className={`h-full w-full ${fitClass} bg-black`}
      playsInline
      muted
      autoPlay
    />
  );
};
