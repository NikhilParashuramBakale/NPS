import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, ClipboardCheck, LogOut, Shield, Camera as CamIcon, Users, X, UserPlus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp, formatTime } from "@/context/AppContext";
import { SecurityBar } from "@/components/SecurityBar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CameraTile } from "@/components/CameraTile";
import { AssignmentDialog } from "@/components/AssignmentDialog";
import { UserDialog } from "@/components/UserDialog";
import { CameraSourceDialog } from "@/components/CameraSourceDialog";
import { AdminLocalPreview } from "@/components/AdminLocalPreview";
import { AdminLocalStreamer } from "@/components/AdminLocalStreamer";
import { MJPEGRelayStreamer } from "@/components/MJPEGRelayStreamer";
import { approveAccessRequest, fetchPendingRequests, getCameraStreamUrl, rejectAccessRequest, type AccessRequest } from "@/lib/api";
import { toast } from "sonner";

const AdminDashboard = () => {
  const { user, logout, cameras, assignments, revokeAssignment, viewers, updateCameraAccess, refreshDashboard } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"assignments" | "users" | "viewer-cameras">("assignments");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([]);

  const refreshRequests = () => fetchPendingRequests().then(setPendingRequests).catch(() => setPendingRequests([]));

  useEffect(() => {
    void refreshRequests();
  }, []);

  const expandedCamera = useMemo(
    () => (expandedId === null ? null : cameras.find((c) => c.id === expandedId) ?? null),
    [expandedId, cameras]
  );

  const handleLogout = () => {
    logout();
    toast("Logged out");
    navigate("/");
  };

  const handleRevoke = async (id: string, name: string) => {
    const ok = await revokeAssignment(id);
    if (!ok) {
      toast.error("Could not revoke access");
      return;
    }
    toast.error("Access revoked", { description: `${name}'s access was revoked` });
  };

  const adminCameras = cameras.filter((c) => c.owner_id === null);
  const configuredCameras = cameras.filter((c) => c.source_type !== "unconfigured" && c.is_active);
  const ownerLabel = (camera: typeof cameras[number]) => {
    if (camera.owner_id === null) return "Admin";
    const owner = viewers.find((v) => v.id === camera.owner_id);
    return owner?.username ?? "Unknown";
  };

  const liveFeedGridClass = (count: number) => {
    if (count <= 1) return "grid grid-cols-1 gap-6 max-w-4xl w-full";
    return "grid grid-cols-1 xl:grid-cols-2 gap-6";
  };
  const unconfiguredAdminCameras = adminCameras.filter((c) => c.source_type === "unconfigured");
  const viewerCameras = cameras.filter((c) => c.owner_id !== null);
  const viewerNameFor = (id: number | null) => viewers.find((v) => v.id === id)?.username ?? "Viewer";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SecurityBar />
      <header className="dashboard-header flex items-center justify-between px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="font-semibold">Admin Dashboard</h1>
          <span className="hidden sm:inline text-xs text-muted-foreground ml-2">
            • {user?.username}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-1" /> Logout
        </Button>
        </div>
      </header>

      {unconfiguredAdminCameras.length > 0 && (
        <div className="mx-4 sm:mx-6 mt-4 rounded-xl border border-warning/40 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            <div className="space-y-2 flex-1">
              <div>
                <h2 className="font-semibold text-sm">Configure your cameras</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Set up your Admin Webcam and Admin IP Camera so viewers can request and watch live feeds.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {unconfiguredAdminCameras.map((camera) => (
                  <CameraSourceDialog key={camera.id} camera={camera} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-5 bg-secondary/10 p-4 sm:p-6 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(260px,320px)]">
        {/* Left: Cameras */}
        <aside className="rounded-xl border border-border bg-card shadow-sm p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <CamIcon className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-base">Cameras</h2>
            <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {cameras.length}
            </span>
          </div>
          <ul className="space-y-3 flex-1 overflow-auto pr-1">
            {cameras.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-3 rounded-lg border border-border/50 bg-secondary/20 p-3 hover:bg-secondary/40 transition-all hover:border-primary/30"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground truncate">{c.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-1 shrink-0">{ownerLabel(c)}</span>
                  {c.status === "online" && (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                      <span>Online</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {c.source_type === "admin_local" && <AdminLocalStreamer cameraId={c.id} />}
                  {c.source_type === "ip_mjpeg" && c.source_url && (
                    <MJPEGRelayStreamer cameraId={c.id} cameraName={c.name} sourceUrl={c.source_url} />
                  )}
                  {c.owner_id === null && <CameraSourceDialog camera={c} />}
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* Center: Grid */}
        <main className="min-w-0 rounded-2xl border border-white/10 bg-card/80 p-5 shadow-md">
          <h2 className="mb-4 text-base font-semibold">Live Feeds</h2>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><Link to="/security-dashboard"><Activity className="h-4 w-4 mr-1" />Security Dashboard</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/audit-logs"><ClipboardCheck className="h-4 w-4 mr-1" />Audit Logs</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/security-events">Security Events</Link></Button>
          </div>
          <div className={`${liveFeedGridClass(configuredCameras.length)} ${configuredCameras.length === 1 ? "mx-auto" : ""}`}>
            {configuredCameras.map((c) => {
              const preview = c.source_type === "ip_mjpeg" && c.source_url
                ? <img src={getCameraStreamUrl(c.id, c.source_url)} alt={`${c.name} feed`} className="h-full w-full object-cover" />
                : c.source_type === "admin_local" || c.source_type === "viewer_local"
                  ? <AdminLocalPreview cameraId={c.id} objectFit="cover" active={expandedId !== c.id} />
                  : null;
              return (
                <CameraTile
                  key={c.id}
                  name={`${c.name} (${ownerLabel(c)})`}
                  status={c.status}
                  variant="card"
                  preview={preview}
                  onExpand={() => setExpandedId(c.id)}
                />
              );
            })}
          </div>
        </main>

        {/* Right: Management Panel */}
        <aside className="rounded-lg border border-border bg-card p-4 flex flex-col">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "assignments" | "users")} className="flex flex-col h-full">
            <TabsList className="grid w-full grid-cols-3 mb-3">
              <TabsTrigger value="assignments" className="text-xs">
                <Users className="h-3.5 w-3.5 mr-1" /> Assignments
                <span className="ml-auto text-xs text-muted-foreground">{assignments.length}</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="text-xs">
                <UserPlus className="h-3.5 w-3.5 mr-1" /> Users
              </TabsTrigger>
              <TabsTrigger value="viewer-cameras" className="text-xs">
                <CamIcon className="h-3.5 w-3.5 mr-1" /> Viewer Cameras
                <span className="ml-auto text-xs text-muted-foreground">{viewerCameras.length}</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="assignments" className="flex-1 overflow-auto mt-0">
              <div className="space-y-2">
                {pendingRequests.length > 0 && (
                  <div className="mb-3 space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3">
                    <div className="text-xs font-semibold text-warning">Pending access requests</div>
                    {pendingRequests.map((request) => (
                      <div key={request.id} className="rounded-md border border-border bg-card p-2">
                        <div className="text-sm font-medium">{request.requester_name}{" -> "}{request.camera_name}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{request.reason}</p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            onClick={async () => {
                              await approveAccessRequest(request.id, 24);
                              toast.success("Request approved", { description: "Temporary access granted for 24 hours." });
                              await Promise.all([refreshRequests(), refreshDashboard()]);
                            }}
                          >
                            Approve 24h
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await rejectAccessRequest(request.id, "Rejected by administrator");
                              toast.error("Request rejected");
                              await Promise.all([refreshRequests(), refreshDashboard()]);
                            }}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {assignments.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    No active assignments
                  </p>
                )}
                {assignments.map((a) => {
                  const camNames = a.cameraIds
                    .map((id) => cameras.find((c) => c.id === id)?.name)
                    .filter(Boolean)
                    .join(", ");
                  const lowTime = a.expiresIn < 60;
                  return (
                    <div
                      key={a.id}
                      className="rounded-md border border-border bg-secondary/40 p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{a.viewerName}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRevoke(a.id, a.viewerName)}
                        >
                          <X className="h-3.5 w-3.5 mr-1" /> Revoke
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{camNames}</div>
                      <div className={`text-xs font-medium ${lowTime ? "text-warning" : "text-success"}`}>
                        {formatTime(a.expiresIn)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <AssignmentDialog />
              </div>
            </TabsContent>
            
            <TabsContent value="users" className="flex-1 overflow-auto mt-0">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center py-6">
                  Manage viewer accounts
                </p>
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <UserDialog />
              </div>
            </TabsContent>

            <TabsContent value="viewer-cameras" className="flex-1 overflow-auto mt-0">
              <div className="space-y-2">
                {viewerCameras.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    No viewer cameras yet
                  </p>
                )}
                {viewerCameras.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-md border border-border bg-secondary/40 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">Owner: {viewerNameFor(c.owner_id)}</div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.is_active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {c.is_active ? "Active" : "Disabled"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full ${c.share_approved ? "bg-success/10 text-success" : "bg-secondary/70 text-muted-foreground"}`}>
                        {c.share_approved ? "Share approved" : c.share_requested ? "Share requested" : "Not shared"}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full ${c.source_type === "ip_mjpeg" ? "bg-secondary/70 text-muted-foreground" : "bg-secondary/70 text-muted-foreground"}`}>
                        {c.source_type === "ip_mjpeg" ? "IP Webcam" : "Viewer webcam"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {c.share_requested && !c.share_approved && (
                        <Button
                          size="sm"
                          className="bg-primary hover:bg-primary/90"
                          onClick={async () => {
                            const ok = await updateCameraAccess(c.id, { share_approved: true });
                            if (ok) {
                              toast.success("Share approved", { description: c.name });
                            } else {
                              toast.error("Could not approve share");
                            }
                          }}
                        >
                          Approve Share
                        </Button>
                      )}
                      {!c.share_approved && !c.share_requested && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            const ok = await updateCameraAccess(c.id, { share_approved: true });
                            if (ok) {
                              toast.success("Share allowed", { description: c.name });
                            } else {
                              toast.error("Could not allow share");
                            }
                          }}
                        >
                          Allow Share
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={c.is_active ? "destructive" : "secondary"}
                        onClick={async () => {
                          const ok = await updateCameraAccess(c.id, { is_active: !c.is_active });
                          if (ok) {
                            toast.success(c.is_active ? "Camera disabled" : "Camera enabled", { description: c.name });
                          } else {
                            toast.error("Could not update camera status");
                          }
                        }}
                      >
                        {c.is_active ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <Dialog open={expandedId !== null} onOpenChange={(open) => { if (!open) setExpandedId(null); }}>
        <DialogContent className="max-w-5xl bg-card p-4 sm:p-6">
          {expandedCamera && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>{expandedCamera.name}</DialogTitle>
              </DialogHeader>
              <CameraTile
                name={expandedCamera.name}
                status={expandedCamera.status}
                variant="expanded"
                preview={expandedCamera.source_type === "ip_mjpeg" && expandedCamera.source_url
                  ? <img src={getCameraStreamUrl(expandedCamera.id, expandedCamera.source_url)} alt={`${expandedCamera.name} feed`} className="h-full w-full object-contain" />
                  : expandedCamera.source_type === "admin_local" || expandedCamera.source_type === "viewer_local"
                    ? <AdminLocalPreview cameraId={expandedCamera.id} objectFit="contain" active />
                    : null
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                {expandedCamera.status === "online" && (
                  <div className="flex items-center gap-2 text-sm text-success">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    <span>Online</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {expandedCamera.owner_id === null && <CameraSourceDialog camera={expandedCamera} />}
                  {expandedCamera.source_type === "admin_local" && expandedCamera.owner_id === null && (
                    <AdminLocalStreamer cameraId={expandedCamera.id} />
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
