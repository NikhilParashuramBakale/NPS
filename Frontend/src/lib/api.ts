import type { Role, User } from "@/context/AppContext";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = () => authToken;

export const getCameraStreamUrl = (cameraId: number, sourceUrl?: string | null) => {
  const params = new URLSearchParams();
  if (authToken) params.append("token", authToken);
  if (sourceUrl) {
    let hash = 0;
    for (let i = 0; i < sourceUrl.length; i++) {
      hash = ((hash << 5) - hash) + sourceUrl.charCodeAt(i);
      hash |= 0;
    }
    params.append("t", Math.abs(hash).toString());
  }
  const qs = params.toString();
  return qs ? `${API_BASE_URL}/api/v1/cameras/${cameraId}/stream?${qs}` : `${API_BASE_URL}/api/v1/cameras/${cameraId}/stream`;
};

export const getCameraCapabilityStreamUrl = (cameraId: number, capabilityToken: string, sourceUrl?: string | null) => {
  const params = new URLSearchParams();
  if (authToken) params.append("token", authToken);
  params.append("capability_token", capabilityToken);
  if (sourceUrl) {
    let hash = 0;
    for (let i = 0; i < sourceUrl.length; i++) {
      hash = ((hash << 5) - hash) + sourceUrl.charCodeAt(i);
      hash |= 0;
    }
    params.append("t", Math.abs(hash).toString());
  }
  return `${API_BASE_URL}/api/v1/cameras/${cameraId}/stream?${params.toString()}`;
};

export const getCameraCapabilityFrameUrl = (cameraId: number, capabilityToken: string) => {
  const params = new URLSearchParams();
  if (authToken) params.append("token", authToken);
  params.append("capability_token", capabilityToken);
  return `${API_BASE_URL}/api/v1/cameras/${cameraId}/frame?${params.toString()}`;
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

type PakeStartPayload = {
  username: string;
  role: Role;
};

export type PakeStartResponse = {
  session_id: string;
  salt: string;
  server_msg: string;
  server_id: string;
  mhf: { n: number; r: number; p: number };
  kdf_aad: string;
};

type PakeFinishPayload = {
  session_id: string;
  client_msg: string;
  confirm_a: string;
};

export type PakeFinishResponse = {
  access_token: string;
  token_type: string;
  confirm_b: string;
  user: User;
};

type PakeUpgradePayload = {
  username: string;
  password: string;
  role: Role;
};

type PakeUpgradeResponse = {
  status: string;
};

export type ApiCamera = {
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
};

export type ApiAssignment = {
  id: string;
  viewer_id: number;
  viewer_name: string;
  camera_ids: number[];
  user_id: number | null;
  camera_id: number | null;
  status: string;
  expires_in: number;
  expires_at: string;
};

export type SecurityEvent = {
  id: string;
  event_type: string;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  description: string;
  actor_username: string | null;
  target_username: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type AuditLog = {
  id: string;
  event_type: string;
  actor_id: number | null;
  target_id: string | null;
  description: string;
  created_at: string;
};

export type AccessRequest = {
  id: number;
  requester_id: number;
  requester_name: string;
  camera_id: number;
  camera_name: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: number | null;
};

export type SecurityDashboard = {
  authentication_success_count: number;
  authentication_failure_count: number;
  pending_requests: number;
  approved_requests: number;
  rejected_requests: number;
  expired_assignments: number;
  revoked_assignments: number;
  recent_security_events: SecurityEvent[];
  recent_audit_logs: AuditLog[];
};

export type ApiUser = {
  id: number;
  username: string;
  role: Role;
};

type CreateAssignmentPayload = {
  viewer_id: number;
  camera_ids: number[];
  duration_minutes: number;
};

type CreateUserPayload = {
  username: string;
  password: string;
  role: Role;
};

type UpdateCameraPayload = {
  source_type: ApiCamera["source_type"];
  source_url: string | null;
};

type CreateCameraPayload = {
  name: string;
  location?: string;
  source_type: "ip_mjpeg" | "viewer_local";
  source_url: string | null;
  request_share: boolean;
};

type AdminCameraAccessPayload = {
  is_active?: boolean;
  share_approved?: boolean;
  clear_share_request?: boolean;
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

export const fetchHealth = () => request<{ status: string }>("/health");

export const loginRequest = (payload: LoginPayload) =>
  request<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const pakeStartRequest = (payload: PakeStartPayload) =>
  request<PakeStartResponse>("/api/v1/auth/pake/start", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const pakeFinishRequest = (payload: PakeFinishPayload) =>
  request<PakeFinishResponse>("/api/v1/auth/pake/finish", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const pakeUpgradeRequest = (payload: PakeUpgradePayload) =>
  request<PakeUpgradeResponse>("/api/v1/auth/pake/upgrade", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchMe = () => request<User>("/api/v1/auth/me");

export const fetchCameras = () => request<ApiCamera[]>("/api/v1/cameras");

export const fetchRequestableCameras = () => request<ApiCamera[]>("/api/v1/cameras/requestable");

export const fetchAssignments = () => request<ApiAssignment[]>("/api/v1/assignments");

export const createAssignment = (payload: CreateAssignmentPayload) =>
  request<ApiAssignment>("/api/v1/assignments", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchUsers = (role?: Role) => {
  const query = role ? `?role=${role}` : "";
  return request<ApiUser[]>(`/api/v1/admin/users${query}`);
};

export const createUser = (payload: CreateUserPayload) =>
  request<ApiUser>("/api/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateCameraSource = (cameraId: number, payload: UpdateCameraPayload) =>
  request<ApiCamera>(`/api/v1/admin/cameras/${cameraId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const updateCameraAccess = (cameraId: number, payload: AdminCameraAccessPayload) =>
  request<ApiCamera>(`/api/v1/admin/cameras/${cameraId}/access`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const createViewerCamera = (payload: CreateCameraPayload) =>
  request<ApiCamera>("/api/v1/cameras", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateViewerCamera = (cameraId: number, payload: UpdateCameraPayload) =>
  request<ApiCamera>(`/api/v1/cameras/${cameraId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const requestCameraShare = (cameraId: number) =>
  request<ApiCamera>(`/api/v1/cameras/${cameraId}/share-request`, {
    method: "POST",
  });

export const probeCameraSource = (cameraId: number) =>
  request<{ ok: boolean; status_code: number; detail: string }>(`/api/v1/admin/cameras/${cameraId}/probe`);

export const uploadCameraFrame = async (cameraId: number, blob: Blob) => {
  if (!authToken) {
    throw new Error("Missing auth token");
  }

  const form = new FormData();
  form.append("file", blob, "frame.jpg");

  const response = await fetch(`${API_BASE_URL}/api/v1/admin/cameras/${cameraId}/frame`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
};

export const uploadViewerFrame = async (cameraId: number, blob: Blob) => {
  if (!authToken) {
    throw new Error("Missing auth token");
  }

  const form = new FormData();
  form.append("file", blob, "frame.jpg");

  const response = await fetch(`${API_BASE_URL}/api/v1/cameras/${cameraId}/frame`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
};

export const deleteAssignment = (assignmentId: string) =>
  request<{ status: string; assignment_id: string }>(`/api/v1/assignments/${assignmentId}`, {
    method: "DELETE",
  });

export const fetchSecurityEvents = () => request<SecurityEvent[]>("/api/v1/security/events");

export const fetchAuditLogs = () => request<AuditLog[]>("/api/v1/audit-logs");

export const fetchSecurityDashboard = () => request<SecurityDashboard>("/api/v1/security-dashboard");

export const fetchPendingRequests = () => request<AccessRequest[]>("/api/v1/requests/pending");

export const fetchMyRequests = () => request<AccessRequest[]>("/api/v1/requests/my");

export const createAccessRequest = (payload: { camera_id: number; reason: string }) =>
  request<AccessRequest>("/api/v1/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const approveAccessRequest = (requestId: number, durationHours: number) =>
  request<ApiAssignment>(`/api/v1/requests/${requestId}/approve`, {
    method: "POST",
    body: JSON.stringify({ duration_hours: durationHours }),
  });

export const rejectAccessRequest = (requestId: number, note?: string) =>
  request<AccessRequest>(`/api/v1/requests/${requestId}/reject`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });

export const issueCapabilityToken = (cameraId: number) =>
  request<{ capability_token: string; camera_id: number; permissions: string[]; expires_at: string }>("/api/v1/capabilities", {
    method: "POST",
    body: JSON.stringify({ camera_id: cameraId, permissions: ["VIEW"] }),
  });

export const validateCapabilityToken = (payload: { camera_id: number; capability_token: string; nonce: string }) =>
  request<{ status: string; camera_id: number; permissions: string[] }>("/api/v1/capabilities/validate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
