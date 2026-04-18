import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Shield, Lock, Eye, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp, formatTime } from "@/context/AppContext";
import { SecurityBar } from "@/components/SecurityBar";
import { CameraTile } from "@/components/CameraTile";
import { toast } from "sonner";

const ViewerDashboard = () => {
  const { user, logout, cameras, myAssignments } = useApp();
  const navigate = useNavigate();
  const notifiedRef = useRef<Set<string>>(new Set());
  const prevCount = useRef(myAssignments.length);

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

  const handleView = (name: string) => {
    toast.success(`Viewing ${name}`, { description: "Encrypted stream opened" });
  };

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
        {assignedCameras.length === 0 ? (
          <div className="mx-auto max-w-md mt-16 rounded-xl border border-warning/40 bg-warning/10 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-warning mx-auto mb-2" />
            <h2 className="font-semibold mb-1">No Active Camera Access</h2>
            <p className="text-sm text-muted-foreground">
              You have no cameras assigned, or all access has expired. Please contact your administrator.
            </p>
          </div>
        ) : (
          <div>
            <h2 className="font-medium text-sm mb-3 text-muted-foreground">
              Your Assigned Cameras ({assignedCameras.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {assignedCameras.map((c) => {
                const lowTime = c.expiresIn < 60;
                return (
                  <div
                    key={`${c.assignmentId}-${c.id}`}
                    className="rounded-lg border border-border bg-card overflow-hidden flex flex-col"
                  >
                    <CameraTile name={c.name} status={c.status} height="h-44" />
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{c.name}</span>
                        <span className="flex items-center gap-1 text-xs text-success">
                          <Lock className="h-3 w-3" /> Encrypted Stream
                        </span>
                      </div>
                      <div className={`text-xs font-medium ${lowTime ? "text-warning" : "text-success"}`}>
                        {formatTime(c.expiresIn)}
                      </div>
                      <Button
                        size="sm"
                        className="w-full bg-primary hover:bg-primary/90"
                        onClick={() => handleView(c.name)}
                      >
                        <Eye className="h-4 w-4 mr-1" /> View
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ViewerDashboard;
