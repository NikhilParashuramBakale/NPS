import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const IP_CAM_KEY = "securecam_ip_cam_url";

type SourceType = "local" | "ip";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cameraName: string | null;
}

export const ViewerCameraDialog = ({ open, onOpenChange, cameraName }: Props) => {
  const [source, setSource] = useState<SourceType>("local");
  const [ipUrl, setIpUrl] = useState(() => localStorage.getItem(IP_CAM_KEY) || "");
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!open) {
      stopStream();
      setError("");
      return;
    }

    if (source === "local") {
      setError("");
      void (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch {
          setError("Could not access local camera. Check browser permissions.");
        }
      })();
    } else {
      stopStream();
    }

    return () => {
      stopStream();
    };
  }, [open, source]);

  useEffect(() => {
    if (ipUrl) {
      localStorage.setItem(IP_CAM_KEY, ipUrl);
    }
  }, [ipUrl]);

  const handleClose = () => {
    stopStream();
    onOpenChange(false);
  };

  const handleCopyHint = () => {
    toast("IP Webcam", { description: "Use http://<phone-ip>:8080/video for MJPEG" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card max-w-2xl">
        <DialogHeader>
          <DialogTitle>{cameraName ? `View ${cameraName}` : "View Camera"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select value={source} onValueChange={(value) => setSource(value as SourceType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Laptop webcam (getUserMedia)</SelectItem>
                <SelectItem value="ip">Phone camera (IP Webcam MJPEG)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {source === "local" ? (
            <div className="rounded-lg border border-border bg-secondary/40 p-3">
              <video ref={videoRef} autoPlay muted playsInline className="w-full rounded-md" />
              {error && (
                <div className="mt-2 text-xs text-destructive">{error}</div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>IP Webcam URL</Label>
              <Input
                value={ipUrl}
                onChange={(e) => setIpUrl(e.target.value)}
                placeholder="http://192.168.0.10:8080/video"
              />
              <Button variant="ghost" size="sm" onClick={handleCopyHint}>
                Need the URL format?
              </Button>
              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                {ipUrl ? (
                  <img src={ipUrl} alt="IP webcam stream" className="w-full rounded-md" />
                ) : (
                  <div className="text-xs text-muted-foreground">Enter the MJPEG stream URL to view the feed.</div>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
