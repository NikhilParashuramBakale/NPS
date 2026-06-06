import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useApp } from "@/context/AppContext";
import Index from "./pages/Index.tsx";
import AdminDashboard from "./pages/AdminDashboard.tsx";
import ViewerDashboard from "./pages/ViewerDashboard.tsx";
import NotFound from "./pages/NotFound.tsx";
import SecurityDashboard from "./pages/SecurityDashboard.tsx";
import AuditLogs from "./pages/AuditLogs.tsx";
import SecurityEvents from "./pages/SecurityEvents.tsx";
import RequestHistory from "./pages/RequestHistory.tsx";

const queryClient = new QueryClient();

const residentRoles = ["viewer", "resident", "security_guard"] as const;

const Protected = ({ role, children }: { role: "admin" | "resident" | "security_guard"; children: JSX.Element }) => {
  const { user, initialized } = useApp();
  if (!initialized) return null;
  if (!user) return <Navigate to="/" replace />;
  const ok = role === "resident" ? residentRoles.includes(user.role as "viewer" | "resident" | "security_guard") : user.role === role;
  if (!ok) return <Navigate to={user.role === "admin" ? "/admin" : "/viewer"} replace />;
  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
            <Route path="/viewer" element={<Protected role="resident"><ViewerDashboard /></Protected>} />
            <Route path="/security-dashboard" element={<Protected role="admin"><SecurityDashboard /></Protected>} />
            <Route path="/audit-logs" element={<Protected role="admin"><AuditLogs /></Protected>} />
            <Route path="/security-events" element={<Protected role="admin"><SecurityEvents /></Protected>} />
            <Route path="/requests" element={<Protected role="resident"><RequestHistory /></Protected>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
