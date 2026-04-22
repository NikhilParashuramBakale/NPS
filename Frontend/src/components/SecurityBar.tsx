import { useEffect, useState } from "react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { fetchSecurityEvents, type SecurityEvent } from "@/lib/api";

export const SecurityBar = () => {
  const [events, setEvents] = useState<SecurityEvent[]>([]);

  useEffect(() => {
    let active = true;

    const loadEvents = async () => {
      try {
        const nextEvents = await fetchSecurityEvents();
        if (active) {
          setEvents(nextEvents.slice(0, 3));
        }
      } catch {
        if (active) {
          setEvents([]);
        }
      }
    };

    void loadEvents();
    const timer = window.setInterval(() => {
      void loadEvents();
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const latestEvent = events[0];

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card/60 px-4 py-2 text-xs">
      <div className="flex items-center gap-1.5 text-success">
        <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
        <Lock className="h-3.5 w-3.5" />
        <span className="font-medium">Encryption: ON</span>
      </div>
      <div className="flex items-center gap-1.5 text-success">
        <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
        <KeyRound className="h-3.5 w-3.5" />
        <span className="font-medium">Session Key: Active</span>
      </div>
      <div className="flex items-center gap-1.5 text-success">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span className="font-medium">TLS 1.3</span>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2 text-muted-foreground hidden sm:flex">
        <span className="rounded-full border border-border bg-background/60 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground/70">
          Live audit
        </span>
        <span className="max-w-[24rem] truncate">
          {latestEvent
            ? `${latestEvent.event_type.replace(/_/g, " ")} · ${latestEvent.actor_username ?? "system"}`
            : "Secure Camera Access System"}
        </span>
      </div>
    </div>
  );
};
