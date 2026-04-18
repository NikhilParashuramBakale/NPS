import { useNavigate } from "react-router-dom";
import { LogOut, Shield, Camera as CamIcon, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp, formatTime } from "@/context/AppContext";
import { SecurityBar } from "@/components/SecurityBar";
import { CameraTile } from "@/components/CameraTile";
import { AssignmentDialog } from "@/components/AssignmentDialog";
import { toast } from "sonner";

const AdminDashboard = () => {
  const { user, logout, cameras, assignments, revokeAssignment } = useApp();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast("Logged out");
    navigate("/");
  };

  const handleRevoke = (id: string, name: string) => {
    revokeAssignment(id);
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

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-4 p-4">
        {/* Left: Cameras */}
        <aside className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <CamIcon className="h-4 w-4 text-primary" />
            <h2 className="font-medium text-sm">Cameras</h2>
            <span className="ml-auto text-xs text-muted-foreground">{cameras.length}</span>
          </div>
          <ul className="space-y-2">
            {cameras.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm"
              >
                <span>{c.name}</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${c.status === "online" ? "bg-success animate-pulse" : "bg-destructive"}`}
                  />
                  <span className={`text-xs ${c.status === "online" ? "text-success" : "text-destructive"}`}>
                    {c.status === "online" ? "Online" : "Offline"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        {/* Center: Grid */}
        <main className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-medium text-sm mb-3">Live Feeds</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cameras.map((c) => (
              <CameraTile key={c.id} name={c.name} status={c.status} height="h-44" />
            ))}
          </div>
        </main>

        {/* Right: Assignments */}
        <aside className="rounded-lg border border-border bg-card p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="font-medium text-sm">Assignments</h2>
            <span className="ml-auto text-xs text-muted-foreground">{assignments.length}</span>
          </div>
          <div className="space-y-2 flex-1 overflow-auto">
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
                  <div className="text-xs text-muted-foreground">{camNames}</div>
                  <div className={`text-xs font-medium ${lowTime ? "text-warning" : "text-success"}`}>
                    {formatTime(a.expiresIn)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3">
            <AssignmentDialog />
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AdminDashboard;
