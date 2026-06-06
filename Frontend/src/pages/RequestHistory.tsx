import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createAccessRequest, fetchMyRequests, fetchRequestableCameras, type AccessRequest, type ApiCamera } from "@/lib/api";
import { toast } from "sonner";

const RequestHistory = () => {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [requestableCameras, setRequestableCameras] = useState<ApiCamera[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [reason, setReason] = useState("My bicycle was stolen from the parking area.");

  const refresh = () => fetchMyRequests().then(setRequests);

  const loadRequestableCameras = () =>
    fetchRequestableCameras()
      .then((cameras) => {
        setRequestableCameras(cameras);
        if (cameras.length > 0) {
          setCameraId((prev) => (prev && cameras.some((c) => String(c.id) === prev) ? prev : String(cameras[0].id)));
        } else {
          setCameraId("");
        }
      })
      .catch(() => {
        setRequestableCameras([]);
        setCameraId("");
      });

  useEffect(() => {
    void refresh();
    void loadRequestableCameras();
  }, []);

  const submit = async () => {
    const selected = Number(cameraId);
    if (!selected || reason.trim().length < 10) {
      toast.error("Select a camera and enter a clear reason");
      return;
    }
    await createAccessRequest({ camera_id: selected, reason: reason.trim() });
    toast.success("Request submitted", { description: "Temporary access requires admin approval." });
    setReason("");
    await refresh();
  };

  return (
    <div className="min-h-screen bg-secondary/10 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Request History</h1>
            <Badge variant="secondary">Temporary Access</Badge>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/viewer"><ArrowLeft className="h-4 w-4 mr-1" />Dashboard</Link></Button>
        </div>

        <section className="rounded-md border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium">Create Access Request</div>
          {requestableCameras.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin cameras are available to request right now.</p>
          ) : (
            <div className="space-y-1.5">
              <Label>Camera</Label>
              <Select value={cameraId} onValueChange={setCameraId}>
                <SelectTrigger><SelectValue placeholder="Select a camera" /></SelectTrigger>
                <SelectContent>
                  {requestableCameras.map((camera) => (
                    <SelectItem key={camera.id} value={String(camera.id)}>
                      {camera.name} — {camera.location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} />
          <Button onClick={submit} disabled={requestableCameras.length === 0}>
            <Send className="h-4 w-4 mr-1" />Submit Request
          </Button>
        </section>

        <section className="rounded-md border border-border bg-card">
          {requests.map((request) => (
            <div key={request.id} className="border-b border-border px-4 py-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{request.camera_name}</span>
                <Badge variant={request.status === "rejected" ? "destructive" : "secondary"}>{request.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{request.reason}</p>
              <div className="mt-2 text-xs text-muted-foreground">{new Date(request.requested_at).toLocaleString()}</div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

export default RequestHistory;
