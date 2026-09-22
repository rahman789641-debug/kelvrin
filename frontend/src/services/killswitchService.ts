import { addNotification } from './notificationService';

export interface LockdownState {
  isActive: boolean;
  timestamp?: number;
  activatedBy?: string;
  reason?: string;
}

const STORAGE_KEY = 'kelvrin_sovereign_lockdown';

export function getLockdownState(): LockdownState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { isActive: false };
    return JSON.parse(raw);
  } catch (err) {
    return { isActive: false };
  }
}

export function engageLockdown(adminName: string = 'Super Admin', reason: string = 'Security Protocol Trigger'): LockdownState {
  const state: LockdownState = {
    isActive: true,
    timestamp: Date.now(),
    activatedBy: adminName,
    reason
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kelvrin_lockdown_updated', { detail: state }));
  }

  addNotification({
    title: '⚠️ EMERGENCY ZERO-TRUST LOCKDOWN ENGAGED',
    message: `All external interfaces, agent execution queues, and model inferences isolated by ${adminName}. Reason: ${reason}.`,
    type: 'warning',
    createdAt: Date.now(),
    read: false
  });

  return state;
}

export function liftLockdown(adminName: string = 'Super Admin'): LockdownState {
  const state: LockdownState = {
    isActive: false,
    timestamp: Date.now(),
    activatedBy: adminName
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kelvrin_lockdown_updated', { detail: state }));
  }

  addNotification({
    title: '✅ Sovereign Lockdown Lifted',
    message: `Normal enclave operations restored by ${adminName}. Autonomous agents and network filters nominal.`,
    type: 'success',
    createdAt: Date.now(),
    read: false
  });

  return state;
}
