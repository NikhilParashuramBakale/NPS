import { useEffect, useState } from "react";
import { API_BASE_URL, getAuthToken } from "@/lib/api";

interface Props {
  cameraId: number;
}

export const AdminLocalPreview = ({ cameraId }: Props) => {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let currentUrl: string | null = null;

    const loadFrame = async () => {
      const token = getAuthToken();
      if (!token) return;
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/cameras/${cameraId}/frame`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          if (active) setError("No frame available yet.");
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
        if (active) setError("Could not load frame.");
      }
    };

    loadFrame();
    const timer = window.setInterval(loadFrame, 1000);

    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [cameraId]);

  if (!frameUrl) {
    return error ? <div className="text-xs text-muted-foreground">{error}</div> : null;
  }

  return <img src={frameUrl} alt="Admin local feed" className="absolute inset-0 h-full w-full object-cover" />;
};
