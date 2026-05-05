import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp, Camera } from "@/context/AppContext";
import { toast } from "sonner";
import { probeCameraSource } from "@/lib/api";

type SourceType = Camera["source_type"];

interface Props {
  camera: Camera;
}

export const CameraSourceDialog = ({ camera }: Props) => {
  const { updateCameraSource } = useApp();
  const [open, setOpen] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>(camera.source_type);
  const [sourceUrl, setSourceUrl] = useState(camera.source_url || "");

  const reset = () => {
    setSourceType(camera.source_type);
    setSourceUrl(camera.source_url || "");
  };

  const submit = async () => {
    if (sourceType === "ip_mjpeg" && !sourceUrl) {
      toast.error("Enter the MJPEG URL for IP Webcam");
      return;
    }
    const ok = await updateCameraSource(camera.id, {
      source_type: sourceType,
      source_url: sourceType === "ip_mjpeg" ? sourceUrl : null,
    });
    if (!ok) {
      toast.error("Could not update camera source");
      return;
    }
    toast.success("Camera source updated", { description: camera.name });
    setOpen(false);
  };

  const testStream = async () => {
    try {
      const result = await probeCameraSource(camera.id);
      if (result.ok) {
        toast.success("Stream reachable", { description: `HTTP ${result.status_code}` });
      } else {
        toast.error("Stream probe failed", { description: result.detail });
      }
    } catch {
      toast.error("Stream probe failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">Configure</Button>
      </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>Configure {camera.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Source Type</Label>
            <Select value={sourceType} onValueChange={(value) => setSourceType(value as SourceType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unconfigured">Unconfigured</SelectItem>
                <SelectItem value="ip_mjpeg">IP Webcam (MJPEG)</SelectItem>
                <SelectItem value="admin_local">Admin local webcam</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {sourceType === "ip_mjpeg" && (
            <div className="space-y-1.5">
              <Label>MJPEG URL</Label>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="http://192.168.0.10:8080/video"
              />
              <Button variant="ghost" size="sm" onClick={testStream}>
                Test stream
              </Button>
            </div>
          )}
          {sourceType === "admin_local" && (
            <div className="text-xs text-muted-foreground">
              Admin local webcam streaming is marked as configured. You can wire the actual stream later.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} className="bg-primary hover:bg-primary/90">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};