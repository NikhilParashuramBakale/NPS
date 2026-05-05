import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import {
  createAssignment as createAssignmentApi,
  createUser as createUserApi,
  deleteAssignment,
  fetchAssignments,
  fetchCameras,
  fetchMe,
  fetchUsers,
  pakeFinishRequest,
  pakeStartRequest,
  pakeUpgradeRequest,
  setAuthToken,
} from "@/lib/api";
import { buildPakeClient } from "@/lib/pake";

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

interface AppCtx {
  user: User | null;
  initialized: boolean;
  login: (username: string, password: string, role: Role) => Promise<boolean>;
  logout: () => void;
  cameras: Camera[];
  assignments: Assignment[];
  viewers: User[];
  addAssignment: (a: Omit<Assignment, "id" | "expiresIn"> & { durationMinutes: number }) => Promise<boolean>;
  revokeAssignment: (id: string) => Promise<boolean>;
  createUser: (payload: { username: string; password: string; role: Role }) => Promise<boolean>;
  myAssignments: Assignment[];
}

const Ctx = createContext<AppCtx | null>(null);
const TOKEN_KEY = "securecam_token";

const prettyViewerName = (name: string, viewers: User[]) => {
  const fromList = viewers.find((v) => v.username.toLowerCase() === name.toLowerCase());
  return fromList?.username ?? name;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [viewers, setViewers] = useState<User[]>([]);

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

  const syncDashboardData = async (role?: Role) => {
    const [cameraData, assignmentData] = await Promise.all([fetchCameras(), fetchAssignments()]);
    setCameras(cameraData);
    const viewerData = role === "admin" ? await fetchUsers("viewer") : [];
    setViewers(viewerData);
    setAssignments(
      assignmentData
        .map((a) => ({
          id: a.id,
          viewerId: a.viewer_id,
          viewerName: prettyViewerName(a.viewer_name, viewerData),
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
        await syncDashboardData(me.role);
      } catch {
        setAuthToken(null);
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
        setViewers([]);
      } finally {
        setInitialized(true);
      }
    };

    void restoreSession();
  }, []);

  const login: AppCtx["login"] = async (username, password, role) => {
    if (!username || !password) return false;
    try {
      const start = await pakeStartRequest({ username, role });
      const { clientMsg, confirmA, verify } = await buildPakeClient(
        {
          username,
          server_id: start.server_id,
          salt: start.salt,
          server_msg: start.server_msg,
          mhf: start.mhf,
          kdf_aad: start.kdf_aad,
        },
        password
      );
      const finish = await pakeFinishRequest({
        session_id: start.session_id,
        client_msg: clientMsg,
        confirm_a: confirmA,
      });
      verify(finish.confirm_b);
      const { access_token, user: loggedInUser } = finish;
      localStorage.setItem(TOKEN_KEY, access_token);
      setAuthToken(access_token);
      setUser(loggedInUser);
      await syncDashboardData(loggedInUser.role);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("PAKE verifier missing")) {
        try {
          await pakeUpgradeRequest({ username, password, role });
          const retryStart = await pakeStartRequest({ username, role });
          const { clientMsg, confirmA, verify } = await buildPakeClient(
            {
              username,
              server_id: retryStart.server_id,
              salt: retryStart.salt,
              server_msg: retryStart.server_msg,
              mhf: retryStart.mhf,
              kdf_aad: retryStart.kdf_aad,
            },
            password
          );
          const finish = await pakeFinishRequest({
            session_id: retryStart.session_id,
            client_msg: clientMsg,
            confirm_a: confirmA,
          });
          verify(finish.confirm_b);
          const { access_token, user: loggedInUser } = finish;
          localStorage.setItem(TOKEN_KEY, access_token);
          setAuthToken(access_token);
          setUser(loggedInUser);
          await syncDashboardData(loggedInUser.role);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
    setAssignments([]);
    setCameras([]);
    setViewers([]);
  };

  const addAssignment: AppCtx["addAssignment"] = async (a) => {
    try {
      await createAssignmentApi({
        viewer_id: a.viewerId,
        camera_ids: a.cameraIds,
        duration_minutes: a.durationMinutes,
      });
      await syncDashboardData(user?.role);
      return true;
    } catch {
      return false;
    }
  };

  const revokeAssignment: AppCtx["revokeAssignment"] = async (id) => {
    try {
      await deleteAssignment(id);
      await syncDashboardData(user?.role);
      return true;
    } catch {
      return false;
    }
  };

  const createUser: AppCtx["createUser"] = async (payload) => {
    try {
      await createUserApi(payload);
      await syncDashboardData(user?.role);
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
      value={{
        user,
        initialized,
        login,
        logout,
        cameras,
        assignments,
        viewers,
        addAssignment,
        revokeAssignment,
        createUser,
        myAssignments,
      }}
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
