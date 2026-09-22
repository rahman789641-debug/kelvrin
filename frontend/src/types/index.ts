export type UserRole = 
  | 'SUPER_ADMIN'
  | 'AI_ADMIN'
  | 'EMPLOYEE'
  | 'ANALYST'
  | 'APPROVER'
  | 'AUDITOR'
  | 'Super Admin' 
  | 'Admin'
  | 'AI Admin' 
  | 'AI Operator'
  | 'Approver / Manager' 
  | 'Analyst' 
  | 'Employee' 
  | 'Auditor'
  | 'Viewer / Auditor';

export function normalizeRole(role?: string): string {
  if (!role) return 'EMPLOYEE';
  const r = role.trim().toUpperCase().replace(/[\s/]/g, '_');
  if (r.includes('SUPER')) return 'SUPER_ADMIN';
  if (r.includes('OPERATOR')) return 'AI_OPERATOR';
  if (r.includes('AI') || r === 'ADMIN') return 'AI_ADMIN';
  if (r.includes('APPROV') || r.includes('MANAGER')) return 'APPROVER';
  if (r.includes('ANALYST')) return 'ANALYST';
  if (r.includes('AUDIT') || r.includes('VIEWER')) return 'AUDITOR';
  if (r.includes('EMPLOYEE')) return 'EMPLOYEE';
  return r;
}

export function hasPermission(user: User | null | undefined, permissionCode: string): boolean {
  if (!user) return false;
  const normRole = normalizeRole(user.role);
  if (normRole === 'SUPER_ADMIN') return true;

  const perms = user.permissions || [];
  if (perms.includes('*')) return true;

  const dotCode = permissionCode.replace(':', '.');
  const colonCode = permissionCode.replace('.', ':');

  if (perms.includes(permissionCode) || perms.includes(dotCode) || perms.includes(colonCode)) {
    return true;
  }

  // Module wildcard e.g. "users.*"
  const module = dotCode.split('.')[0];
  if (perms.includes(`${module}.*`) || perms.includes(`${module}:*`)) {
    return true;
  }

  return false;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  full_name?: string;
  avatarUrl?: string;
  avatar_url?: string;
  companyCode?: string;
  companyName?: string;
  phone?: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' | 'active' | 'suspended' | string;
  authProvider?: string;
  lastLoginAt?: string;
  created_at?: string;
  permissions: string[];
}

export interface MetricCardData {
  title: string;
  value: string | number;
  change: string;
  isPositive: boolean;
  subtext: string;
  iconName: string;
}

export interface QueryTrendData {
  date: string;
  queries: number;
  tokens: number;
}

export interface AgentUsageData {
  name: string;
  invocations: number;
  successRate: number;
  avgDurationSec: number;
}

export interface DocumentItem {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  classification: 'UNCLASSIFIED' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  status: 'READY' | 'PROCESSING' | 'FAILED' | 'PENDING';
  totalChunks: number;
  totalPages: number;
  ocrApplied: boolean;
  uploadedAt: string;
  uploadedBy: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  pageNumber: number;
  content: string;
  tokenCount: number;
  similarity?: number;
}

export interface AgentItem {
  id: string;
  name: string;
  description: string;
  category: string;
  model: string;
  allowedTools: string[];
  maxSteps: number;
  status: 'IDLE' | 'RUNNING' | 'WAITING_APPROVAL' | 'FAILED';
  lastRunAt: string;
  successRate: number;
}

export interface AgentStepTrace {
  stepNumber: number;
  thought: string;
  actionName?: string;
  actionInput?: Record<string, unknown>;
  observation?: string;
  requiresApproval?: boolean;
  approved?: boolean;
  durationMs: number;
}

export interface WorkflowItem {
  id: string;
  title: string;
  description: string;
  nodesCount: number;
  status: 'ACTIVE' | 'DRAFT' | 'PAUSED';
  lastRunAt: string;
  category: string;
}

export interface ModelItem {
  id: string;
  name: string;
  provider: 'vLLM' | 'Ollama' | 'Triton' | 'Local';
  modality: 'Text' | 'Vision' | 'Embedding';
  contextWindow: number;
  vramAllocatedGb: number;
  vramMaxGb: number;
  status: 'ACTIVE' | 'STANDBY' | 'DRAINING';
  description: string;
  latencyAvgMs: number;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  actorEmail: string;
  actorRole: UserRole;
  action: string;
  resourceType: string;
  resourceId: string;
  status: 'SUCCESS' | 'DENIED' | 'FAILED';
  ipAddress: string;
  details: Record<string, unknown>;
}

export interface CodeRunResult {
  runId: string;
  language: string;
  code: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  memoryMb: number;
  networkBlocked: boolean;
  executedAt: string;
}

export interface SystemTelemetry {
  gpuName: string;
  gpuVramUsedGb: number;
  gpuVramTotalGb: number;
  gpuTempC: number;
  gpuUtilPct: number;
  cpuUtilPct: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  queueDepth: number;
  activeModelCount: number;
}
