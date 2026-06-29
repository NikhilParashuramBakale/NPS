import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Shield,
  Lock,
  KeyRound,
  Fingerprint,
  Eye,
  FileSearch,
  UserCheck,
  ArrowRight,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useApp } from "@/context/AppContext";
import { fetchHealth } from "@/lib/api";

const flowSteps = [
  "PAKE Login",
  "JWT Identity",
  "Admin Approval",
  "Capability Token",
  "Nonce Validation",
  "Camera Access",
];

const trustFeatures = [
  { icon: Fingerprint, label: "PAKE Login", desc: "Password never leaves the client" },
  { icon: Eye, label: "Capability-Gated Streams", desc: "Separate token for camera viewing" },
  { icon: Shield, label: "Replay Attack Detection", desc: "One-time nonce enforcement" },
  { icon: FileSearch, label: "Audit-Ready Access Logs", desc: "Full security event trail" },
];

const featureCards = [
  { title: "Password never transmitted", body: "SPAKE2 proves knowledge without sending credentials over the network." },
  { title: "JWT only proves identity", body: "Session tokens identify the user — they do not authorize camera feeds." },
  { title: "Temporary camera assignments", body: "Admins grant time-bound access that expires automatically." },
  { title: "Camera-scoped capability tokens", body: "Each token is limited to one camera and one permission set." },
  { title: "Fresh nonce replay protection", body: "Reused nonces are rejected and logged as security incidents." },
  { title: "Admin audit dashboard", body: "Review grants, revocations, logins, and security events in one place." },
];

const workflow = [
  "PAKE Authentication",
  "JWT Identity Issued",
  "Resident Requests Access",
  "Admin Approves",
  "Assignment Created",
  "Capability Token Issued",
  "Nonce Validated",
  "Secure Camera Feed Unlocks",
];

const roles = [
  {
    title: "Admin",
    accent: "from-blue-500/20 to-cyan-500/10",
    items: ["Approve or revoke access", "Manage camera sources", "View audit & security dashboard"],
  },
  {
    title: "Resident",
    accent: "from-cyan-500/20 to-emerald-500/10",
    items: ["Request camera access with reason", "View only assigned cameras", "Capability validation before stream"],
  },
  {
    title: "Security Guard",
    accent: "from-violet-500/20 to-blue-500/10",
    items: ["Operational access when assigned", "No permanent camera permissions", "Same zero-trust enforcement"],
  },
];

const LandingPage = () => {
  const { user, initialized } = useApp();
  const navigate = useNavigate();
  const [backendStatus, setBackendStatus] = useState<"LIVE" | "OFFLINE" | "CHECKING">("CHECKING");

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const resp = await fetchHealth();
        if (isMounted) {
          setBackendStatus(resp.status === "ok" ? "LIVE" : "OFFLINE");
        }
      } catch (err) {
        if (isMounted) {
          setBackendStatus("OFFLINE");
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!initialized || !user) return;
    if (user.role === "admin") navigate("/admin", { replace: true });
    else navigate("/viewer", { replace: true });
  }, [user, initialized, navigate]);

  const scrollToWorkflow = () => {
    document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth" });
  };

  if (!initialized) return null;

  const StatusBadge = () => (
    <div className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold tracking-wider ${
      backendStatus === "LIVE" 
        ? "bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/30" 
        : backendStatus === "OFFLINE"
        ? "bg-red-500/10 text-red-500 ring-1 ring-red-500/30"
        : "bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-white/5 dark:text-[#94A3B8] dark:ring-white/10"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        backendStatus === "LIVE" ? "animate-pulse bg-emerald-500" : backendStatus === "OFFLINE" ? "bg-red-500" : "bg-slate-400 dark:bg-white/30"
      }`} />
      {backendStatus}
    </div>
  );

  return (
    <div className="landing-page min-h-screen overflow-x-hidden">
      <div className="landing-blob landing-blob-a" />
      <div className="landing-blob landing-blob-b" />

      <header className="landing-header-bar relative z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 ring-1 ring-blue-400/30">
              <Shield className="landing-accent h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide">SecureCam</p>
              <p className="landing-muted text-[10px] uppercase tracking-[0.2em]">Zero-Trust Surveillance</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <StatusBadge />
            <ThemeToggle />
            <Button asChild className="landing-cta-primary h-10 px-5">
              <Link to="/login">Access Secure Console</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-2 lg:items-center lg:pt-24">
          <div className="landing-fade-in space-y-8">
            <div className="landing-accent inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-1.5 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              Enterprise-grade zero-trust access
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Zero-Trust
              <span className="block bg-gradient-to-r from-[#3B82F6] via-[#22D3EE] to-[#818CF8] bg-clip-text text-transparent">
                Surveillance Access
              </span>
            </h1>
            <p className="landing-muted max-w-xl text-lg leading-relaxed">
              PAKE-authenticated camera access with capability tokens, replay protection, audit trails, and time-bound permissions.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col gap-2">
                <Button asChild size="lg" className="landing-cta-primary h-12 px-8 text-base">
                  <Link to="/login">
                    Access Secure Console
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
               
              </div>
              <Button size="lg" variant="outline" className="landing-cta-secondary h-12 px-8 text-base" onClick={scrollToWorkflow}>
                View Security Flow
              </Button>
            </div>
          </div>

          <div className="landing-fade-in landing-delay-1">
            <div className="glass-card glow-border p-6 sm:p-8">
              <p className="landing-muted mb-6 text-xs font-semibold uppercase tracking-[0.25em]">Live security pipeline</p>
              <div className="space-y-3">
                {flowSteps.map((step, i) => (
                  <div key={step} className="flex items-center gap-4">
                    <div className="landing-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-bold ring-1 ring-blue-400/25">
                      {i + 1}
                    </div>
                    <div className="landing-panel flex-1 rounded-lg px-4 py-3 text-sm font-medium">
                      {step}
                    </div>
                    {i < flowSteps.length - 1 && (
                      <ChevronRight className="landing-subtle hidden h-4 w-4 sm:block" />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#22C55E]" />
                Enforcement active — capability required for assigned feeds
              </div>
            </div>
          </div>
        </section>

        {/* Trust row */}
        <section className="mx-auto max-w-7xl px-6 pb-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trustFeatures.map(({ icon: Icon, label, desc }, i) => (
              <div key={label} className={`glass-card landing-card-hover landing-fade-in landing-delay-${i + 1} p-5`}>
                <Icon className="landing-accent mb-3 h-5 w-5" />
                <p className="font-semibold">{label}</p>
                <p className="landing-muted mt-1 text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold">Built for defensible access</h2>
            <p className="landing-muted mt-3">Every layer separates identity, authorization, and viewing permission.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featureCards.map((card) => (
              <div key={card.title} className="glass-card landing-card-hover p-6">
                <Lock className="landing-accent-blue mb-3 h-4 w-4" />
                <h3 className="font-semibold">{card.title}</h3>
                <p className="landing-muted mt-2 text-sm leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Workflow */}
        <section id="workflow" className="mx-auto max-w-7xl px-6 py-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold">End-to-end security workflow</h2>
            <p className="landing-muted mt-3">From authentication to camera unlock — no shortcuts.</p>
          </div>
          <div className="glass-card glow-border p-6 sm:p-10">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {workflow.map((step, i) => (
                <div key={step} className="landing-panel landing-card-hover relative rounded-xl p-4">
                  <span className="landing-subtle text-[10px] font-bold uppercase tracking-widest">Step {i + 1}</span>
                  <p className="mt-2 text-sm font-medium leading-snug">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Roles */}
        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold">Role-aware access</h2>
            <p className="landing-muted mt-3">Each persona sees only what their assignment allows.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {roles.map((role) => (
              <div key={role.title} className={`glass-card landing-card-hover overflow-hidden`}>
                <div className={`bg-gradient-to-br ${role.accent} px-6 py-5`}>
                  <UserCheck className="landing-accent h-5 w-5" />
                  <h3 className="mt-2 text-xl font-bold">{role.title}</h3>
                </div>
                <ul className="landing-muted space-y-3 px-6 py-5 text-sm">
                  {role.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <KeyRound className="landing-accent-blue mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-6 pb-24 pt-8">
          <div className="glass-card glow-border relative overflow-hidden px-8 py-14 text-center">
            <div className="landing-blob landing-blob-c absolute -right-20 -top-20 opacity-40" />
            <h2 className="relative text-3xl font-bold sm:text-4xl">Ready to enter the secure console?</h2>
            <p className="landing-muted relative mx-auto mt-4 max-w-lg">
              Authenticate with PAKE, request access, and view cameras only after capability validation.
            </p>
            <Button asChild size="lg" className="landing-cta-primary relative mt-8 h-12 px-10 text-base">
              <Link to="/login">
                Enter SecureCam Console
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="landing-divider landing-subtle relative z-10 border-t px-6 py-8 text-center text-xs">
        SecureCam · Zero-Trust Smart Surveillance Access System · PAKE + Capability Tokens
      </footer>
    </div>
  );
};

export default LandingPage;
