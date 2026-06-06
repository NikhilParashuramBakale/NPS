import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchSecurityEvents, type SecurityEvent } from "@/lib/api";

const SecurityEvents = () => {
  const [events, setEvents] = useState<SecurityEvent[]>([]);

  useEffect(() => {
    void fetchSecurityEvents().then(setEvents);
  }, []);

  return (
    <div className="min-h-screen bg-secondary/10 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Security Events</h1>
            <Badge variant="secondary">Security Alert</Badge>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/security-dashboard"><ArrowLeft className="h-4 w-4 mr-1" />Dashboard</Link></Button>
        </div>
        <div className="rounded-md border border-border bg-card">
          {events.map((event) => (
            <div key={event.id} className="border-b border-border px-4 py-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{event.event_type}</span>
                  <Badge variant={event.severity === "critical" || event.severity === "high" ? "destructive" : "secondary"}>
                    {event.severity}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SecurityEvents;
