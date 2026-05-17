import { ReactNode } from "react";
import { Maximize2, Video, VideoOff } from "lucide-react";

interface Props {
  name: string;
  status?: "online" | "offline";
  height?: string;
  preview?: ReactNode;
  onExpand?: () => void;
}

export const CameraTile = ({ name, status = "online", height = "h-48", preview = null, onExpand }: Props) => {
  const offline = status === "offline";
  const showPreview = !offline && Boolean(preview);
  return (
    <div
      className={`relative ${height} w-full overflow-hidden rounded-lg border border-border bg-gradient-to-br from-secondary to-background flex items-center justify-center`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.08),transparent_70%)]" />
      {showPreview ? (
        preview
      ) : (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          {offline ? <VideoOff className="h-10 w-10" /> : <Video className="h-10 w-10" />}
          <span className="text-sm">{offline ? "Stream Offline" : "Live Feed"}</span>
        </div>
      )}
      <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-background/70 px-2 py-1 text-xs backdrop-blur">
        <span
          className={`h-2 w-2 rounded-full ${offline ? "bg-destructive" : "bg-success animate-pulse"}`}
        />
        <span className="font-medium">{name}</span>
      </div>
      {onExpand && (
        <button
          type="button"
          className="absolute right-2 top-2 rounded bg-background/80 p-1 text-muted-foreground backdrop-blur transition hover:text-foreground"
          onClick={onExpand}
          aria-label="Expand camera"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}
      {!offline && (
        <div className="absolute right-2 top-9 rounded bg-destructive/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-destructive-foreground">
          ● REC
        </div>
      )}
    </div>
  );
};
