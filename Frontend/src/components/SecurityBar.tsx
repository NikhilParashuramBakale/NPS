import { Lock, KeyRound, ShieldCheck } from "lucide-react";

export const SecurityBar = () => {
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
      <div className="ml-auto text-muted-foreground hidden sm:block">
        Secure Camera Access System
      </div>
    </div>
  );
};
