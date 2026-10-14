/**
 * types/index.ts
 * All shared TypeScript types and interfaces for MyCloud.
 */

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────

export enum ProjectStatus {
  CREATED   = 'CREATED',
  ANALYZING = 'ANALYZING',
  BUILDING  = 'BUILDING',
  STARTING  = 'STARTING',
  RUNNING   = 'RUNNING',
  STOPPED   = 'STOPPED',
  FAILED    = 'FAILED',
  DELETING  = 'DELETING',
}

export enum DeploymentStatus {
  PENDING               = 'PENDING',
  ZIP_UPLOAD            = 'ZIP_UPLOAD',
  EXTRACTION            = 'EXTRACTION',
  ANALYSIS              = 'ANALYSIS',
  DEPENDENCY_INSTALL    = 'DEPENDENCY_INSTALL',
  DATABASE_PROVISIONING = 'DATABASE_PROVISIONING',
  BUILD                 = 'BUILD',
  PORT_ALLOCATION       = 'PORT_ALLOCATION',
  PROCESS_START         = 'PROCESS_START',
  HEALTH_CHECK          = 'HEALTH_CHECK',
  RUNNING               = 'RUNNING',
  FAILED                = 'FAILED',
}

export enum StageStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED  = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum ProcessStatus {
  STARTING = 'STARTING',
  RUNNING  = 'RUNNING',
  STOPPED  = 'STOPPED',
  CRASHED  = 'CRASHED',
  KILLED   = 'KILLED',
}

export enum Runtime {
  NODEJS = 'nodejs',
  PYTHON = 'python',
  JAVA   = 'java',
  PHP    = 'php',
}

export enum Framework {
  REACT       = 'react',
  VITE        = 'vite',
  NEXTJS      = 'nextjs',
  VUE         = 'vue',
  ANGULAR     = 'angular',
  EXPRESS     = 'express',
  FASTAPI     = 'fastapi',
  FLASK       = 'flask',
  DJANGO      = 'django',
  SPRING_BOOT = 'spring',
  LARAVEL     = 'laravel',
  PLAIN       = 'plain',
}

export enum ProjectType {
  BACKEND         = 'BACKEND',
  STATIC_FRONTEND = 'STATIC_FRONTEND',
  FULLSTACK       = 'FULLSTACK',
}

export enum DatabaseType {
  POSTGRESQL = 'postgresql',
  MYSQL      = 'mysql',
  SQLITE     = 'sqlite',
  NONE       = 'none',
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO  = 'INFO',
  WARN  = 'WARN',
  ERROR = 'ERROR',
}

// ─────────────────────────────────────────────────────────────
// Database row types (match column names from schema.sql)
// ─────────────────────────────────────────────────────────────

export interface UserRow {
  id:            string;
  email:         string;
  password_hash: string;
  name:          string;
  role:          string;
  is_active:     boolean;
  last_login_at: Date | null;
  created_at:    Date;
  updated_at:    Date;
}

export interface ProjectRow {
  id:              string;
  user_id:         string;
  name:            string;
  slug:            string;
  description:     string | null;
  status:          ProjectStatus;
  runtime:         Runtime | null;
  runtime_version: string | null;
  framework:       Framework | null;
  project_type:    ProjectType | null;
  source_path:     string | null;
  assigned_port:   number | null;
  process_pid:     number | null;
  created_at:      Date;
  updated_at:      Date;
}

export interface DeploymentRow {
  id:            string;
  project_id:    string;
  user_id:       string;
  version:       number;
  status:        DeploymentStatus;
  current_stage: string | null;
  error_message: string | null;
  started_at:    Date | null;
  finished_at:   Date | null;
  created_at:    Date;
  updated_at:    Date;
}

export interface DeploymentStageRow {
  id:            string;
  deployment_id: string;
  stage:         string;
  status:        StageStatus;
  logs:          string | null;
  error:         string | null;
  started_at:    Date | null;
  finished_at:   Date | null;
  created_at:    Date;
}

export interface DeploymentLogRow {
  id:            string;
  deployment_id: string;
  project_id:    string;
  level:         LogLevel;
  stage:         string | null;
  message:       string;
  created_at:    Date;
}

export interface ProcessRow {
  id:          string;
  project_id:  string;
  pid:         number | null;
  command:     string;
  args:        string[];
  working_dir: string;
  env_vars:    Record<string, string>;
  status:      ProcessStatus;
  exit_code:   number | null;
  exit_signal: string | null;
  started_at:  Date | null;
  stopped_at:  Date | null;
  created_at:  Date;
  updated_at:  Date;
}

export interface PortRow {
  id:           number;
  port_number:  number;
  project_id:   string | null;
  is_active:    boolean;
  allocated_at: Date | null;
  released_at:  Date | null;
  created_at:   Date;
}

export interface DatabaseCredentialRow {
  id:          string;
  project_id:  string;
  db_type:     DatabaseType;
  db_host:     string;
  db_port:     number;
  db_name:     string;
  db_user:     string;
  db_password: string;
  is_active:   boolean;
  created_at:  Date;
  updated_at:  Date;
}

export interface EnvVarRow {
  id:         string;
  project_id: string;
  key:        string;
  value:      string;
  is_secret:  boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectFileRow {
  id:            string;
  project_id:    string;
  deployment_id: string | null;
  original_name: string;
  stored_path:   string;
  file_size:     number | null;
  mime_type:     string | null;
  uploaded_at:   Date;
}

// ─────────────────────────────────────────────────────────────
// Service / domain types
// ─────────────────────────────────────────────────────────────

export interface AnalysisResult {
  startWorkingDir?: string;
  runtime:        Runtime;
  runtimeVersion: string | null;
  framework:      Framework;
  projectType:    ProjectType;
  buildCommand:   string | null;
  startCommand:   string;
  startArgs:      string[];
  needsDatabase:  boolean;
  databaseType:   DatabaseType;
  hasPackageJson: boolean;
  hasPython:      boolean;
  hasJava:        boolean;
  hasPhp:         boolean;
  projectRoot?:   string;
  detectedFiles:  string[];
  warnings:       string[];
}

export interface DeploymentContext {
  projectId:    string;
  deploymentId: string;
  projectPath:  string;
  uploadPath:   string;
  port:         number;
  envVars:      Record<string, string>;
  analysis:     AnalysisResult;
}

export interface ProcessInfo {
  pid:        number;
  command:    string;
  args:       string[];
  port:       number;
  projectId:  string;
  startedAt:  Date;
  status:     ProcessStatus;
}

export interface HealthCheckResult {
  healthy:    boolean;
  statusCode: number | null;
  latencyMs:  number | null;
  error:      string | null;
  checkedAt:  Date;
}

export interface DeploymentPipelineEvent {
  type:         'stage_start' | 'stage_end' | 'log' | 'complete' | 'failed';
  deploymentId: string;
  stage?:       string;
  stageStatus?: StageStatus;
  level?:       LogLevel;
  message?:     string;
  error?:       string;
  timestamp:    Date;
}

// ─────────────────────────────────────────────────────────────
// API request / response types
// ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?:   T;
  error?:  string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items:   T[];
  total:   number;
  page:    number;
  limit:   number;
  pages:   number;
}

export interface LoginRequest {
  email:    string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user:  PublicUser;
}

export interface PublicUser {
  id:    string;
  email: string;
  name:  string;
  role:  string;
}

export interface CreateProjectRequest {
  name:        string;
  description?: string;
}

export interface ProjectSummary extends ProjectRow {
  last_deployment?: DeploymentRow | null;
}

// ─────────────────────────────────────────────────────────────
// Express augmentation – attach user to request
// ─────────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}
