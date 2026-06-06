import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";

type SourceType = "ip_mjpeg" | "viewer_local";

export const ViewerCameraDialog = () => {
  const { createViewerCamera } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("viewer_local");
  const [sourceUrl, setSourceUrl] = useState("");
  const [requestShare, setRequestShare] = useState(false);

  const reset = () => {
    setName("");
    setSourceType("viewer_local");
    setSourceUrl("");
    setRequestShare(false);
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Enter a camera name");
      return;
    }
    if (sourceType === "ip_mjpeg" && !sourceUrl.trim()) {
      toast.error("Enter the MJPEG URL");
      return;
    }
    let finalUrl = sourceUrl.trim();
    if (sourceType === "ip_mjpeg" && finalUrl && !finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = "http://" + finalUrl;
    }
    const ok = await createViewerCamera({
      name: name.trim(),
      source_type: sourceType,
      source_url: sourceType === "ip_mjpeg" ? finalUrl : null,
      request_share: requestShare,
    });
    if (!ok) {
      toast.error("Could not add camera");
      return;
    }
    toast.success("Camera added", { description: name.trim() });
    setOpen(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-1" /> Add Camera
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>Add Your Camera</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Camera Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Phone Camera" />
          </div>
          <div className="space-y-1.5">
            <Label>Source Type</Label>
            <Select value={sourceType} onValueChange={(value) => setSourceType(value as SourceType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer_local">Laptop Webcam (Upload)</SelectItem>
                <SelectItem value="ip_mjpeg">IP Webcam (MJPEG)</SelectItem>
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
            </div>
          )}
          {sourceType === "viewer_local" && (
            <div className="text-xs text-muted-foreground">
              Your browser will upload frames to the server so the admin can view them remotely.
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={requestShare} onCheckedChange={(value) => setRequestShare(Boolean(value))} />
            <span>Request admin approval to share this camera with other viewers</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} className="bg-primary hover:bg-primary/90">Create Camera</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
