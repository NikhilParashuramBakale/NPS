import { ReactNode } from "react";
import { Maximize2, Video, VideoOff } from "lucide-react";

interface Props {
  name: string;
  status?: "online" | "offline";
  variant?: "card" | "expanded";
  preview?: ReactNode;
  onExpand?: () => void;
}

const variantClasses = {
  card: "aspect-video min-h-[260px] sm:min-h-[300px] lg:min-h-[320px] w-full",
  expanded: "aspect-video min-h-[360px] sm:min-h-[420px] lg:min-h-[480px] max-h-[72vh] w-full",
};

export const CameraTile = ({
  name,
  status = "online",
  variant = "card",
  preview = null,
  onExpand,
}: Props) => {
  const offline = status === "offline";
  const showPreview = !offline && Boolean(preview);

  return (
    <div
      className={`camera-tile relative ${variantClasses[variant]} overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 shadow-lg`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.1),transparent_70%)]" />

      {showPreview ? (
        <div className="absolute inset-0">{preview}</div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          {offline ? <VideoOff className="h-12 w-12 opacity-60" /> : <Video className="h-12 w-12 opacity-60" />}
          <span className="text-sm font-medium">{offline ? "Stream Offline" : "Awaiting Feed"}</span>
        </div>
      )}

      <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1 text-xs backdrop-blur-md">
        {!offline && <span className="h-2 w-2 rounded-full bg-success animate-pulse" />}
        <span className="font-medium text-[#F8FAFC]">{name}</span>
      </div>

      {onExpand && (
        <button
          type="button"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-[#94A3B8] backdrop-blur-md transition hover:border-cyan-400/40 hover:text-[#22D3EE]"
          onClick={onExpand}
          aria-label="Expand camera"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}

      {!offline && (
        <div className="absolute bottom-3 right-3 z-10 rounded-md bg-destructive/90 px-2 py-0.5 text-[10px] font-bold tracking-wider text-destructive-foreground shadow-sm">
          ● REC
        </div>
      )}
    </div>
  );
};
