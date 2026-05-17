import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Shield, Camera as CamIcon, Users, X, UserPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp, formatTime } from "@/context/AppContext";
import { SecurityBar } from "@/components/SecurityBar";
import { CameraTile } from "@/components/CameraTile";
import { AssignmentDialog } from "@/components/AssignmentDialog";
import { UserDialog } from "@/components/UserDialog";
import { CameraSourceDialog } from "@/components/CameraSourceDialog";
import { AdminLocalPreview } from "@/components/AdminLocalPreview";
import { AdminLocalStreamer } from "@/components/AdminLocalStreamer";
import { getCameraStreamUrl } from "@/lib/api";
import { toast } from "sonner";

const AdminDashboard = () => {
  const { user, logout, cameras, assignments, revokeAssignment } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"assignments" | "users">("assignments");
  const [expandedId, setExpandedId] = useState<number | null>(null);

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SecurityBar />
      <header className="flex items-center justify-between border-b border-border bg-card px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="font-semibold">Admin Dashboard</h1>
          <span className="hidden sm:inline text-xs text-muted-foreground ml-2">
            • {user?.username}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-1" /> Logout
        </Button>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[280px_1fr_360px] gap-4 p-4">
        {/* Left: Cameras */}
        <aside className="rounded-lg border border-border bg-card p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <CamIcon className="h-4 w-4 text-primary" />
            <h2 className="font-medium text-sm">Cameras</h2>
            <span className="ml-auto text-xs text-muted-foreground">{cameras.length}</span>
          </div>
          <ul className="space-y-2 flex-1 overflow-auto">
            {cameras.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2.5 text-sm"
              >
                <span className="truncate flex-1 mr-2">{c.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {c.source_type === "admin_local" && <AdminLocalStreamer cameraId={c.id} />}
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${c.status === "online" ? "bg-success animate-pulse" : "bg-destructive"}`}
                    />
                    <span className={`text-xs ${c.status === "online" ? "text-success" : "text-destructive"}`}>
                      {c.status === "online" ? "Online" : "Offline"}
                    </span>
                  </span>
                  <CameraSourceDialog camera={c} />
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* Center: Grid */}
        <main className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-medium text-sm mb-3">Live Feeds</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cameras.map((c) => {
              const preview = c.source_type === "ip_mjpeg" && c.source_url
                ? <img src={getCameraStreamUrl(c.id)} alt={`${c.name} feed`} className="absolute inset-0 h-full w-full object-cover" />
                : c.source_type === "admin_local"
                  ? <AdminLocalPreview cameraId={c.id} />
                  : null;
              return (
                <CameraTile
                  key={c.id}
                  name={c.name}
                  status={c.status}
                  height="h-44"
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
            <TabsList className="grid w-full grid-cols-2 mb-3">
              <TabsTrigger value="assignments" className="text-xs">
                <Users className="h-3.5 w-3.5 mr-1" /> Assignments
                <span className="ml-auto text-xs text-muted-foreground">{assignments.length}</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="text-xs">
                <UserPlus className="h-3.5 w-3.5 mr-1" /> Users
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="assignments" className="flex-1 overflow-auto mt-0">
              <div className="space-y-2">
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
          </Tabs>
        </aside>
      </div>

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
                  : expandedCamera.source_type === "admin_local"
                    ? <AdminLocalPreview cameraId={expandedCamera.id} />
                    : null
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${expandedCamera.status === "online" ? "bg-success" : "bg-destructive"}`} />
                  <span className={expandedCamera.status === "online" ? "text-success" : "text-destructive"}>
                    {expandedCamera.status === "online" ? "Online" : "Offline"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CameraSourceDialog camera={expandedCamera} />
                  {expandedCamera.source_type === "admin_local" && (
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
