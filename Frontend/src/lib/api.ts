import type { Role, User } from "@/context/AppContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

type LoginPayload = {
  username: string;
  password: string;
  role: Role;
};

type LoginResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type ApiCamera = {
  id: number;
  name: string;
  status: "online" | "offline";
};

export type ApiAssignment = {
  id: string;
  viewer_id: number;
  viewer_name: string;
  camera_ids: number[];
  expires_in: number;
  expires_at: string;
};

export type SecurityEvent = {
  id: string;
  event_type: string;
  actor_username: string | null;
  target_username: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

type CreateAssignmentPayload = {
  viewer_id: number;
  camera_ids: number[];
  duration_minutes: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set("Content-Type", "application/json");
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
}

export const loginRequest = (payload: LoginPayload) =>
  request<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchMe = () => request<User>("/api/v1/auth/me");

export const fetchCameras = () => request<ApiCamera[]>("/api/v1/cameras");

export const fetchAssignments = () => request<ApiAssignment[]>("/api/v1/assignments");

export const createAssignment = (payload: CreateAssignmentPayload) =>
  request<ApiAssignment>("/api/v1/assignments", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const deleteAssignment = (assignmentId: string) =>
  request<{ status: string; assignment_id: string }>(`/api/v1/assignments/${assignmentId}`, {
    method: "DELETE",
  });

export const fetchSecurityEvents = () => request<SecurityEvent[]>("/api/v1/security/events");
