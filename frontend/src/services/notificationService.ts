import { meshSync, MeshMessage } from './meshSync';
import { listenToAccessRequestsFromCloud } from './cloudSync';

export type NotificationType = 'security' | 'agent' | 'access' | 'system' | 'success' | 'warning';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  createdAt: number;
  read: boolean;
  link?: string;
}

const NOTIFICATIONS_STORAGE_KEY = 'kelvrin_notifications';

const DEFAULT_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'init-1',
    title: 'Zero-Egress Audit Passed',
    message: 'Outbound network scan completed. Zero external packets detected.',
    type: 'security',
    createdAt: Date.now() - 5 * 60 * 1000, // 5m ago
    read: false,
  },
  {
    id: 'init-2',
    title: 'Financial Auditor Agent Completed',
    message: 'Autonomous agent verified Q3 ratios against balance sheet data.',
    type: 'agent',
    createdAt: Date.now() - 18 * 60 * 1000, // 18m ago
    read: false,
  },
  {
    id: 'init-3',
    title: 'New Document Indexed',
    message: 'Avionics_Bus_1553_Telemetry.pdf (148 chunks) successfully embedded into local vector store.',
    type: 'system',
    createdAt: Date.now() - 60 * 60 * 1000, // 1h ago
    read: false,
  },
  {
    id: 'init-4',
    title: 'Air-Gap Enclave Protected',
    message: 'Local hardware acceleration synchronized under sovereign defense mode.',
    type: 'success',
    createdAt: Date.now() - 3 * 60 * 60 * 1000, // 3h ago
    read: true,
  },
];

export function getStoredNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!raw) {
      // First time initialization
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(DEFAULT_NOTIFICATIONS));
      return DEFAULT_NOTIFICATIONS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return DEFAULT_NOTIFICATIONS;
  } catch (err) {
    console.warn('[NotificationService] Error reading stored notifications:', err);
    return DEFAULT_NOTIFICATIONS;
  }
}

export function saveNotifications(notifications: AppNotification[]): void {
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kelvrin_notifications_updated'));
    }
  } catch (err) {
    console.warn('[NotificationService] Error saving notifications:', err);
  }
}

export function addNotification(
  item: Omit<AppNotification, 'id' | 'createdAt' | 'read'> & Partial<Pick<AppNotification, 'id' | 'createdAt' | 'read'>>
): AppNotification {
  const current = getStoredNotifications();
  const newNotif: AppNotification = {
    id: item.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: item.title,
    message: item.message,
    type: item.type || 'system',
    createdAt: item.createdAt || Date.now(),
    read: item.read ?? false,
    link: item.link,
  };

  const updated = [newNotif, ...current];
  saveNotifications(updated);
  return newNotif;
}

export function markNotificationAsRead(id: string): void {
  const current = getStoredNotifications();
  const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
  saveNotifications(updated);
}

export function markAllNotificationsAsRead(): void {
  const current = getStoredNotifications();
  const updated = current.map((n) => ({ ...n, read: true }));
  saveNotifications(updated);
}

export function removeNotification(id: string): void {
  const current = getStoredNotifications();
  const updated = current.filter((n) => n.id !== id);
  saveNotifications(updated);
}

export function clearAllNotifications(): void {
  saveNotifications([]);
}

export function formatRelativeTime(createdAt: number): string {
  const diffMs = Date.now() - createdAt;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// Auto-subscribe to mesh network events to generate real-time notifications
if (typeof window !== 'undefined') {
  meshSync.subscribe((msg: MeshMessage) => {
    try {
      if (msg.type === 'ACCESS_REQUEST_SUBMITTED' && msg.payload) {
        const name = msg.payload.fullName || msg.payload.email || 'An operator';
        const company = msg.payload.companyCode || '';
        addNotification({
          title: 'New Access Request',
          message: `${name} requested authorization${company ? ` for [${company}]` : ''}.`,
          type: 'access',
          createdAt: Date.now(),
          read: false,
        });
      } else if (msg.type === 'ACCESS_REQUEST_DECIDED' && msg.payload) {
        const status = msg.payload.status === 'approved' ? 'Approved' : 'Rejected';
        addNotification({
          title: `Access Request ${status}`,
          message: `Request for ${msg.payload.email || 'operator'} was ${status.toLowerCase()} by ${msg.payload.approvedBy || 'Admin'}.`,
          type: msg.payload.status === 'approved' ? 'success' : 'warning',
          createdAt: Date.now(),
          read: false,
        });
      } else if (msg.type === 'COMPANY_REGISTERED' && msg.payload) {
        addNotification({
          title: 'Organization Enrolled',
          message: `New enterprise enclave "${msg.payload.name || msg.payload.code}" registered.`,
          type: 'system',
          createdAt: Date.now(),
          read: false,
        });
      }
    } catch (e) {
      console.warn('[NotificationService] Failed to process mesh event for notification:', e);
    }
  });

  // Auto-subscribe to Cloud Firestore access requests to generate cross-laptop real-time notifications
  try {
    listenToAccessRequestsFromCloud(undefined, (reqs) => {
      const stored = getStoredNotifications();
      reqs.forEach((r) => {
        if (r.status === 'pending_approval') {
          const notifId = `cloud_req_${r.id}`;
          if (!stored.some((n) => n.id === notifId)) {
            addNotification({
              id: notifId,
              title: 'New Access Request',
              message: `${r.fullName || r.email} requested authorization for [${r.companyCode}].`,
              type: 'access',
              createdAt: Date.now(),
              read: false,
            });
          }
        }
      });
    });
  } catch (err) {
    console.warn('[NotificationService] Failed to listen to cloud access requests:', err);
  }
}
