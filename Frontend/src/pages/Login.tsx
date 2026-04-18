import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Loader2, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";

const Login = () => {
  const { login } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<null | "admin" | "viewer">(null);

  const handleLogin = (role: "admin" | "viewer") => {
    setError("");
    if (!username || !password) {
      setError("Please enter username and password");
      return;
    }
    setLoading(role);
    setTimeout(() => {
      const ok = login(username, password, role);
      setLoading(null);
      if (!ok) {
        setError("Invalid credentials. Password must be at least 3 characters.");
        return;
      }
      toast.success(`Welcome, ${username}`, { description: `Logged in as ${role}` });
      navigate(role === "admin" ? "/admin" : "/viewer");
    }, 700);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.15),transparent_60%)] pointer-events-none" />
      <div className="w-full max-w-md relative">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="rounded-2xl bg-primary/15 p-4 ring-1 ring-primary/30">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">SecureCam Access</h1>
          <p className="text-sm text-muted-foreground">Encrypted camera management portal</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-2xl">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-9"
                  placeholder="admin_user"
                  autoComplete="username"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <Button
                onClick={() => handleLogin("admin")}
                disabled={loading !== null}
                className="bg-primary hover:bg-primary/90"
              >
                {loading === "admin" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Login as Admin"}
              </Button>
              <Button
                onClick={() => handleLogin("viewer")}
                disabled={loading !== null}
                variant="secondary"
              >
                {loading === "viewer" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Login as Viewer"}
              </Button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3 text-success" />
            End-to-end encrypted session
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
