import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import {
  createAssignment as createAssignmentApi,
  deleteAssignment,
  fetchAssignments,
  fetchCameras,
  fetchMe,
  loginRequest,
  setAuthToken,
} from "@/lib/api";

export type Role = "admin" | "viewer";

export interface User {
  id: number;
  username: string;
  role: Role;
}

export interface Camera {
  id: number;
  name: string;
  status: "online" | "offline";
}

export interface Assignment {
  id: string;
  viewerId: number;
  viewerName: string;
  cameraIds: number[];
  expiresIn: number; // seconds
}

export const VIEWERS = [
  { id: 2, username: "viewer_a", name: "Viewer A" },
  { id: 3, username: "viewer_b", name: "Viewer B" },
  { id: 4, username: "viewer_c", name: "Viewer C" },
];

interface AppCtx {
  user: User | null;
  initialized: boolean;
  login: (username: string, password: string, role: Role) => Promise<boolean>;
  logout: () => void;
  cameras: Camera[];
  assignments: Assignment[];
  addAssignment: (a: Omit<Assignment, "id" | "expiresIn"> & { durationMinutes: number }) => Promise<boolean>;
  revokeAssignment: (id: string) => Promise<boolean>;
  myAssignments: Assignment[];
}

const Ctx = createContext<AppCtx | null>(null);
const TOKEN_KEY = "securecam_token";

const prettyViewerName = (name: string) => {
  const fromSeed = VIEWERS.find((v) => v.username.toLowerCase() === name.toLowerCase());
  return fromSeed?.name ?? name;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Tick down every second so timers remain live without requiring a poll loop.
  useEffect(() => {
    const t = setInterval(() => {
      setAssignments((prev) =>
        prev
          .map((a) => ({ ...a, expiresIn: Math.max(0, a.expiresIn - 1) }))
          .filter((a) => a.expiresIn > 0)
      );
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const syncDashboardData = async () => {
    const [cameraData, assignmentData] = await Promise.all([fetchCameras(), fetchAssignments()]);
    setCameras(cameraData);
    setAssignments(
      assignmentData
        .map((a) => ({
          id: a.id,
          viewerId: a.viewer_id,
          viewerName: prettyViewerName(a.viewer_name),
          cameraIds: a.camera_ids,
          expiresIn: a.expires_in,
        }))
        .filter((a) => a.expiresIn > 0)
    );
  };

  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setInitialized(true);
        return;
      }

      try {
        setAuthToken(token);
        const me = await fetchMe();
        setUser(me);
        await syncDashboardData();
      } catch {
        setAuthToken(null);
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      } finally {
        setInitialized(true);
      }
    };

    void restoreSession();
  }, []);

  const login: AppCtx["login"] = async (username, password, role) => {
    if (!username || !password) return false;
    try {
      const { access_token, user: loggedInUser } = await loginRequest({ username, password, role });
      localStorage.setItem(TOKEN_KEY, access_token);
      setAuthToken(access_token);
      setUser(loggedInUser);
      await syncDashboardData();
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
    setAssignments([]);
    setCameras([]);
  };

  const addAssignment: AppCtx["addAssignment"] = async (a) => {
    try {
      await createAssignmentApi({
        viewer_id: a.viewerId,
        camera_ids: a.cameraIds,
        duration_minutes: a.durationMinutes,
      });
      await syncDashboardData();
      return true;
    } catch {
      return false;
    }
  };

  const revokeAssignment: AppCtx["revokeAssignment"] = async (id) => {
    try {
      await deleteAssignment(id);
      await syncDashboardData();
      return true;
    } catch {
      return false;
    }
  };

  const myAssignments = useMemo(() =>
    user?.role === "viewer"
      ? assignments.filter((a) => a.viewerId === user.id)
      : [],
    [assignments, user]
  );

  return (
    <Ctx.Provider
      value={{ user, initialized, login, logout, cameras, assignments, addAssignment, revokeAssignment, myAssignments }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp must be used within AppProvider");
  return c;
};

export const formatTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m} min${s > 0 ? ` ${s}s` : ""} remaining`;
  return `${s}s remaining`;
};
