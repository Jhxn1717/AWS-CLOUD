import { api } from './client';
import { Project, Deployment, DeploymentLog, DashboardStats, User, UserRole } from '../types';

export const projectsApi = {
  list: () => api.get<Project[]>('/projects'),
  get:  (id: string) => api.get<Project>(`/projects/${id}`),
  create: (name: string, description?: string) =>
    api.post<Project>('/projects', { name, description }),
  update: (id: string, description: string) =>
    api.patch<Project>(`/projects/${id}`, { description }),
  delete: (id: string) => api.delete<void>(`/projects/${id}`),
  stats:  () => api.get<DashboardStats>('/projects/stats'),

  // Deployment
  deploy:      (id: string, file: File, onProgress?: (percent: number) => void) => api.upload<{ deploymentId: string; message: string }>(`/projects/${id}/deploy/upload`, file, onProgress),
  deployFromGitHub: (id: string, payload: { repoUrl: string; branch?: string }) =>
    api.post<{ deploymentId: string; message: string }>(`/projects/${id}/deploy/github`, payload),
  deployments: (id: string) => api.get<Deployment[]>(`/projects/${id}/deployments`),
  deployment:  (id: string, depId: string) => api.get<Deployment>(`/projects/${id}/deployments/${depId}`),
  deploymentLogs: (id: string, depId: string) =>
    api.get<DeploymentLog[]>(`/projects/${id}/deployments/${depId}/logs`),

  // Lifecycle
  start:   (id: string) => api.post<Project>(`/projects/${id}/start`),
  stop:    (id: string) => api.post<void>(`/projects/${id}/stop`),
  restart: (id: string) => api.post<Project>(`/projects/${id}/restart`),

  // Process logs
  processLogs: (id: string, lines = 100) =>
    api.get<string[]>(`/projects/${id}/process/logs?lines=${lines}`),

  // Status
  status: (id: string) => api.get<{
    status: string;
    pid: number | null;
    port: number | null;
    url: string | null;
    process_alive: boolean;
  }>(`/projects/${id}/status`),
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>(
      '/auth/login', { email, password }
    ),
  me: () => api.get<User>('/auth/me'),
};

export const usersApi = {
  list: () => api.get<User[]>('/users'),
  create: (payload: { name: string; email: string; password: string; role: UserRole }) =>
    api.post<User>('/users', payload),
};
