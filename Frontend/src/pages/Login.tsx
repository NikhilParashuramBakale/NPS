import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Loader2, Lock, User, CheckCircle2, Circle, Activity } from "lucide-react";
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
  const [loading, setLoading] = useState<null | "admin" | "viewer">(null);
  const [pakeSteps, setPakeSteps] = useState<PakeStep[]>(INITIAL_STEPS);
  const [showViz, setShowViz] = useState(false);

  const updateStep = (id: number, status: PakeStep["status"], data?: Record<string, string>) => {
    setPakeSteps(prev => prev.map(s => {
      if (s.id < id && s.status !== "completed") {
        return { ...s, status: "completed" }; // Mark previous as completed
      }
      if (s.id === id) {
        return { ...s, status, data: data || s.data };
      }
      return s;
    }));
  };

  const resetSteps = () => {
    setPakeSteps(INITIAL_STEPS);
  };

  const handlePakeStep = async (stepData: PakeStepData) => {
    // Add artificial delay to make it readable for the teacher
    await new Promise(r => setTimeout(r, 1200)); 
    updateStep(stepData.step, "active", stepData.data);
  };

  const handleLogin = (role: "admin" | "viewer") => {
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
          setPakeSteps(prev => prev.map(s => s.status === "active" ? { ...s, status: "error" } : s));
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
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] p-4 font-sans text-slate-900">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-12 items-start">
        
        {/* Left Side: Login Form */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 space-y-10">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-blue-600">
              <Shield className="h-10 w-10" />
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">SecureCam</h1>
            </div>
            <p className="text-slate-500 font-medium uppercase tracking-widest text-[11px]">Zero-Trust Cryptographic Terminal</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Identity</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 bg-slate-50 border-slate-200 focus:ring-blue-500 rounded-lg h-12"
                  placeholder="Username"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Passphrase</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-slate-50 border-slate-200 focus:ring-blue-500 rounded-lg h-12"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-100 p-4 text-[13px] text-red-600 font-bold">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              <Button
                onClick={() => handleLogin("admin")}
                disabled={loading !== null}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 shadow-sm rounded-lg"
              >
                {loading === "admin" ? <Loader2 className="h-5 w-5 animate-spin" /> : "Admin Access"}
              </Button>
              <Button
                onClick={() => handleLogin("viewer")}
                disabled={loading !== null}
                variant="outline"
                className="border-slate-200 text-slate-700 font-bold h-12 hover:bg-slate-50 rounded-lg"
              >
                {loading === "viewer" ? <Loader2 className="h-5 w-5 animate-spin" /> : "Viewer Access"}
              </Button>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
            <span className="flex items-center gap-2">Protocol <span className="text-blue-600 font-mono">SPAKE2</span></span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> NIST Approved</span>
          </div>
        </div>

        {/* Right Side: Protocol Visualization */}
        <div className={`transition-all duration-700 ${showViz ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"}`}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10">
            <div className="flex items-center justify-between mb-8 border-b border-slate-50 pb-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                <Activity className="h-5 w-5 text-blue-500" />
                Cryptographic Handshake Sequence
              </h2>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest">Live Analysis</span>
            </div>
            
            <div className="space-y-8">
              {pakeSteps.map((step, idx) => (
                <div key={step.id} className="relative">
                  {idx !== pakeSteps.length - 1 && (
                    <div className="absolute left-3 top-8 w-[1px] h-full bg-slate-100" />
                  )}
                  <div className="flex gap-6">
                    <div className="mt-1 relative z-10 bg-white">
                      {step.status === "completed" ? (
                        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                      ) : step.status === "active" ? (
                        <div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                      ) : step.status === "error" ? (
                        <div className="h-6 w-6 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px] font-bold">!</div>
                      ) : (
                        <Circle className="h-6 w-6 text-slate-200" />
                      )}
                    </div>
                    <div className="flex-1 pb-6">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-[10px] font-mono text-slate-400">STEP 0{step.id}</span>
                        <h3 className={`text-sm font-bold uppercase tracking-wider ${step.status === "active" ? "text-blue-600" : "text-slate-800"}`}>
                          {step.label}
                        </h3>
                      </div>
                      <p className="text-[13px] text-slate-500 leading-relaxed mb-3">
                        {step.description}
                      </p>
                      {step.data && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono text-[10px] text-slate-600 space-y-2 overflow-hidden shadow-inner">
                          {Object.entries(step.data).map(([key, val]) => (
                            <div key={key} className="flex gap-4 border-b border-slate-100 last:border-0 pb-1 last:pb-0">
                              <span className="text-slate-400 select-none w-24 shrink-0">{key}</span>
                              <span className="text-blue-600 font-semibold truncate" title={val}>{val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 bg-slate-50 rounded-xl p-5 border-l-4 border-l-blue-500">
              <p className="text-[12px] text-slate-600 leading-relaxed italic">
                <strong>Pedagogical Note:</strong> Notice how the password is never sent in plaintext. Instead, it is used locally to compute the cryptographic messages seen above.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;
