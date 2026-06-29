import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, User, CheckCircle2, Circle, Activity, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/context/AppContext";
import type { PakeStepData } from "@/context/AppContext";
import { toast } from "sonner";

type PakeStep = {
  id: number;
  label: string;
  status: "pending" | "active" | "completed" | "error";
  description: string;
  data?: Record<string, string>;
};

const INITIAL_STEPS: PakeStep[] = [
  { id: 1, label: "Client Initialization", status: "pending", description: "Generating local scalar and ephemeral public message." },
  { id: 2, label: "Server Challenge", status: "pending", description: "Fetching salt and server's public message." },
  { id: 3, label: "Key Exchange", status: "pending", description: "Computing shared session key (Password remains local)." },
  { id: 4, label: "Client Confirmation", status: "pending", description: "Sending cryptographic proof of key knowledge (MacA)." },
  { id: 5, label: "Server Verification", status: "pending", description: "Verifying server identity (MacB) and establishing session." },
];

const Login = () => {
  const { login } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<null | "admin" | "viewer" | "resident" | "security_guard">(null);
  const [pakeSteps, setPakeSteps] = useState<PakeStep[]>(INITIAL_STEPS);
  const [showViz, setShowViz] = useState(false);

  const updateStep = (id: number, status: PakeStep["status"], data?: Record<string, string>) => {
    setPakeSteps((prev) =>
      prev.map((s) => {
        if (s.id < id && s.status !== "completed") return { ...s, status: "completed" };
        if (s.id === id) return { ...s, status, data: data || s.data };
        return s;
      }),
    );
  };

  const resetSteps = () => setPakeSteps(INITIAL_STEPS);

  const handlePakeStep = async (stepData: PakeStepData) => {
    await new Promise((r) => setTimeout(r, 1200));
    updateStep(stepData.step, "active", stepData.data);
  };

  const handleLogin = (role: "admin" | "viewer" | "resident" | "security_guard") => {
    setError("");
    if (!username || !password) {
      setError("Please enter username and password");
      return;
    }
    setLoading(role);
    setShowViz(true);
    resetSteps();

    void (async () => {
      try {
        const ok = await login(username, password, role, handlePakeStep);
        if (!ok) {
          setPakeSteps((prev) => prev.map((s) => (s.status === "active" ? { ...s, status: "error" } : s)));
          setLoading(null);
          setError("Invalid credentials or backend unavailable.");
          return;
        }
        updateStep(5, "completed");
        setLoading(null);
        toast.success(`Welcome, ${username}`, { description: `Logged in as ${role}` });
        setTimeout(() => navigate(role === "admin" ? "/admin" : "/viewer"), 500);
      } catch (err) {
        setLoading(null);
        setError("An unexpected error occurred.");
        console.error(err);
      }
    })();
  };

  return (
    <div className="relative z-10 mx-auto flex min-h-[calc(100vh-73px)] max-w-7xl items-center justify-center px-4 py-12 sm:px-6">
      <div className="grid w-full max-w-6xl grid-cols-1 items-start gap-8 lg:grid-cols-[400px_1fr] lg:gap-12">
        <div className="glass-card glow-border landing-fade-in space-y-8 p-8 sm:p-10">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 ring-1 ring-blue-400/30">
                <Terminal className="landing-accent h-5 w-5" />
              </div>
              <div>
                <h1 className="landing-fg text-2xl font-bold tracking-tight">Secure Console</h1>
                <p className="landing-muted text-[10px] font-semibold uppercase tracking-[0.2em]">
                  PAKE Authentication Terminal
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="landing-muted text-[11px] font-bold uppercase tracking-wider">
                Identity
              </Label>
              <div className="relative">
                <User className="landing-subtle absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="login-input h-12 pl-10"
                  placeholder="Username"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="landing-muted text-[11px] font-bold uppercase tracking-wider">
                Passphrase
              </Label>
              <div className="relative">
                <Lock className="landing-subtle absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-input h-12 pl-10"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm font-medium text-red-600 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
              <Button
                onClick={() => handleLogin("admin")}
                disabled={loading !== null}
                className="landing-cta-primary h-11 font-semibold"
              >
                {loading === "admin" ? <Loader2 className="h-5 w-5 animate-spin" /> : "Admin"}
              </Button>
              <Button
                onClick={() => handleLogin("resident")}
                disabled={loading !== null}
                className="landing-cta-secondary h-11 font-semibold"
              >
                {loading === "resident" ? <Loader2 className="h-5 w-5 animate-spin" /> : "Resident"}
              </Button>
              <Button
                onClick={() => handleLogin("security_guard")}
                disabled={loading !== null}
                className="landing-cta-secondary h-11 font-semibold"
              >
                {loading === "security_guard" ? <Loader2 className="h-5 w-5 animate-spin" /> : "Guard"}
              </Button>
            </div>
          </div>

          <div className="landing-divider landing-subtle flex items-center justify-between border-t pt-6 text-[10px] font-bold uppercase tracking-[0.15em]">
            <span className="flex items-center gap-2">
              Protocol <span className="landing-accent font-mono">SPAKE2</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E]" /> Encrypted handshake
            </span>
          </div>
        </div>

        <div className={`transition-all duration-700 ${showViz ? "opacity-100 translate-y-0" : "opacity-40 translate-y-2"}`}>
          <div className="glass-card glow-border p-8 sm:p-10">
            <div className="landing-divider mb-8 flex items-center justify-between border-b pb-6">
              <h2 className="landing-fg flex items-center gap-3 text-lg font-bold">
                <Activity className="landing-accent h-5 w-5" />
                Cryptographic Handshake Sequence
              </h2>
              <span className="landing-accent rounded-full bg-cyan-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest ring-1 ring-cyan-400/25">
                {showViz ? "Live Analysis" : "Standby"}
              </span>
            </div>

            <div className="space-y-6">
              {pakeSteps.map((step, idx) => (
                <div key={step.id} className="relative">
                  {idx !== pakeSteps.length - 1 && (
                    <div className="landing-divider absolute left-3 top-8 h-full w-px bg-current opacity-20" />
                  )}
                  <div className="flex gap-5">
                    <div className="relative z-10 mt-1">
                      {step.status === "completed" ? (
                        <CheckCircle2 className="h-6 w-6 text-[#22C55E]" />
                      ) : step.status === "active" ? (
                        <div className="landing-accent h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : step.status === "error" ? (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                          !
                        </div>
                      ) : (
                        <Circle className="landing-subtle h-6 w-6 opacity-60" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="mb-1 flex items-center gap-3">
                        <span className="landing-subtle font-mono text-[10px]">STEP 0{step.id}</span>
                        <h3
                          className={`text-sm font-bold uppercase tracking-wider ${
                            step.status === "active" ? "landing-accent" : "landing-fg"
                          }`}
                        >
                          {step.label}
                        </h3>
                      </div>
                      <p className="landing-muted mb-3 text-[13px] leading-relaxed">{step.description}</p>
                      {step.data && (
                        <div className="login-code-block space-y-2 overflow-hidden rounded-lg p-4 font-mono text-[10px]">
                          {Object.entries(step.data).map(([key, val]) => (
                            <div key={key} className="landing-divider flex gap-4 border-b pb-1 last:border-0 last:pb-0">
                              <span className="landing-subtle w-24 shrink-0 select-none">{key}</span>
                              <span className="landing-accent truncate font-semibold" title={val}>
                                {val}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border-l-4 border-l-[#3B82F6] bg-blue-500/5 p-5">
              <p className="landing-muted text-[12px] italic leading-relaxed">
                <strong className="landing-fg">Security note:</strong> The password is never sent in plaintext. It is used
                locally to compute the cryptographic messages shown above.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
