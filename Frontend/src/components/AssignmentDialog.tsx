import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { useApp, VIEWERS } from "@/context/AppContext";
import { toast } from "sonner";

export const AssignmentDialog = () => {
  const { cameras, addAssignment } = useApp();
  const [open, setOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string>("");
  const [cameraIds, setCameraIds] = useState<number[]>([]);
  const [duration, setDuration] = useState("10");

  const reset = () => {
    setViewerId("");
    setCameraIds([]);
    setDuration("10");
  };

  const submit = () => {
    if (!viewerId || cameraIds.length === 0) {
      toast.error("Select a viewer and at least one camera");
      return;
    }
    const viewer = VIEWERS.find((v) => v.id === Number(viewerId))!;
    addAssignment({
      viewerId: viewer.id,
      viewerName: viewer.name,
      cameraIds,
      expiresIn: Number(duration) * 60,
    });
    toast.success("Assignment created", {
      description: `${viewer.name} • ${cameraIds.length} camera(s) • ${duration} min`,
    });
    setOpen(false);
    reset();
  };

  const toggleCam = (id: number) =>
    setCameraIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button className="w-full bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-1" /> Add New Assignment
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>New Camera Assignment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Viewer</Label>
            <Select value={viewerId} onValueChange={setViewerId}>
              <SelectTrigger><SelectValue placeholder="Select a viewer" /></SelectTrigger>
              <SelectContent>
                {VIEWERS.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.name} ({v.username})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Cameras</Label>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3">
              {cameras.map((c) => (
                <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox
                    checked={cameraIds.includes(c.id)}
                    onCheckedChange={() => toggleCam(c.id)}
                  />
                  <span>{c.name}</span>
                  <span className={`ml-auto text-xs ${c.status === "online" ? "text-success" : "text-destructive"}`}>
                    {c.status}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="10">10 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} className="bg-primary hover:bg-primary/90">Create Assignment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
