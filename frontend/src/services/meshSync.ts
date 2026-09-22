/**
 * Real-Time Mesh Synchronization Service
 * 
 * Uses browser-native BroadcastChannel to provide instant (0ms latency)
 * synchronization across tabs, windows, and browser profiles on the same origin.
 * Synchronizes:
 * - Registered Companies
 * - Super Admins
 * - Real-Time Access Requests (New User Login Requests)
 * - Approvals / Rejections (Instant Operator Screen Unlocking)
 */

export interface MeshMessage {
  type: 
    | 'COMPANY_REGISTERED'
    | 'ADMIN_REGISTERED'
    | 'ACCESS_REQUEST_SUBMITTED'
    | 'ACCESS_REQUEST_DECIDED'
    | 'REQUEST_COMPANIES_SYNC'
    | 'RESPONSE_COMPANIES_SYNC';
  payload?: any;
  timestamp: number;
}

type MeshListener = (msg: MeshMessage) => void;

class MeshSyncService {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<MeshListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('kelvrin_mesh_channel');
        this.channel.onmessage = (event: MessageEvent) => {
          this.handleIncomingMessage(event.data);
        };
      } catch (err) {
        console.warn('[MeshSync] BroadcastChannel init notice:', err);
      }
    }

    // Also listen to local window storage events as fallback
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === 'kelvrin_companies' && event.newValue) {
          this.notifyListeners({
            type: 'RESPONSE_COMPANIES_SYNC',
            payload: JSON.parse(event.newValue),
            timestamp: Date.now()
          });
        }
      });
    }
  }

  private handleIncomingMessage(data: any) {
    if (!data || !data.type) return;
    const msg: MeshMessage = data;

    // Automatic local cache hydration
    try {
      if (msg.type === 'COMPANY_REGISTERED' && msg.payload) {
        const raw = localStorage.getItem('kelvrin_companies');
        const list = raw ? JSON.parse(raw) : [];
        const codeKey = (msg.payload.code || '').trim().toUpperCase();
        if (codeKey && !list.some((c: any) => c.code?.toUpperCase() === codeKey)) {
          list.push(msg.payload);
          localStorage.setItem('kelvrin_companies', JSON.stringify(list));
        }
      } else if (msg.type === 'RESPONSE_COMPANIES_SYNC' && Array.isArray(msg.payload)) {
        const raw = localStorage.getItem('kelvrin_companies');
        const list = raw ? JSON.parse(raw) : [];
        const map = new Map();
        list.forEach((c: any) => map.set((c.code || '').toUpperCase(), c));
        msg.payload.forEach((c: any) => map.set((c.code || '').toUpperCase(), c));
        localStorage.setItem('kelvrin_companies', JSON.stringify(Array.from(map.values())));
      } else if (msg.type === 'ACCESS_REQUEST_SUBMITTED' && msg.payload) {
        const raw = localStorage.getItem('kelvrin_access_requests');
        const list = raw ? JSON.parse(raw) : [];
        const existingIdx = list.findIndex((r: any) => r.id === msg.payload.id || (r.email === msg.payload.email && r.companyCode === msg.payload.companyCode));
        if (existingIdx >= 0) {
          list[existingIdx] = msg.payload;
        } else {
          list.unshift(msg.payload);
        }
        localStorage.setItem('kelvrin_access_requests', JSON.stringify(list));
      } else if (msg.type === 'ACCESS_REQUEST_DECIDED' && msg.payload) {
        const raw = localStorage.getItem('kelvrin_access_requests');
        const list = raw ? JSON.parse(raw) : [];
        const existingIdx = list.findIndex((r: any) => r.id === msg.payload.id || r.id === msg.payload.requestId);
        if (existingIdx >= 0) {
          list[existingIdx] = {
            ...list[existingIdx],
            status: msg.payload.status,
            approvedBy: msg.payload.approvedBy,
            approvedAt: new Date().toISOString()
          };
          localStorage.setItem('kelvrin_access_requests', JSON.stringify(list));
        }
      } else if (msg.type === 'REQUEST_COMPANIES_SYNC') {
        const raw = localStorage.getItem('kelvrin_companies');
        if (raw) {
          this.broadcast('RESPONSE_COMPANIES_SYNC', JSON.parse(raw));
        }
      }
    } catch (err) {
      console.warn('[MeshSync] Hydration error:', err);
    }

    this.notifyListeners(msg);
  }

  private notifyListeners(msg: MeshMessage) {
    this.listeners.forEach(cb => {
      try { cb(msg); } catch (e) { console.error('[MeshSync] Listener error:', e); }
    });
  }

  public broadcast(type: MeshMessage['type'], payload?: any): void {
    const msg: MeshMessage = {
      type,
      payload,
      timestamp: Date.now()
    };

    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch (err) {
        console.warn('[MeshSync] PostMessage error:', err);
      }
    }

    // Trigger local listeners too
    this.handleIncomingMessage(msg);
  }

  public subscribe(listener: MeshListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public requestCompaniesSync(): void {
    this.broadcast('REQUEST_COMPANIES_SYNC');
  }
}

export const meshSync = new MeshSyncService();
