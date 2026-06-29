import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shield, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useApp } from "@/context/AppContext";
import Login from "./Login";

const LoginPage = () => {
  const { user, initialized } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!initialized || !user) return;
    if (user.role === "admin") navigate("/admin", { replace: true });
    else navigate("/viewer", { replace: true });
  }, [user, initialized, navigate]);

  if (!initialized) return null;

  return (
    <div className="landing-page min-h-screen">
      <div className="landing-blob landing-blob-a" />
      <div className="landing-blob landing-blob-b" />

      <header className="landing-header-bar relative z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 ring-1 ring-blue-400/30">
              <Shield className="landing-accent h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">SecureCam</p>
              <p className="landing-muted text-[10px] uppercase tracking-[0.2em]">Secure Console</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/"
              className="landing-muted flex items-center gap-1.5 text-sm transition-colors hover:opacity-80"
            >
            <ArrowLeft className="h-4 w-4" />
            Back to home
            </Link>
          </div>
        </div>
      </header>

      <Login />
    </div>
  );
};

export default LoginPage;
