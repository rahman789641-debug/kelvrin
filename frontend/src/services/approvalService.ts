import { addNotification } from './notificationService';

export interface ApprovalItem {
  id: string;
  title: string;
  type: 'Agent Execution' | 'Artifact Release' | 'Database Mutation' | 'Network Access';
  requester: string;
  timestamp: number;
  timeFormatted: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedBy?: string;
  decidedAt?: number;
  feedback?: string;
}

const STORAGE_KEY = 'kelvrin_hitl_approvals';

const INITIAL_APPROVALS: ApprovalItem[] = [
  {
    id: 'hitl-1',
    title: 'Agent Task Authorization: Sovereign Financial Audit',
    type: 'Agent Execution',
    requester: 'Autonomous Auditor (ReAct)',
    timestamp: Date.now() - 5 * 60 * 1000,
    timeFormatted: '5 mins ago',
    risk: 'MEDIUM',
    details: 'Autonomous agent requesting clearance to execute multi-document cross-check and generate Q3 ledger reconciliation on confidential records.',
    status: 'PENDING'
  },
  {
    id: 'hitl-2',
    title: 'Deliverable Release Sign-Off: Q3 Air-Gap Security Audit',
    type: 'Artifact Release',
    requester: 'Elena Rostova (Analyst)',
    timestamp: Date.now() - 18 * 60 * 1000,
    timeFormatted: '18 mins ago',
    risk: 'LOW',
    details: 'Compliance audit report ready for formal sign-off. Contains 42 verified citations with zero external internet dependencies.',
    status: 'PENDING'
  },
  {
    id: 'hitl-3',
    title: 'Database Direct Query: Avionics Telemetry Extraction',
    type: 'Database Mutation',
    requester: 'Flight Analyst Agent v2',
    timestamp: Date.now() - 35 * 60 * 1000,
    timeFormatted: '35 mins ago',
    risk: 'HIGH',
    details: 'Agent requesting read execution on partitioned local Mil-Std-1553 bus telemetry tables for mission anomaly synthesis.',
    status: 'PENDING'
  }
];

export function getApprovals(): ApprovalItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_APPROVALS));
      return INITIAL_APPROVALS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_APPROVALS;
  } catch (err) {
    console.warn('[ApprovalService] Failed to load approvals from storage:', err);
    return INITIAL_APPROVALS;
  }
}

export function saveApprovals(items: ApprovalItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kelvrin_approvals_updated'));
    }
  } catch (err) {
    console.warn('[ApprovalService] Failed to save approvals:', err);
  }
}

export function decideApproval(
  id: string,
  decision: 'APPROVED' | 'REJECTED',
  decidedBy: string = 'Manager / Approver',
  feedback?: string
): ApprovalItem | null {
  const current = getApprovals();
  const index = current.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const updatedItem: ApprovalItem = {
    ...current[index],
    status: decision,
    decidedBy,
    decidedAt: Date.now(),
    feedback
  };

  current[index] = updatedItem;
  saveApprovals(current);

  // Push notification alert for the decision
  addNotification({
    title: `Action Clearance ${decision === 'APPROVED' ? 'Approved' : 'Declined'}`,
    message: `"${updatedItem.title}" was marked as ${decision.toLowerCase()} by ${decidedBy}.`,
    type: decision === 'APPROVED' ? 'success' : 'warning',
    createdAt: Date.now(),
    read: false
  });

  return updatedItem;
}

export function createApprovalRequest(
  item: Omit<ApprovalItem, 'id' | 'timestamp' | 'timeFormatted' | 'status'>
): ApprovalItem {
  const current = getApprovals();
  const newItem: ApprovalItem = {
    ...item,
    id: `hitl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    timeFormatted: 'Just now',
    status: 'PENDING'
  };

  const updated = [newItem, ...current];
  saveApprovals(updated);

  addNotification({
    title: `Pending HITL Clearance: ${newItem.title}`,
    message: `${newItem.requester} requested ${newItem.risk} risk authorization for ${newItem.type}.`,
    type: 'access',
    createdAt: Date.now(),
    read: false
  });

  return newItem;
}
