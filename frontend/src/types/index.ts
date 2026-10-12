export type ProjectStatus =
  | 'CREATED' | 'ANALYZING' | 'BUILDING' | 'STARTING'
  | 'RUNNING' | 'STOPPED' | 'FAILED' | 'DELETING';

export type DeploymentStatus =
  | 'PENDING' | 'ZIP_UPLOAD' | 'EXTRACTION' | 'ANALYSIS'
  | 'DEPENDENCY_INSTALL' | 'DATABASE_PROVISIONING' | 'BUILD'
  | 'PORT_ALLOCATION' | 'PROCESS_START' | 'HEALTH_CHECK'
  | 'RUNNING' | 'FAILED';

export type StageStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  runtime: string | null;
  runtime_version: string | null;
  framework: string | null;
  project_type: string | null;
  source_path: string | null;
  assigned_port: number | null;
  process_pid: number | null;
  created_at: string;
  updated_at: string;
  last_deployment?: Deployment | null;
  url?: string | null;
  is_running?: boolean;
  database?: {
    type: string;
    host: string;
    port: number;
    name: string;
    user: string;
    is_active: boolean;
  } | null;
}

export interface Deployment {
  id: string;
  project_id: string;
  user_id: string;
  version: number;
  status: DeploymentStatus;
  current_stage: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  stages?: DeploymentStage[];
  logs?: DeploymentLog[];
}

export interface DeploymentStage {
  id: string;
  deployment_id: string;
  stage: string;
  status: StageStatus;
  logs: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface DeploymentLog {
  id: string;
  deployment_id: string;
  project_id: string;
  level: LogLevel;
  stage: string | null;
  message: string;
  created_at: string;
}

export interface PortStats {
  total: number;
  used: number;
  available: number;
}

export interface DashboardStats {
  projects: Record<string, number>;
  ports: PortStats;
  running_processes: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
