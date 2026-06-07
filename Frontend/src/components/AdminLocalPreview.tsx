import { useEffect, useRef, useState } from "react";
import { Video } from "lucide-react";
import { API_BASE_URL, getAuthToken, getCameraCapabilityFrameUrl } from "@/lib/api";
import {
  LOCAL_CAMERA_POLL_INTERVAL_IDLE_MS,
  LOCAL_CAMERA_POLL_INTERVAL_MISS_MS,
  LOCAL_CAMERA_POLL_INTERVAL_MS,
} from "@/lib/localCameraConfig";
import { getLocalStream, subscribeLocalStream } from "@/lib/localStreamRegistry";
import { LocalStreamMirror } from "@/components/LocalStreamMirror";

interface Props {
  cameraId: number;
  emptyMessage?: string;
  capabilityToken?: string | null;
  onAccessDenied?: () => void;
  objectFit?: "cover" | "contain";
  /** When false, polling is paused (e.g. dialog closed). Defaults to true. */
  active?: boolean;
}

const WAITING_FOR_FRAMES = "Waiting for camera frames...";

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
  emptyMessage = WAITING_FOR_FRAMES,
  capabilityToken = null,
  onAccessDenied,
  objectFit = "cover",
  active = true,
}: Props) => {
  const [frameReady, setFrameReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localMirror, setLocalMirror] = useState(() => !capabilityToken && Boolean(getLocalStream(cameraId)));

  const deniedRef = useRef(false);
  const fetchingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const etagRef = useRef<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    if (capabilityToken) {
      setLocalMirror(false);
      return;
    }
    const sync = () => setLocalMirror(Boolean(getLocalStream(cameraId)));
    sync();
    return subscribeLocalStream(cameraId, sync);
  }, [cameraId, capabilityToken]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { root: null, threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (localMirror) return undefined;

    deniedRef.current = false;
    let mounted = true;
    let timer: number | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const revokeObjectUrl = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    const shouldPoll = () =>
      mounted &&
      active &&
      inView &&
      !document.hidden &&
      !deniedRef.current &&
      Boolean(getAuthToken());

    const scheduleNext = (delayMs: number) => {
      clearTimer();
      if (!mounted || deniedRef.current) return;
      timer = window.setTimeout(() => void loadFrame(), delayMs);
    };

    const loadFrame = async () => {
      if (!shouldPoll()) {
        scheduleNext(LOCAL_CAMERA_POLL_INTERVAL_IDLE_MS);
        return;
      }

      if (fetchingRef.current) {
        scheduleNext(LOCAL_CAMERA_POLL_INTERVAL_MISS_MS);
        return;
      }

      const token = getAuthToken();
      if (!token) {
        scheduleNext(LOCAL_CAMERA_POLL_INTERVAL_IDLE_MS);
        return;
      }

      const requestUrl = capabilityToken
        ? getCameraCapabilityFrameUrl(cameraId, capabilityToken)
        : `${API_BASE_URL}/api/v1/cameras/${cameraId}/frame`;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetchingRef.current = true;
      try {
        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        if (etagRef.current) headers["If-None-Match"] = etagRef.current;

        const response = await fetch(requestUrl, { headers, signal: controller.signal });

        if (response.status === 401 || response.status === 403) {
          deniedRef.current = true;
          clearTimer();
          revokeObjectUrl();
          etagRef.current = null;
          if (mounted) {
            setFrameReady(false);
            setError("Access revoked or expired. Request access again.");
            onAccessDenied?.();
          }
          return;
        }

        if (response.status === 304) {
          scheduleNext(LOCAL_CAMERA_POLL_INTERVAL_MISS_MS);
          return;
        }

        if (response.status === 404) {
          if (mounted) {
            setFrameReady(false);
            setError(emptyMessage);
          }
          scheduleNext(LOCAL_CAMERA_POLL_INTERVAL_IDLE_MS);
          return;
        }

        if (!response.ok) {
          if (mounted) {
            setFrameReady(false);
            setError(emptyMessage);
          }
          scheduleNext(LOCAL_CAMERA_POLL_INTERVAL_IDLE_MS);
          return;
        }

        const nextEtag = response.headers.get("ETag");
        if (nextEtag) etagRef.current = nextEtag;

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        revokeObjectUrl();
        objectUrlRef.current = url;

        if (mounted) {
          if (imgRef.current) {
            imgRef.current.src = url;
          }
          if (!frameReady) setFrameReady(true);
          setError(null);
        }
        scheduleNext(LOCAL_CAMERA_POLL_INTERVAL_MS);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (mounted && !deniedRef.current) {
          setFrameReady(false);
          setError("Could not load frame.");
        }
        scheduleNext(LOCAL_CAMERA_POLL_INTERVAL_IDLE_MS);
      } finally {
        fetchingRef.current = false;
      }
    };

    void loadFrame();

    const onVisibilityChange = () => {
      if (!document.hidden && shouldPoll() && !fetchingRef.current && timer === null) {
        scheduleNext(0);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      clearTimer();
      abortRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      revokeObjectUrl();
      etagRef.current = null;
    };
  }, [cameraId, emptyMessage, capabilityToken, onAccessDenied, active, inView, localMirror]);

  const fitClass = objectFit === "contain" ? "object-contain" : "object-cover";

  return (
    <div ref={containerRef} className="absolute inset-0 h-full w-full overflow-hidden bg-black">
      {localMirror ? (
        <LocalStreamMirror cameraId={cameraId} objectFit={objectFit} />
      ) : frameReady ? (
        <img
          ref={imgRef}
          alt="Camera feed"
          className={`h-full w-full ${fitClass}`}
          draggable={false}
        />
      ) : (
        <WaitingState message={error ?? emptyMessage} />
      )}
    </div>
  );
};
