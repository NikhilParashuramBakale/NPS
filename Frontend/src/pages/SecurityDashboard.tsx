import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ClipboardList, History, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchSecurityDashboard, type SecurityDashboard as SecurityDashboardData } from "@/lib/api";

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-md border border-border bg-card p-4">
    <div className="text-2xl font-semibold">{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

const SecurityDashboard = () => {
  const [data, setData] = useState<SecurityDashboardData | null>(null);

  useEffect(() => {
    void fetchSecurityDashboard().then(setData);
  }, []);

  return (
    <div className="min-h-screen bg-secondary/10 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Security Dashboard</h1>
            <Badge variant="secondary">Protected</Badge>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/audit-logs"><History className="h-4 w-4 mr-1" />Audit Logs</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/security-events"><AlertTriangle className="h-4 w-4 mr-1" />Events</Link></Button>
            <Button asChild size="sm"><Link to="/admin">Admin</Link></Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Authentication Success" value={data?.authentication_success_count ?? 0} />
          <Stat label="Authentication Failure" value={data?.authentication_failure_count ?? 0} />
          <Stat label="Pending Requests" value={data?.pending_requests ?? 0} />
          <Stat label="Expired Assignments" value={data?.expired_assignments ?? 0} />
          <Stat label="Approved Requests" value={data?.approved_requests ?? 0} />
          <Stat label="Rejected Requests" value={data?.rejected_requests ?? 0} />
          <Stat label="Revoked Assignments" value={data?.revoked_assignments ?? 0} />
          <Stat label="Recent Events" value={data?.recent_security_events.length ?? 0} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="rounded-md border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-primary" /> Recent Security Events
            </div>
            <div className="space-y-2">
              {(data?.recent_security_events ?? []).map((event) => (
                <div key={event.id} className="rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{event.event_type}</span>
                    <Badge variant={event.severity === "critical" || event.severity === "high" ? "destructive" : "secondary"}>
                      {event.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{event.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <ClipboardList className="h-4 w-4 text-primary" /> Recent Audit Logs
            </div>
            <div className="space-y-2">
              {(data?.recent_audit_logs ?? []).map((log) => (
                <div key={log.id} className="rounded-md border border-border/60 p-3">
                  <div className="text-sm font-medium">{log.event_type}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{log.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SecurityDashboard;
