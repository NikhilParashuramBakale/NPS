import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { LogOut, Shield, Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp, formatTime, type Camera } from "@/context/AppContext";
import { SecurityBar } from "@/components/SecurityBar";
import { CameraTile } from "@/components/CameraTile";
import { AdminLocalPreview } from "@/components/AdminLocalPreview";
import { ViewerCameraDialog } from "@/components/ViewerCameraDialog";
import { ViewerLocalStreamer } from "@/components/ViewerLocalStreamer";
import {
  getCameraCapabilityStreamUrl,
  getCameraStreamUrl,
  issueCapabilityToken,
  validateCapabilityToken,
} from "@/lib/api";
import { toast } from "sonner";

const previewPlaceholder = (message: string) => (
  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 p-6 text-center">
    <div className="max-w-[16rem] space-y-3">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <Lock className="h-4 w-4 text-[#22D3EE]" />
      </div>
      <p className="text-sm leading-relaxed text-[#94A3B8]">{message}</p>
    </div>
  </div>
);

const assignedGridClass = (count: number) => {
  if (count <= 1) return "grid grid-cols-1 gap-6 max-w-4xl w-full";
  if (count <= 2) return "grid grid-cols-1 lg:grid-cols-2 gap-6";
  return "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-6";
};

const ownedGridClass = (count: number) => {
  if (count <= 1) return "grid grid-cols-1 gap-6 max-w-3xl w-full";
  return "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6";
};

type CapabilitySession = {
  token: string;
  validated: boolean;
};

const buildAssignedPreview = (
  camera: Camera,
  session: CapabilitySession | null | undefined,
  accessDenied: boolean,
  onAccessDenied: (cameraId: number) => void,
  objectFit: "cover" | "contain" = "cover",
  active = true,
) => {
  if (accessDenied) {
    return previewPlaceholder("Access revoked or expired. Request access again.");
  }
  if (!session?.validated) {
    return previewPlaceholder("Protected feed — expand to validate capability");
  }
  if (camera.source_type === "unconfigured") {
    return previewPlaceholder("Admin has not configured this camera yet");
  }
  if (camera.source_type === "ip_mjpeg") {
    if (!camera.source_url) {
      return previewPlaceholder("Admin has not set the IP camera URL");
    }
    return (
      <img
        src={getCameraCapabilityStreamUrl(camera.id, session.token, camera.source_url)}
        alt={`${camera.name} feed`}
        className={`h-full w-full ${objectFit === "contain" ? "object-contain" : "object-cover"}`}
        onError={() => onAccessDenied(camera.id)}
      />
    );
  }
  if (camera.source_type === "admin_local") {
    return (
      <AdminLocalPreview
        cameraId={camera.id}
        capabilityToken={session.token}
        emptyMessage="Waiting for admin to start webcam stream"
        onAccessDenied={() => onAccessDenied(camera.id)}
        objectFit={objectFit}
        active={active}
      />
    );
  }
  if (camera.source_type === "viewer_local") {
    return (
      <AdminLocalPreview
        cameraId={camera.id}
        capabilityToken={session.token}
        emptyMessage="Waiting for camera owner to start streaming"
        onAccessDenied={() => onAccessDenied(camera.id)}
        objectFit={objectFit}
        active={active}
      />
    );
  }
  return null;
};

const dashboardTitleForRole = (role?: string) => {
  if (role === "resident") return "Resident Dashboard";
  if (role === "security_guard") return "Security Guard Dashboard";
  return "Viewer Dashboard";
};

const ViewerDashboard = () => {
  const { user, logout, cameras, myAssignments, requestCameraShare, refreshDashboard } = useApp();
  const navigate = useNavigate();
  const prevCount = useRef(myAssignments.length);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [capabilityStatus, setCapabilityStatus] = useState<Record<number, string>>({});
  const [capabilitySessions, setCapabilitySessions] = useState<Record<number, CapabilitySession>>({});
  const [accessDeniedCameras, setAccessDeniedCameras] = useState<Record<number, boolean>>({});

  const handleAccessDenied = useCallback(async (cameraId: number) => {
    setAccessDeniedCameras((prev) => (prev[cameraId] ? prev : { ...prev, [cameraId]: true }));
    setCapabilitySessions((prev) => {
      if (!prev[cameraId]) return prev;
      const next = { ...prev };
      delete next[cameraId];
      return next;
    });
    setCapabilityStatus((prev) => ({
      ...prev,
      [cameraId]: "Access revoked or expired. Request access again.",
    }));
    setExpandedId((prev) => (prev === cameraId ? null : prev));
    await refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    const assignedIds = new Set(myAssignments.flatMap((a) => a.cameraIds));
    setCapabilitySessions((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!assignedIds.has(Number(id))) {
          delete next[Number(id)];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setAccessDeniedCameras((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!assignedIds.has(Number(id))) {
          delete next[Number(id)];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [myAssignments]);

  useEffect(() => {
    if (prevCount.current > 0 && myAssignments.length < prevCount.current) {
      toast.error("Session expired", { description: "Access to a camera has ended" });
    } else if (prevCount.current < myAssignments.length) {
      toast.success("Camera access granted", { description: "A new camera assignment is now available" });
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

  const openCamera = async (cameraId: number, requiresCapability: boolean) => {
    setExpandedId(cameraId);
    if (!requiresCapability) return;
    if (capabilitySessions[cameraId]?.validated) return;
    try {
      const issued = await issueCapabilityToken(cameraId);
      const nonce = crypto.randomUUID();
      await validateCapabilityToken({ camera_id: cameraId, capability_token: issued.capability_token, nonce });
      setCapabilitySessions((prev) => ({
        ...prev,
        [cameraId]: { token: issued.capability_token, validated: true },
      }));
      setCapabilityStatus((prev) => ({ ...prev, [cameraId]: "Protected capability validated" }));
      toast.success("Capability token validated", { description: "Nonce accepted for this camera session." });
    } catch {
      setCapabilityStatus((prev) => ({ ...prev, [cameraId]: "Capability validation failed" }));
      toast.error("Capability validation failed");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SecurityBar />
      <header className="dashboard-header flex items-center justify-between px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="font-semibold">{dashboardTitleForRole(user?.role)}</h1>
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
            <div className="mx-auto flex min-h-[280px] max-w-2xl flex-col items-center justify-center rounded-2xl border border-warning/30 bg-warning/5 px-8 py-12 text-center">
              <AlertTriangle className="mb-4 h-10 w-10 text-warning" />
              <h2 className="text-lg font-semibold">No Active Camera Access</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                You have no cameras assigned. Add your camera or contact your administrator.
              </p>
              <Button asChild className="mt-6" variant="outline" size="sm">
                <Link to="/requests">Request Access</Link>
              </Button>
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
            <div className={ownedGridClass(myCameras.length)}>
              {myCameras.map((c) => {
                const preview = c.source_type === "ip_mjpeg" && c.source_url
                  ? <img src={getCameraStreamUrl(c.id, c.source_url)} alt={`${c.name} feed`} className="h-full w-full object-cover" />
                  : c.source_type === "viewer_local"
                    ? <AdminLocalPreview cameraId={c.id} objectFit="cover" active={expandedId !== c.id} />
                    : null;
                return (
                  <div
                    key={`owned-${c.id}`}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-card/80 flex flex-col shadow-md"
                  >
                    <CameraTile
                      name={c.name}
                      status={c.status}
                      variant="card"
                      preview={preview}
                      onExpand={() => setExpandedId(c.id)}
                    />
                    <div className="space-y-3 p-5">
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
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline"><Link to="/requests">Request Access</Link></Button>
              <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Encrypted Protected
              </div>
            </div>
          </div>
          {assignedNonOwned.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              No assigned cameras yet.
            </div>
          ) : (
            <div className={`${assignedGridClass(assignedNonOwned.length)} ${assignedNonOwned.length === 1 ? "mx-auto" : ""}`}>
              {assignedNonOwned.map((c) => {
                const lowTime = c.expiresIn < 60;
                const preview = buildAssignedPreview(c, capabilitySessions[c.id], !!accessDeniedCameras[c.id], handleAccessDenied, "cover", expandedId !== c.id);
                return (
                  <div
                    key={`${c.assignmentId}-${c.id}`}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-card/80 flex flex-col transition-colors hover:border-cyan-400/30 shadow-md"
                  >
                    <CameraTile
                      name={c.name}
                      status={c.status}
                      variant="card"
                      preview={preview}
                      onExpand={() => void openCamera(c.id, true)}
                    />
                    <div className="space-y-3 p-5">
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
                      {capabilityStatus[c.id] && (
                        <div className="text-xs text-primary">{capabilityStatus[c.id]}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

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
                preview={"expiresIn" in expandedCamera ? buildAssignedPreview(expandedCamera, capabilitySessions[expandedCamera.id], !!accessDeniedCameras[expandedCamera.id], handleAccessDenied, "contain", true) : (
                  expandedCamera.source_type === "ip_mjpeg" && expandedCamera.source_url
                    ? <img src={getCameraStreamUrl(expandedCamera.id, expandedCamera.source_url)} alt={`${expandedCamera.name} feed`} className="h-full w-full object-contain" />
                    : expandedCamera.source_type === "viewer_local"
                      ? <AdminLocalPreview cameraId={expandedCamera.id} objectFit="contain" active />
                      : null
                )}
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
