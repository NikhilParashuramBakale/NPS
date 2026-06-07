import { useEffect } from "react";
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
import { useApp } from "@/context/AppContext";

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

  useEffect(() => {
    if (!initialized || !user) return;
    if (user.role === "admin") navigate("/admin", { replace: true });
    else navigate("/viewer", { replace: true });
  }, [user, initialized, navigate]);

  const scrollToWorkflow = () => {
    document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth" });
  };

  if (!initialized) return null;

  return (
    <div className="landing-page min-h-screen text-[#F8FAFC] overflow-x-hidden">
      <div className="landing-blob landing-blob-a" />
      <div className="landing-blob landing-blob-b" />

      <header className="relative z-20 border-b border-white/10 bg-[#060B14]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 ring-1 ring-blue-400/30">
              <Shield className="h-5 w-5 text-[#22D3EE]" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide">SecureCam</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#94A3B8]">Zero-Trust Surveillance</p>
            </div>
          </div>
          <Button asChild className="landing-cta-primary h-10 px-5">
            <Link to="/login">Access Secure Console</Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-2 lg:items-center lg:pt-24">
          <div className="landing-fade-in space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-1.5 text-xs font-medium text-[#22D3EE]">
              <Sparkles className="h-3.5 w-3.5" />
              Enterprise-grade zero-trust access
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Zero-Trust
              <span className="block bg-gradient-to-r from-[#3B82F6] via-[#22D3EE] to-[#818CF8] bg-clip-text text-transparent">
                Surveillance Access
              </span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-[#94A3B8]">
              PAKE-authenticated camera access with capability tokens, replay protection, audit trails, and time-bound permissions.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button asChild size="lg" className="landing-cta-primary h-12 px-8 text-base">
                <Link to="/login">
                  Access Secure Console
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="landing-cta-secondary h-12 px-8 text-base" onClick={scrollToWorkflow}>
                View Security Flow
              </Button>
            </div>
          </div>

          <div className="landing-fade-in landing-delay-1">
            <div className="glass-card glow-border p-6 sm:p-8">
              <p className="mb-6 text-xs font-semibold uppercase tracking-[0.25em] text-[#94A3B8]">Live security pipeline</p>
              <div className="space-y-3">
                {flowSteps.map((step, i) => (
                  <div key={step} className="flex items-center gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-bold text-[#22D3EE] ring-1 ring-blue-400/25">
                      {i + 1}
                    </div>
                    <div className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium">
                      {step}
                    </div>
                    {i < flowSteps.length - 1 && (
                      <ChevronRight className="hidden h-4 w-4 text-[#64748B] sm:block" />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
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
                <Icon className="mb-3 h-5 w-5 text-[#22D3EE]" />
                <p className="font-semibold">{label}</p>
                <p className="mt-1 text-sm text-[#94A3B8]">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold">Built for defensible access</h2>
            <p className="mt-3 text-[#94A3B8]">Every layer separates identity, authorization, and viewing permission.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featureCards.map((card) => (
              <div key={card.title} className="glass-card landing-card-hover p-6">
                <Lock className="mb-3 h-4 w-4 text-[#3B82F6]" />
                <h3 className="font-semibold">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Workflow */}
        <section id="workflow" className="mx-auto max-w-7xl px-6 py-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold">End-to-end security workflow</h2>
            <p className="mt-3 text-[#94A3B8]">From authentication to camera unlock — no shortcuts.</p>
          </div>
          <div className="glass-card glow-border p-6 sm:p-10">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {workflow.map((step, i) => (
                <div key={step} className="relative rounded-xl border border-white/10 bg-white/[0.03] p-4 landing-card-hover">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Step {i + 1}</span>
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
            <p className="mt-3 text-[#94A3B8]">Each persona sees only what their assignment allows.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {roles.map((role) => (
              <div key={role.title} className={`glass-card landing-card-hover overflow-hidden`}>
                <div className={`bg-gradient-to-br ${role.accent} px-6 py-5`}>
                  <UserCheck className="h-5 w-5 text-[#22D3EE]" />
                  <h3 className="mt-2 text-xl font-bold">{role.title}</h3>
                </div>
                <ul className="space-y-3 px-6 py-5 text-sm text-[#94A3B8]">
                  {role.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3B82F6]" />
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
            <p className="relative mx-auto mt-4 max-w-lg text-[#94A3B8]">
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

      <footer className="relative z-10 border-t border-white/10 px-6 py-8 text-center text-xs text-[#64748B]">
        SecureCam · Zero-Trust Smart Surveillance Access System · PAKE + Capability Tokens
      </footer>
    </div>
  );
};

export default LandingPage;
