import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import {
  createAssignment as createAssignmentApi,
  createViewerCamera as createViewerCameraApi,
  createUser as createUserApi,
  deleteAssignment,
  fetchAssignments,
  fetchCameras,
  fetchMe,
  fetchUsers,
  pakeFinishRequest,
  pakeStartRequest,
  pakeUpgradeRequest,
  requestCameraShare as requestCameraShareApi,
  setAuthToken,
  updateCameraAccess as updateCameraAccessApi,
  updateCameraSource as updateCameraSourceApi,
  updateViewerCamera as updateViewerCameraApi,
} from "@/lib/api";
import { buildPakeClient } from "@/lib/pake";

export type Role = "admin" | "viewer" | "resident" | "security_guard";

export interface User {
  id: number;
  username: string;
  role: Role;
}

export interface Camera {
  id: number;
  name: string;
  location: string;
  status: "online" | "offline";
  source_type: "unconfigured" | "ip_mjpeg" | "admin_local" | "viewer_local";
  source_url: string | null;
  owner_id: number | null;
  is_active: boolean;
  share_requested: boolean;
  share_approved: boolean;
}

export interface Assignment {
  id: string;
  viewerId: number;
  viewerName: string;
  cameraIds: number[];
  expiresIn: number; // seconds
  status: string;
}

export type PakeStepData = {
  step: number;
  data?: Record<string, string>;
};

interface AppCtx {
  user: User | null;
  initialized: boolean;
  login: (username: string, password: string, role: Role, onPakeStep?: (data: PakeStepData) => void | Promise<void>) => Promise<boolean>;
  logout: () => void;
  cameras: Camera[];
  assignments: Assignment[];
  viewers: User[];
  addAssignment: (a: Omit<Assignment, "id" | "expiresIn" | "status"> & { durationMinutes: number }) => Promise<boolean>;
  revokeAssignment: (id: string) => Promise<boolean>;
  createUser: (payload: { username: string; password: string; role: Role }) => Promise<boolean>;
  updateCameraSource: (cameraId: number, payload: { source_type: Camera["source_type"]; source_url: string | null }) => Promise<boolean>;
  updateCameraAccess: (cameraId: number, payload: { is_active?: boolean; share_approved?: boolean; clear_share_request?: boolean }) => Promise<boolean>;
  createViewerCamera: (payload: { name: string; source_type: "ip_mjpeg" | "viewer_local"; source_url: string | null; request_share: boolean }) => Promise<boolean>;
  updateViewerCamera: (cameraId: number, payload: { source_type: "ip_mjpeg" | "viewer_local"; source_url: string | null }) => Promise<boolean>;
  requestCameraShare: (cameraId: number) => Promise<boolean>;
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
    const viewerData = role === "admin" ? [...await fetchUsers("viewer"), ...await fetchUsers("resident"), ...await fetchUsers("security_guard")] : [];
    setViewers(viewerData);
    setAssignments(
      assignmentData
        .map((a) => ({
          id: a.id,
          viewerId: a.viewer_id,
          viewerName: prettyViewerName(a.viewer_name, viewerData),
          cameraIds: a.camera_ids,
          expiresIn: a.expires_in,
          status: a.status,
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

  const performPakeHandshake = async (username: string, password: string, role: Role, onPakeStep?: (data: PakeStepData) => void | Promise<void>) => {
    await onPakeStep?.({ step: 1 });
    const start = await pakeStartRequest({ username, role });
    
    await onPakeStep?.({ 
      step: 2, 
      data: { 
        salt: start.salt.substring(0, 16) + "...", 
        serverMsg: start.server_msg.substring(0, 16) + "..." 
      } 
    });

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

    await onPakeStep?.({ 
      step: 3, 
      data: { 
        clientMsg: clientMsg.substring(0, 16) + "..." 
      } 
    });
    
    await onPakeStep?.({ 
      step: 4, 
      data: { 
        confirmA: confirmA.substring(0, 16) + "..." 
      } 
    });

    const finish = await pakeFinishRequest({
      session_id: start.session_id,
      client_msg: clientMsg,
      confirm_a: confirmA,
    });
    
    verify(finish.confirm_b);
    
    await onPakeStep?.({ 
      step: 5, 
      data: { 
        confirmB: finish.confirm_b.substring(0, 16) + "..." 
      } 
    });

    return finish;
  };

  const login: AppCtx["login"] = async (username, password, role, onPakeStep) => {
    if (!username || !password) return false;
    try {
      const finish = await performPakeHandshake(username, password, role, onPakeStep);
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
          const finish = await performPakeHandshake(username, password, role, onPakeStep);
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

  const updateCameraSource: AppCtx["updateCameraSource"] = async (cameraId, payload) => {
    try {
      await updateCameraSourceApi(cameraId, payload);
      await syncDashboardData(user?.role);
      return true;
    } catch {
      return false;
    }
  };

  const updateCameraAccess: AppCtx["updateCameraAccess"] = async (cameraId, payload) => {
    try {
      await updateCameraAccessApi(cameraId, payload);
      await syncDashboardData(user?.role);
      return true;
    } catch {
      return false;
    }
  };

  const createViewerCamera: AppCtx["createViewerCamera"] = async (payload) => {
    try {
      await createViewerCameraApi(payload);
      await syncDashboardData(user?.role);
      return true;
    } catch {
      return false;
    }
  };

  const updateViewerCamera: AppCtx["updateViewerCamera"] = async (cameraId, payload) => {
    try {
      await updateViewerCameraApi(cameraId, payload);
      await syncDashboardData(user?.role);
      return true;
    } catch {
      return false;
    }
  };

  const requestCameraShare: AppCtx["requestCameraShare"] = async (cameraId) => {
    try {
      await requestCameraShareApi(cameraId);
      await syncDashboardData(user?.role);
      return true;
    } catch {
      return false;
    }
  };

  const myAssignments = useMemo(() =>
    user?.role === "viewer" || user?.role === "resident"
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
        updateCameraSource,
        updateCameraAccess,
        createViewerCamera,
        updateViewerCamera,
        requestCameraShare,
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
