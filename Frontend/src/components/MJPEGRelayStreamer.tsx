/**
 * MJPEGRelayStreamer — Browser-based MJPEG Relay for Cross-Network IP Cameras
 *
 * When the admin browser is on the same network as an IP camera but the backend
 * is on a different network, this component fetches the MJPEG stream DIRECTLY
 * from the camera in the browser, parses the multipart/x-mixed-replace boundary,
 * and uploads each JPEG frame to the backend via uploadCameraFrame().
 *
 * Architecture:
 *   Camera (LAN) ──HTTP MJPEG──► Admin Browser ──HTTP POST──► Backend (Cloud)
 *   (192.168.1.x)               (same network)               (different network)
 *
 * Network concepts demonstrated:
 *   - HTTP persistent connections (keep-alive)
 *   - multipart/x-mixed-replace stream parsing
 *   - JPEG boundary detection (SOI: 0xFFD8, EOI: 0xFFD9)
 *   - Browser-to-server frame relay
 *   - Cross-network HTTP tunneling
 *
 * Zero backend changes required — uses existing uploadCameraFrame() API.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { uploadCameraFrame } from "@/lib/api";
import { toast } from "sonner";

interface Props {
  cameraId: number;
  cameraName: string;
  sourceUrl: string;
}

const MAX_FRAME_BYTES = 5_000_000;

// JPEG markers
const JPEG_SOI = new Uint8Array([0xFF, 0xD8]); // Start of Image
const JPEG_EOI = new Uint8Array([0xFF, 0xD9]); // End of Image

export const MJPEGRelayStreamer = ({ cameraId, cameraName, sourceUrl }: Props) => {
  const [relaying, setRelaying] = useState(false);
  const [fps, setFps] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const cameraIdRef = useRef(cameraId);
  const stoppedRef = useRef(false);
  const frameCountRef = useRef(0);
  const fpsTimerRef = useRef<number | null>(null);

  // Keep ref in sync
  cameraIdRef.current = cameraId;

  const stopRelay = () => {
    stoppedRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    if (fpsTimerRef.current !== null) {
      window.clearInterval(fpsTimerRef.current);
      fpsTimerRef.current = null;
    }
    setRelaying(false);
    setFps(0);
  };

  const startRelay = async () => {
    try {
      stoppedRef.current = false;
      frameCountRef.current = 0;
      setFps(0);
      const currentCamId = cameraIdRef.current;

      // FPS counter: reset and update every 2 seconds
      if (fpsTimerRef.current !== null) {
        window.clearInterval(fpsTimerRef.current);
      }
      fpsTimerRef.current = window.setInterval(() => {
        setFps(Math.round(frameCountRef.current / 2));
        frameCountRef.current = 0;
      }, 2000);

      const abortController = new AbortController();
      abortRef.current = abortController;

      // Fetch the MJPEG stream directly from the camera on the local network
      setRelaying(true);
      toast.success("Connecting to camera...", {
        description: `Fetching MJPEG stream from ${sourceUrl}`,
      });

      const response = await fetch(sourceUrl, {
        signal: abortController.signal,
        // Avoid CORS preflight — IP cameras typically don't support CORS
        headers: {
          Accept: "multipart/x-mixed-replace, image/jpeg, */*",
        },
      });

      if (!response.ok) {
        throw new Error(`Camera returned HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Camera stream has no readable body (ReadableStream not supported)");
      }

      setRelaying(true);
      toast.success("MJPEG relay active", {
        description: `Relaying ${cameraName} → backend.`,
      });

      const reader = response.body.getReader();
      const boundary = await detectBoundary(response, reader);

      if (!boundary) {
        throw new Error("Could not detect MJPEG boundary from camera stream");
      }

      // Process the stream: extract JPEG frames → upload to backend
      await processStream(reader, boundary, currentCamId, abortController.signal);

    } catch (err) {
      if (stoppedRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      toast.error("MJPEG relay stopped", { description: message });
    } finally {
      if (!stoppedRef.current) {
        stopRelay();
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRelay();
    };
  }, [cameraId]);

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={relaying ? "destructive" : "secondary"}
        onClick={relaying ? stopRelay : startRelay}
        disabled={!sourceUrl}
      >
        {relaying ? `Stop Relay ${fps > 0 ? `(${fps} FPS)` : ""}` : "Relay IP Camera"}
      </Button>
      {!sourceUrl && (
        <span className="text-xs text-muted-foreground">No URL configured</span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// MJPEG Stream Processing (pure functions, no React dependency)
// ---------------------------------------------------------------------------

/**
 * Detect the multipart boundary from Content-Type header or first chunk bytes.
 */
async function detectBoundary(
  response: Response,
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string | null> {
  // Try Content-Type header first
  const contentType = response.headers.get("content-type") || "";
  const headerMatch = contentType.match(/boundary=([^\s;]+)/i);
  if (headerMatch) return headerMatch[1];

  // Fallback: read first chunk and look for --boundary pattern
  const first = await readOne(reader);
  if (!first) return null;

  const text = new TextDecoder().decode(first);
  const bodyMatch = text.match(/--([^\r\n]+)/);
  return bodyMatch ? bodyMatch[1] : null;
}

async function readOne(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<Uint8Array | null> {
  try {
    const { done, value } = await reader.read();
    return done ? null : value;
  } catch {
    return null;
  }
}

/**
 * Read the MJPEG stream, extract individual JPEG frames, and upload each
 * to the backend. Runs until the stream ends or the signal is aborted.
 */
async function processStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  boundary: string,
  cameraId: number,
  signal: AbortSignal,
): Promise<void> {
  const boundaryStart = `--${boundary}`;
  const boundaryEnd = `--${boundary}--`;
  const boundaryStartBytes = new TextEncoder().encode(boundaryStart);
  const boundaryEndBytes = new TextEncoder().encode(boundaryEnd);

  let buffer = new Uint8Array(0);

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;

    // Append chunk to buffer
    const combined = new Uint8Array(buffer.length + value.length);
    combined.set(buffer);
    combined.set(value, buffer.length);
    buffer = combined;

    // Extract and upload all complete frames from buffer
    while (buffer.length > 0) {
      const startIdx = findBytes(buffer, boundaryStartBytes);
      if (startIdx === -1) break; // Need more data

      const searchFrom = startIdx + boundaryStartBytes.length;
      const nextBoundary = findBytes(buffer, boundaryStartBytes, searchFrom);
      const finalBoundary = findBytes(buffer, boundaryEndBytes, searchFrom);

      let endIdx = -1;
      if (nextBoundary !== -1) {
        endIdx = nextBoundary;
      } else if (finalBoundary !== -1) {
        endIdx = finalBoundary + boundaryEndBytes.length;
      }

      if (endIdx === -1) {
        // Incomplete frame — prevent OOM by trimming if needed
        if (buffer.length > MAX_FRAME_BYTES * 2) {
          buffer = buffer.slice(-MAX_FRAME_BYTES);
        }
        break;
      }

      // Extract frame data between boundaries
      const frameSection = buffer.slice(startIdx + boundaryStartBytes.length, endIdx);

      // Locate JPEG SOI (0xFFD8) and EOI (0xFFD9)
      const jpegStart = findBytes(frameSection, JPEG_SOI);
      const jpegEnd = findBytes(frameSection, JPEG_EOI);

      if (jpegStart !== -1 && jpegEnd !== -1 && jpegEnd > jpegStart) {
        const jpegData = frameSection.slice(jpegStart, jpegEnd + 2);

        if (jpegData.length > 100 && jpegData.length < MAX_FRAME_BYTES) {
          // Fire-and-forget upload to backend
          const blob = new Blob([jpegData], { type: "image/jpeg" });
          uploadCameraFrame(cameraId, blob).catch(() => {
            /* transient upload errors are safe to ignore */
          });
        }
      }

      // Remove processed bytes from buffer
      buffer = buffer.slice(endIdx);

      // Safety trim
      if (buffer.length > MAX_FRAME_BYTES * 2) {
        buffer = new Uint8Array(0);
      }
    }
  }
}

/**
 * Find the index of a byte sequence (needle) within a Uint8Array (haystack).
 * Uses naive O(n*m) search — fast enough for MJPEG boundary scanning.
 */
function findBytes(
  haystack: Uint8Array,
  needle: Uint8Array,
  fromIndex = 0,
): number {
  const limit = haystack.length - needle.length;
  for (let i = fromIndex; i <= limit; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}