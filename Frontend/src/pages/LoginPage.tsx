import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shield, ArrowLeft } from "lucide-react";
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

      <header className="relative z-20 border-b border-white/10 bg-[#060B14]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 ring-1 ring-blue-400/30">
              <Shield className="h-5 w-5 text-[#22D3EE]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F8FAFC]">SecureCam</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#94A3B8]">Secure Console</p>
            </div>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-[#94A3B8] transition-colors hover:text-[#F8FAFC]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </header>

      <Login />
    </div>
  );
};

export default LoginPage;
