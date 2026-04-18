import { createContext, useContext, useEffect, useState, ReactNode } from "react";

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
  login: (username: string, password: string, role: Role) => boolean;
  logout: () => void;
  cameras: Camera[];
  assignments: Assignment[];
  addAssignment: (a: Omit<Assignment, "id">) => void;
  revokeAssignment: (id: string) => void;
  myAssignments: Assignment[];
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [cameras] = useState<Camera[]>([
    { id: 1, name: "Camera 1", status: "online" },
    { id: 2, name: "Camera 2", status: "online" },
    { id: 3, name: "Camera 3", status: "offline" },
    { id: 4, name: "Camera 4", status: "online" },
  ]);
  const [assignments, setAssignments] = useState<Assignment[]>([
    { id: "a1", viewerId: 2, viewerName: "Viewer A", cameraIds: [1], expiresIn: 480 },
  ]);

  // Tick down every second
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

  const login: AppCtx["login"] = (username, password, role) => {
    if (!username || !password) return false;
    if (password.length < 3) return false;
    setUser({
      id: role === "admin" ? 1 : VIEWERS.find((v) => v.username === username)?.id ?? 2,
      username,
      role,
    });
    return true;
  };

  const logout = () => setUser(null);

  const addAssignment: AppCtx["addAssignment"] = (a) =>
    setAssignments((prev) => [...prev, { ...a, id: crypto.randomUUID() }]);

  const revokeAssignment = (id: string) =>
    setAssignments((prev) => prev.filter((a) => a.id !== id));

  const myAssignments =
    user?.role === "viewer"
      ? assignments.filter(
          (a) =>
            a.viewerName.toLowerCase().replace(" ", "_") === user.username.toLowerCase() ||
            a.viewerId === user.id
        )
      : [];

  return (
    <Ctx.Provider
      value={{ user, login, logout, cameras, assignments, addAssignment, revokeAssignment, myAssignments }}
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
