import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Shield, Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp, formatTime } from "@/context/AppContext";
import { SecurityBar } from "@/components/SecurityBar";
import { CameraTile } from "@/components/CameraTile";
import { AdminLocalPreview } from "@/components/AdminLocalPreview";
import { ViewerCameraDialog } from "@/components/ViewerCameraDialog";
import { ViewerLocalStreamer } from "@/components/ViewerLocalStreamer";
import { getCameraStreamUrl } from "@/lib/api";
import { toast } from "sonner";

const ViewerDashboard = () => {
  const { user, logout, cameras, myAssignments, requestCameraShare } = useApp();
  const navigate = useNavigate();
  const prevCount = useRef(myAssignments.length);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (prevCount.current > 0 && myAssignments.length < prevCount.current) {
      toast.error("Session expired", { description: "Access to a camera has ended" });
    }
    prevCount.current = myAssignments.length;
  }, [myAssignments.length]);

  const handleLogout = () => {
    logout();
    toast("Logged out");
    navigate("/");
  };

  const assignedCameras = myAssignments.flatMap((a) =>
    a.cameraIds
      .map((id) => {
        const cam = cameras.find((c) => c.id === id);
        return cam ? { ...cam, expiresIn: a.expiresIn, assignmentId: a.id } : null;
      })
      .filter(Boolean) as ((typeof cameras)[number] & { expiresIn: number; assignmentId: string })[]
  );

  const myCameras = cameras.filter((c) => c.owner_id === user?.id);
  const assignedNonOwned = assignedCameras.filter((c) => c.owner_id !== user?.id);

  const expandedCamera = useMemo(() => {
    if (expandedId === null) return null;
    const assigned = assignedNonOwned.find((c) => c.id === expandedId);
    if (assigned) return assigned;
    return myCameras.find((c) => c.id === expandedId) ?? null;
  }, [expandedId, assignedNonOwned, myCameras]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SecurityBar />
      <header className="flex items-center justify-between border-b border-border bg-card px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="font-semibold">Viewer Dashboard</h1>
          <span className="hidden sm:inline text-xs text-muted-foreground ml-2">
            • {user?.username}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-1" /> Logout
        </Button>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <div className="space-y-4">
          {assignedNonOwned.length === 0 && myCameras.length === 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-center">
              <AlertTriangle className="h-8 w-8 text-warning mx-auto mb-2" />
              <h2 className="font-semibold text-base">No Active Camera Access</h2>
              <p className="text-sm text-muted-foreground">
                You have no cameras assigned. Add your camera or contact your administrator.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm text-muted-foreground">
              My Cameras ({myCameras.length})
            </h2>
            <ViewerCameraDialog />
          </div>
          {myCameras.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              Add a camera to share your feed with the admin.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {myCameras.map((c) => {
                const preview = c.source_type === "ip_mjpeg" && c.source_url
                  ? <img src={getCameraStreamUrl(c.id)} alt={`${c.name} feed`} className="absolute inset-0 h-full w-full object-cover" />
                  : c.source_type === "viewer_local"
                    ? <AdminLocalPreview cameraId={c.id} />
                    : null;
                return (
                  <div
                    key={`owned-${c.id}`}
                    className="rounded-lg border border-border bg-card overflow-hidden flex flex-col"
                  >
                    <CameraTile
                      name={c.name}
                      status={c.status}
                      height="h-48"
                      preview={preview}
                      onExpand={() => setExpandedId(c.id)}
                    />
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{c.name}</span>
                        <span className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${c.is_active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${c.is_active ? "bg-success" : "bg-destructive"}`} />
                          {c.is_active ? "Active" : "Disabled"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`px-2 py-1 rounded-full ${c.share_approved ? "bg-success/10 text-success" : c.share_requested ? "bg-warning/10 text-warning" : "bg-secondary/70 text-muted-foreground"}`}>
                          {c.share_approved ? "Share approved" : c.share_requested ? "Share requested" : "Not shared"}
                        </span>
                        <span className="px-2 py-1 rounded-full bg-secondary/70 text-muted-foreground">
                          {c.source_type === "ip_mjpeg" ? "IP Webcam" : "Viewer webcam"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {c.source_type === "viewer_local" && <ViewerLocalStreamer cameraId={c.id} />}
                        {!c.share_approved && !c.share_requested && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              const ok = await requestCameraShare(c.id);
                              if (ok) {
                                toast.success("Share request sent", { description: c.name });
                              } else {
                                toast.error("Could not request sharing");
                              }
                            }}
                          >
                            Request Share
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm text-muted-foreground">
              Assigned Cameras ({assignedNonOwned.length})
            </h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> All streams encrypted
            </div>
          </div>
          {assignedNonOwned.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              No assigned cameras yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {assignedNonOwned.map((c) => {
                const lowTime = c.expiresIn < 60;
                const preview = c.source_type === "ip_mjpeg" && c.source_url
                  ? <img src={getCameraStreamUrl(c.id)} alt={`${c.name} feed`} className="absolute inset-0 h-full w-full object-cover" />
                  : c.source_type === "admin_local"
                    ? <AdminLocalPreview cameraId={c.id} />
                    : c.source_type === "viewer_local"
                      ? <AdminLocalPreview cameraId={c.id} />
                    : null;
                return (
                  <div
                    key={`${c.assignmentId}-${c.id}`}
                    className="rounded-lg border border-border bg-card overflow-hidden flex flex-col hover:border-primary/50 transition-colors"
                  >
                    <CameraTile
                      name={c.name}
                      status={c.status}
                      height="h-48"
                      preview={preview}
                      onExpand={() => setExpandedId(c.id)}
                    />
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{c.name}</span>
                        {c.status === "online" && (
                          <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-success/10 text-success">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            Online
                          </span>
                        )}
                      </div>
                      {c.source_type === "unconfigured" && (
                        <div className="text-xs text-warning bg-warning/5 px-2 py-1.5 rounded">
                          Source not configured by admin
                        </div>
                      )}
                      {c.source_type === "admin_local" && (
                        <div className="text-xs text-muted-foreground bg-secondary/50 px-2 py-1.5 rounded">
                          Admin local webcam stream
                        </div>
                      )}
                      <div className={`text-xs font-medium flex items-center gap-1.5 ${lowTime ? "text-warning" : "text-success"}`}>
                        <Lock className="h-3 w-3" /> {formatTime(c.expiresIn)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Dialog open={expandedId !== null} onOpenChange={(open) => { if (!open) setExpandedId(null); }}>
        <DialogContent className="bg-card max-w-4xl">
          {expandedCamera && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>{expandedCamera.name}</DialogTitle>
              </DialogHeader>
              <CameraTile
                name={expandedCamera.name}
                status={expandedCamera.status}
                height="h-[420px]"
                preview={expandedCamera.source_type === "ip_mjpeg" && expandedCamera.source_url
                  ? <img src={getCameraStreamUrl(expandedCamera.id)} alt={`${expandedCamera.name} feed`} className="absolute inset-0 h-full w-full object-contain" />
                  : expandedCamera.source_type === "admin_local" || expandedCamera.source_type === "viewer_local"
                    ? <AdminLocalPreview cameraId={expandedCamera.id} />
                    : null
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                {expandedCamera.status === "online" && (
                  <div className="flex items-center gap-2 text-success">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    <span>Online</span>
                  </div>
                )}
                {"expiresIn" in expandedCamera && typeof expandedCamera.expiresIn === "number" && (
                  <div className={`flex items-center gap-1.5 ${expandedCamera.expiresIn < 60 ? "text-warning" : "text-success"}`}>
                    <Lock className="h-3 w-3" /> {formatTime(expandedCamera.expiresIn)}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ViewerDashboard;
