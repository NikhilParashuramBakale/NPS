import { useEffect, useRef, useState } from "react";
import { Video } from "lucide-react";
import { API_BASE_URL, getAuthToken, getCameraCapabilityFrameUrl } from "@/lib/api";

interface Props {
  cameraId: number;
  emptyMessage?: string;
  capabilityToken?: string | null;
  onAccessDenied?: () => void;
  objectFit?: "cover" | "contain";
}

const WaitingState = ({ message }: { message: string }) => (
  <div className="flex h-full w-full items-center justify-center bg-slate-950/70 p-6 text-center">
    <div className="max-w-[16rem] space-y-3">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <Video className="h-4 w-4 text-[#94A3B8]" />
      </div>
      <p className="text-sm leading-relaxed text-[#94A3B8]">{message}</p>
    </div>
  </div>
);

export const AdminLocalPreview = ({
  cameraId,
  emptyMessage = "No frame available yet.",
  capabilityToken = null,
  onAccessDenied,
  objectFit = "cover",
}: Props) => {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deniedRef = useRef(false);

  useEffect(() => {
    deniedRef.current = false;
    let active = true;
    let currentUrl: string | null = null;
    let timer: number | null = null;

    const stopPolling = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    const loadFrame = async () => {
      if (deniedRef.current || !active) return;
      const token = getAuthToken();
      if (!token) return;
      const requestUrl = capabilityToken
        ? getCameraCapabilityFrameUrl(cameraId, capabilityToken)
        : `${API_BASE_URL}/api/v1/cameras/${cameraId}/frame`;
      try {
        const response = await fetch(requestUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401 || response.status === 403) {
          deniedRef.current = true;
          stopPolling();
          if (active) {
            setFrameUrl(null);
            setError("Access revoked or expired. Request access again.");
            onAccessDenied?.();
          }
          return;
        }
        if (response.status === 404) {
          if (active) setError(emptyMessage);
          return;
        }
        if (!response.ok) {
          if (active) setError(emptyMessage);
          return;
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        currentUrl = url;
        if (active) {
          setFrameUrl(url);
          setError(null);
        }
      } catch {
        if (active && !deniedRef.current) setError("Could not load frame.");
      }
    };

    void loadFrame();
    timer = window.setInterval(() => void loadFrame(), 500);

    return () => {
      active = false;
      stopPolling();
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [cameraId, emptyMessage, capabilityToken, onAccessDenied]);

  if (!frameUrl) {
    return <WaitingState message={error ?? emptyMessage} />;
  }

  return (
    <img
      src={frameUrl}
      alt="Camera feed"
      className={`h-full w-full ${objectFit === "contain" ? "object-contain" : "object-cover"}`}
    />
  );
};
