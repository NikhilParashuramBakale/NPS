import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchAuditLogs, type AuditLog } from "@/lib/api";

const AuditLogs = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    void fetchAuditLogs().then(setLogs);
  }, []);

  return (
    <div className="min-h-screen bg-secondary/10 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Audit Logs</h1>
            <Badge variant="secondary">Auditability</Badge>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/security-dashboard"><ArrowLeft className="h-4 w-4 mr-1" />Dashboard</Link></Button>
        </div>
        <div className="rounded-md border border-border bg-card">
          {logs.map((log) => (
            <div key={log.id} className="border-b border-border px-4 py-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{log.event_type}</span>
                <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{log.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;
