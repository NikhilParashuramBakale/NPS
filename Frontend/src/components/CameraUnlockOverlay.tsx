import { useState } from "react";
import { Shield, Key, Lock, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { issueCapabilityToken, validateCapabilityToken } from "@/lib/api";
import { toast } from "sonner";

interface Props {
  cameraId: number;
  onComplete: (cameraId: number, token: string) => void;
  onClose: () => void;
}

type UnlockStep = "idle" | "issuing" | "issued" | "validating" | "validated" | "error";

export const CameraUnlockOverlay = ({ cameraId, onComplete, onClose }: Props) => {
  const [step, setStep] = useState<UnlockStep>("idle");
  const [capToken, setCapToken] = useState<string>("");
  const [nonceValue, setNonceValue] = useState<string>("");
  const [decodedToken, setDecodedToken] = useState<Record<string, unknown> | null>(null);
  const [replayResult, setReplayResult] = useState<string>("");

  const decodeJwtPayload = (token: string) => {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1]));
    } catch {
      return null;
    }
  };

  const handleUnlock = async () => {
    setStep("issuing");
    try {
      // Step 1: Issue capability token
      await new Promise(r => setTimeout(r, 600));
      const issued = await issueCapabilityToken(cameraId);
      setCapToken(issued.capability_token);
      const decoded = decodeJwtPayload(issued.capability_token);
      setDecodedToken(decoded);
      setStep("issued");

      // Step 2: Generate nonce and validate
      await new Promise(r => setTimeout(r, 600));
      const nonce = crypto.randomUUID();
      setNonceValue(nonce);
      setStep("validating");

      await new Promise(r => setTimeout(r, 600));
      await validateCapabilityToken({
        camera_id: cameraId,
        capability_token: issued.capability_token,
        nonce,
      });

      setStep("validated");
      toast.success("Camera unlocked!", { description: "Capability + nonce validated successfully." });

      setTimeout(() => {
        onComplete(cameraId, issued.capability_token);
      }, 1200);
    } catch {
      setStep("error");
      toast.error("Unlock failed");
    }
  };

  const handleReplayDemo = async () => {
    if (!capToken || !nonceValue) return;
    try {
      await validateCapabilityToken({
        camera_id: cameraId,
        capability_token: capToken,
        nonce: nonceValue,
      });
      setReplayResult("❌ UNEXPECTED: Replay succeeded! (This should not happen)");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "409 Conflict: Nonce already used";
      setReplayResult(`✅ REPLAY BLOCKED! Server returned: ${msg}`);
      toast.error("Replay attack detected & blocked!", {
        description: "Check Security Events for REPLAY_ATTACK_DETECTED",
      });
    }
  };

  const statusIcon = (active: boolean, done: boolean) => {
    if (done) return <CheckCircle className="h-5 w-5 text-success" />;
    if (active) return <RefreshCw className="h-5 w-5 text-primary animate-spin" />;
    return <Lock className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">🔐 Zero-Trust Camera Unlock</h2>
          </div>
          {step !== "issuing" && step !== "validating" && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
          )}
        </div>

        <div className="space-y-2 mb-5 text-xs text-muted-foreground bg-secondary/20 rounded-lg p-3">
          <p className="font-medium text-foreground text-sm mb-1">Security Chain:</p>
          <div className="flex items-center gap-2 text-xs">
            <span className={step !== "idle" ? "text-success" : "text-muted-foreground"}>PAKE Login</span>
            <span className="text-muted-foreground">→</span>
            <span className={step !== "idle" ? "text-success" : "text-muted-foreground"}>JWT Identity</span>
            <span className="text-muted-foreground">→</span>
            <span className={step !== "idle" ? "text-success" : "text-muted-foreground"}>Admin Approval</span>
            <span className="text-muted-foreground">→</span>
            <span className={step === "issuing" || step === "issued" ? "text-primary" : step !== "idle" ? "text-success" : "text-muted-foreground"}>
              <strong>Capability Token</strong>
            </span>
            <span className="text-muted-foreground">→</span>
            <span className={step === "validating" || step === "validated" ? "text-primary" : step !== "idle" ? "text-success" : "text-muted-foreground"}>
              <strong>Nonce Validation</strong>
            </span>
            <span className="text-muted-foreground">→</span>
            <span className={step === "validated" ? "text-success font-bold" : "text-muted-foreground"}>📹 Feed</span>
          </div>
        </div>

        <div className="space-y-3 mb-5">
          {/* Step 1 */}
          <div className={`flex items-start gap-3 rounded-lg border p-3 ${step === "issuing" ? "border-primary/50 bg-primary/5" : step === "issued" || step === "validating" || step === "validated" ? "border-success/30 bg-success/5" : "border-border"}`}>
            <div className="mt-0.5">
              {statusIcon(step === "issuing", step === "issued" || step === "validating" || step === "validated")}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Step 1: Issue Capability Token</p>
              <p className="text-xs text-muted-foreground mt-0.5">Camera-scoped JWT — proves authorization for THIS camera only</p>
              {decodedToken && (
                <div className="mt-2 rounded bg-slate-950 p-2 font-mono text-[10px] text-green-400 overflow-x-auto">
                  {JSON.stringify(decodedToken, null, 2)}
                </div>
              )}
            </div>
          </div>

          {/* Step 2 */}
          <div className={`flex items-start gap-3 rounded-lg border p-3 ${step === "validating" ? "border-primary/50 bg-primary/5" : step === "validated" ? "border-success/30 bg-success/5" : "border-border"}`}>
            <div className="mt-0.5">
              {statusIcon(step === "validating", step === "validated")}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Step 2: Validate Nonce</p>
              <p className="text-xs text-muted-foreground mt-0.5">Fresh UUID — single use, prevents replay attacks</p>
              {nonceValue && (
                <div className="mt-1 rounded bg-slate-950 p-2 font-mono text-[10px] text-cyan-400 truncate">
                  Nonce: {nonceValue}
                </div>
              )}
            </div>
          </div>

          {/* Step 3 Result */}
          <div className={`flex items-start gap-3 rounded-lg border p-3 ${step === "validated" ? "border-success/50 bg-success/10" : step === "error" ? "border-destructive/50 bg-destructive/10" : "border-border opacity-50"}`}>
            <div className="mt-0.5">
              {step === "validated" ? <CheckCircle className="h-5 w-5 text-success" /> : step === "error" ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <Lock className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Step 3: Camera Unlocked</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {step === "validated" ? "✅ Feed access granted — both checks passed!" : step === "error" ? "❌ Unlock failed — try again" : "Waiting for unlock..."}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {step === "idle" && (
            <Button onClick={handleUnlock} className="flex-1">
              <Key className="h-4 w-4 mr-1" /> Unlock Camera Feed
            </Button>
          )}

          {(step === "issued" || step === "validating") && (
            <Button disabled className="flex-1">
              <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Processing...
            </Button>
          )}

          {step === "validated" && (
            <>
              <Button variant="outline" onClick={handleReplayDemo}>
                <AlertTriangle className="h-4 w-4 mr-1" /> Demo: Replay Same Nonce
              </Button>
            </>
          )}

          {step === "error" && (
            <Button onClick={handleUnlock} variant="destructive" className="flex-1">
              Retry
            </Button>
          )}
        </div>

        {/* Replay Result */}
        {replayResult && (
          <div className={`mt-3 rounded-lg border p-3 text-xs font-medium ${replayResult.includes("✅") ? "border-success/30 bg-success/5 text-success" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
            {replayResult}
          </div>
        )}
      </div>
    </div>
  );
};