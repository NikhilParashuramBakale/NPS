import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createAccessRequest, fetchMyRequests, type AccessRequest } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";

const RequestHistory = () => {
  const { cameras } = useApp();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [cameraId, setCameraId] = useState<number | null>(null);
  const [reason, setReason] = useState("My bicycle was stolen from the parking area.");

  const refresh = () => fetchMyRequests().then(setRequests);

  useEffect(() => {
    void refresh();
  }, []);

  const requestableCameras = useMemo(() => cameras.filter((camera) => camera.is_active), [cameras]);

  const submit = async () => {
    const selected = cameraId ?? requestableCameras[0]?.id;
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
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={cameraId ?? requestableCameras[0]?.id ?? ""}
            onChange={(event) => setCameraId(Number(event.target.value))}
          >
            {requestableCameras.map((camera) => (
              <option key={camera.id} value={camera.id}>{camera.name} - {camera.location}</option>
            ))}
          </select>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} />
          <Button onClick={submit}><Send className="h-4 w-4 mr-1" />Submit Request</Button>
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
