import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  updateDoc,
  query,
  where,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';
import { AccessRequest, TeamMember } from './accessControl';
import { companyApi } from './api';
import { meshSync } from './meshSync';

/**
 * Cloud Sync Service:
 * Synchronizes Registered Companies, Super Admins, Access Requests, and Team Members
 * across Local Mesh (BroadcastChannel), Backend REST API, and Firebase Firestore
 * so that ANY user on ANY system or browser can access their organization!
 */

const TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch((err) => {
      console.warn('[CloudSync] Firestore operation error:', err?.message || err);
      return fallback;
    }),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS))
  ]);
}

function saveToLocalCompanies(comp: any): void {
  try {
    const raw = localStorage.getItem('kelvrin_companies');
    const companies: any[] = raw ? JSON.parse(raw) : [];
    const codeKey = (comp.code || '').trim().toUpperCase();
    const idx = companies.findIndex(c => c.code?.toUpperCase() === codeKey);
    if (idx >= 0) {
      companies[idx] = { ...companies[idx], ...comp };
    } else {
      companies.push(comp);
    }
    localStorage.setItem('kelvrin_companies', JSON.stringify(companies));
  } catch (err) {
    console.warn('[CloudSync] Local cache write error:', err);
  }
}

// ==========================================
// 1. COMPANIES CLOUD SYNC
// ==========================================

export async function syncCompanyToCloud(company: {
  name: string;
  code: string;
  country?: string;
  state?: string;
  district?: string;
  logoDataUrl?: string | null;
  registeredAt?: string;
}): Promise<void> {
  const codeKey = company.code.trim().toUpperCase();

  // 1. Broadcast locally via Mesh (0ms latency for other tabs/windows)
  try {
    meshSync.broadcast('COMPANY_REGISTERED', company);
  } catch {}

  // 2. Sync to Backend REST API if server is online
  try {
    await companyApi.registerCompany(company).catch(() => {});
  } catch {}

  // 3. Sync to Firebase Cloud Firestore
  try {
    const docRef = doc(db, 'companies', codeKey);
    // Sanitize logo: if base64 exceeds 50KB, strip for Firestore to prevent 1MB doc limit error
    let sanitizedLogo = company.logoDataUrl;
    if (sanitizedLogo && sanitizedLogo.length > 50000) {
      sanitizedLogo = null;
    }

    await withTimeout(
      setDoc(docRef, {
        name: company.name,
        code: codeKey,
        country: company.country || 'IN',
        state: company.state || 'TN',
        district: company.district || 'Chennai',
        logoDataUrl: sanitizedLogo,
        registeredAt: company.registeredAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true }),
      undefined
    );
    console.info(`[CloudSync] Company ${codeKey} synchronized to cloud.`);
  } catch (err) {
    console.warn('[CloudSync] Failed to sync company to cloud Firestore:', err);
  }
}

export async function fetchCompanyFromCloud(code: string): Promise<any | null> {
  const codeKey = code.trim().toUpperCase();

  // 1. Check local cache first
  try {
    const raw = localStorage.getItem('kelvrin_companies');
    const local: any[] = raw ? JSON.parse(raw) : [];
    const foundLocal = local.find(c => (c.code || c.companyCode)?.toUpperCase() === codeKey);
    if (foundLocal) return foundLocal;
  } catch {}

  // 2. Query Backend REST API verify endpoint
  try {
    const verifiedResult = await companyApi.verifyCompany(codeKey);
    if (verifiedResult && verifiedResult.verified && verifiedResult.company) {
      saveToLocalCompanies(verifiedResult.company);
      meshSync.broadcast('COMPANY_REGISTERED', verifiedResult.company);
      return verifiedResult.company;
    }
  } catch {}

  // 3. Query Backend REST API getCompany endpoint
  try {
    const backendComp = await companyApi.getCompany(codeKey);
    if (backendComp && (backendComp.code || backendComp.name)) {
      saveToLocalCompanies(backendComp);
      meshSync.broadcast('COMPANY_REGISTERED', backendComp);
      return backendComp;
    }
  } catch (err) {
    // Backend offline / static hosting fallback
  }

  // 4. Query Firebase Cloud Firestore by Document ID
  try {
    const docRef = doc(db, 'companies', codeKey);
    const snap = await withTimeout(getDoc(docRef), null);

    if (snap && snap.exists()) {
      const data = snap.data();
      saveToLocalCompanies(data);
      meshSync.broadcast('COMPANY_REGISTERED', data);
      return data;
    }
  } catch (err) {
    console.warn(`[CloudSync] Document ID lookup notice for "${codeKey}":`, err);
  }

  // 5. Query Firebase Cloud Firestore by 'code' field
  try {
    const colRef = collection(db, 'companies');
    const q = query(colRef, where('code', '==', codeKey));
    const qSnap = await withTimeout(getDocs(q), null);
    if (qSnap && !qSnap.empty) {
      const data = qSnap.docs[0].data();
      saveToLocalCompanies(data);
      meshSync.broadcast('COMPANY_REGISTERED', data);
      return data;
    }
  } catch (err) {
    console.warn(`[CloudSync] Query by code notice for "${codeKey}":`, err);
  }

  // 6. Query Firebase Cloud Firestore by 'companyCode' field fallback
  try {
    const colRef = collection(db, 'companies');
    const qComp = query(colRef, where('companyCode', '==', codeKey));
    const qCompSnap = await withTimeout(getDocs(qComp), null);
    if (qCompSnap && !qCompSnap.empty) {
      const data = qCompSnap.docs[0].data();
      saveToLocalCompanies(data);
      meshSync.broadcast('COMPANY_REGISTERED', data);
      return data;
    }
  } catch (err) {
    console.warn(`[CloudSync] Query by companyCode notice for "${codeKey}":`, err);
  }

  return null;
}

export async function fetchAllCompaniesFromCloud(): Promise<any[]> {
  const allMap = new Map<string, any>();

  // 1. Load from local cache
  try {
    const raw = localStorage.getItem('kelvrin_companies');
    const local: any[] = raw ? JSON.parse(raw) : [];
    local.forEach(c => {
      if (c.code) allMap.set(c.code.toUpperCase(), c);
    });
  } catch {}

  // 2. Fetch from Backend REST API
  try {
    const backendList = await companyApi.listCompanies();
    if (Array.isArray(backendList)) {
      backendList.forEach(c => {
        if (c.code) allMap.set(c.code.toUpperCase(), c);
      });
    }
  } catch {}

  // 3. Fetch from Firebase Cloud Firestore
  try {
    const colRef = collection(db, 'companies');
    const snap = await withTimeout(getDocs(colRef), null);
    if (snap && !snap.empty) {
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.code) allMap.set(data.code.toUpperCase(), data);
      });
    }
  } catch (err) {
    console.warn('[CloudSync] Could not fetch all cloud companies from Firestore:', err);
  }

  const merged = Array.from(allMap.values());
  try {
    localStorage.setItem('kelvrin_companies', JSON.stringify(merged));
  } catch {}

  return merged;
}

// ==========================================
// 2. SUPER ADMINS CLOUD SYNC
// ==========================================

export async function syncAdminToCloud(admin: {
  username?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  password?: string;
  companyCode: string;
  companyName?: string;
  securityQuestionType?: string;
  securityAnswer?: string;
}): Promise<void> {
  const emailKey = admin.email.trim().toLowerCase();

  // 1. Broadcast locally via Mesh (0ms latency across local tabs/windows)
  try {
    meshSync.broadcast('ADMIN_REGISTERED', admin);
  } catch {}

  // 2. Sync to Backend REST API if server is active
  try {
    await companyApi.registerAdmin(admin).catch(() => {});
  } catch {}

  // 3. Sync to Firebase Cloud Firestore
  try {
    const docRef = doc(db, 'admins', emailKey);
    await withTimeout(
      setDoc(docRef, {
        ...admin,
        email: emailKey,
        companyCode: admin.companyCode.trim().toUpperCase(),
        updatedAt: new Date().toISOString(),
      }, { merge: true }),
      undefined
    );
    console.info(`[CloudSync] Admin ${emailKey} synchronized to cloud.`);
  } catch (err) {
    console.warn('[CloudSync] Failed to sync admin to cloud:', err);
  }
}

export async function fetchAdminFromCloud(identifier: string): Promise<any | null> {
  const normalized = identifier.trim().toLowerCase();

  // 1. Query Backend REST API
  try {
    const backendAdmin = await companyApi.getAdmin(normalized);
    if (backendAdmin && backendAdmin.email) {
      try {
        const raw = localStorage.getItem('kelvrin_registered_admins');
        const admins: any[] = raw ? JSON.parse(raw) : [];
        if (!admins.some(a => a.email?.toLowerCase() === normalized)) {
          admins.push(backendAdmin);
          localStorage.setItem('kelvrin_registered_admins', JSON.stringify(admins));
        }
      } catch {}
      return backendAdmin;
    }
  } catch {}

  // 2. Query Firebase Cloud Firestore by doc ID
  try {
    const docRef = doc(db, 'admins', normalized);
    const snap = await withTimeout(getDoc(docRef), null);

    if (snap && snap.exists()) {
      const data = snap.data();
      try {
        const raw = localStorage.getItem('kelvrin_registered_admins');
        const admins: any[] = raw ? JSON.parse(raw) : [];
        if (!admins.some(a => a.email?.toLowerCase() === normalized || a.username?.toLowerCase() === normalized)) {
          admins.push(data);
          localStorage.setItem('kelvrin_registered_admins', JSON.stringify(admins));
        }
      } catch {}
      return data;
    }

    // 3. Fallback: Query by username field
    const colRef = collection(db, 'admins');
    const qUser = query(colRef, where('username', '==', normalized));
    const qUserSnap = await withTimeout(getDocs(qUser), null);
    if (qUserSnap && !qUserSnap.empty) {
      const data = qUserSnap.docs[0].data();
      try {
        const raw = localStorage.getItem('kelvrin_registered_admins');
        const admins: any[] = raw ? JSON.parse(raw) : [];
        if (!admins.some(a => a.email?.toLowerCase() === data.email?.toLowerCase())) {
          admins.push(data);
          localStorage.setItem('kelvrin_registered_admins', JSON.stringify(admins));
        }
      } catch {}
      return data;
    }

    // 4. Fallback: Query by email field
    const qEmail = query(colRef, where('email', '==', normalized));
    const qEmailSnap = await withTimeout(getDocs(qEmail), null);
    if (qEmailSnap && !qEmailSnap.empty) {
      const data = qEmailSnap.docs[0].data();
      try {
        const raw = localStorage.getItem('kelvrin_registered_admins');
        const admins: any[] = raw ? JSON.parse(raw) : [];
        if (!admins.some(a => a.email?.toLowerCase() === data.email?.toLowerCase())) {
          admins.push(data);
          localStorage.setItem('kelvrin_registered_admins', JSON.stringify(admins));
        }
      } catch {}
      return data;
    }

    return null;
  } catch (err) {
    console.warn('[CloudSync] Cloud lookup failed for admin:', err);
    return null;
  }
}

// ==========================================
// 3. ACCESS REQUESTS CLOUD SYNC (CROSS-SYSTEM APPROVALS)
// ==========================================

export async function syncAccessRequestToCloud(req: AccessRequest): Promise<void> {
  // 1. Broadcast locally via Mesh (notifies Super Admin tab in 0ms)
  try {
    meshSync.broadcast('ACCESS_REQUEST_SUBMITTED', req);
  } catch {}

  // 2. Sync to Backend REST API
  try {
    await companyApi.submitAccessRequest(req).catch(() => {});
  } catch {}

  // 3. Sync to Firebase Cloud Firestore
  try {
    const docRef = doc(db, 'access_requests', req.id);
    await withTimeout(
      setDoc(docRef, {
        ...req,
        companyCode: req.companyCode.trim().toUpperCase(),
        email: req.email.trim().toLowerCase(),
        updatedAt: new Date().toISOString(),
      }, { merge: true }),
      undefined
    );
    console.info(`[CloudSync] Access request ${req.id} synchronized to cloud.`);
  } catch (err) {
    console.warn('[CloudSync] Failed to sync access request to cloud:', err);
  }
}

export async function fetchAccessRequestsFromCloud(companyCode?: string): Promise<AccessRequest[]> {
  const map = new Map<string, AccessRequest>();

  // 1. Read existing from local storage
  try {
    const raw = localStorage.getItem('kelvrin_access_requests');
    const local: AccessRequest[] = raw ? JSON.parse(raw) : [];
    local.forEach(r => map.set(r.id, r));
  } catch {}

  // 2. Query Backend REST API
  try {
    const backendList = await companyApi.listAccessRequests(companyCode);
    if (Array.isArray(backendList)) {
      backendList.forEach(r => map.set(r.id, r as AccessRequest));
    }
  } catch {}

  // 3. Query Firebase Cloud Firestore
  try {
    const colRef = collection(db, 'access_requests');
    const snap = await withTimeout(getDocs(colRef), null);
    if (snap && !snap.empty) {
      const list = snap.docs.map(d => d.data() as AccessRequest);
      list.forEach(r => map.set(r.id, r));
    }
  } catch (err) {
    console.warn('[CloudSync] Could not fetch cloud access requests:', err);
  }

  const allMerged = Array.from(map.values());
  try {
    localStorage.setItem('kelvrin_access_requests', JSON.stringify(allMerged));
  } catch {}

  if (companyCode) {
    const targetCode = companyCode.trim().toUpperCase();
    return allMerged.filter(r => !r.companyCode || r.companyCode.toUpperCase() === targetCode);
  }

  return allMerged;
}

export async function updateAccessRequestInCloud(
  requestId: string,
  status: 'approved' | 'rejected',
  approvedBy: string = 'Super Admin'
): Promise<void> {
  const payload = {
    status,
    approvedBy,
    approvedAt: new Date().toISOString()
  };

  // 1. Broadcast via Mesh (unlocks waiting operator's tab in 0ms)
  try {
    meshSync.broadcast('ACCESS_REQUEST_DECIDED', {
      requestId,
      ...payload
    });
  } catch {}

  // 2. Update Backend REST API
  try {
    await companyApi.updateAccessRequestStatus(requestId, status, approvedBy).catch(() => {});
  } catch {}

  // 3. Update Firebase Cloud Firestore
  try {
    const docRef = doc(db, 'access_requests', requestId);
    await withTimeout(
      updateDoc(docRef, {
        status,
        approvedBy,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      undefined
    );
    console.info(`[CloudSync] Access request ${requestId} marked as ${status} in cloud.`);
  } catch (err) {
    console.warn(`[CloudSync] Failed to update request ${requestId} in cloud:`, err);
  }
}

// ==========================================
// 4. REAL-TIME FIRESTORE ON-SNAPSHOT LISTENERS
// ==========================================

/**
 * Real-time listener for all Access Requests for an organization.
 * Whenever any computer/browser submits or modifies a request, this listener
 * fires immediately (< 200ms) without needing polling!
 */
export function listenToAccessRequestsFromCloud(
  companyCode?: string,
  callback?: (requests: AccessRequest[]) => void
): Unsubscribe {
  try {
    const colRef = collection(db, 'access_requests');
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const map = new Map<string, AccessRequest>();

        // Load existing from local storage cache
        try {
          const raw = localStorage.getItem('kelvrin_access_requests');
          const local: AccessRequest[] = raw ? JSON.parse(raw) : [];
          local.forEach((r) => map.set(r.id, r));
        } catch {}

        // Merge real-time snapshot docs
        snapshot.docs.forEach((d) => {
          const data = d.data() as AccessRequest;
          if (data && data.id) {
            map.set(data.id, data);
          }
        });

        const allMerged = Array.from(map.values());
        try {
          localStorage.setItem('kelvrin_access_requests', JSON.stringify(allMerged));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('kelvrin_access_requests_updated'));
          }
        } catch {}

        const filtered = companyCode
          ? allMerged.filter(
              (r) => !r.companyCode || r.companyCode.toUpperCase() === companyCode.trim().toUpperCase()
            )
          : allMerged;

        if (callback) {
          callback(filtered);
        }
      },
      (err) => {
        console.warn('[CloudSync] Real-time access requests onSnapshot error:', err);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('[CloudSync] Failed to initialize access requests listener:', err);
    return () => {};
  }
}

/**
 * Real-time listener for a single access request by ID.
 * Fires instantly when Super Admin approves or declines on another computer.
 */
export function listenToSingleRequestApproval(
  requestId: string,
  onDecision: (request: AccessRequest) => void
): Unsubscribe {
  if (!requestId) return () => {};

  try {
    const docRef = doc(db, 'access_requests', requestId);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as AccessRequest;
          if (data && (data.status === 'approved' || data.status === 'rejected')) {
            // Update local storage
            try {
              const raw = localStorage.getItem('kelvrin_access_requests');
              const local: AccessRequest[] = raw ? JSON.parse(raw) : [];
              const idx = local.findIndex((r) => r.id === data.id);
              if (idx >= 0) local[idx] = data;
              else local.push(data);
              localStorage.setItem('kelvrin_access_requests', JSON.stringify(local));
            } catch {}

            onDecision(data);
          }
        }
      },
      (err) => {
        console.warn(`[CloudSync] Request ${requestId} listener error:`, err);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn(`[CloudSync] Failed to listen to request ${requestId}:`, err);
    return () => {};
  }
}

/**
 * Real-time listener for user approval by Email & Company Code.
 * Ensures that Laptop 2 detects Super Admin approval in real-time even if doc ID is unknown.
 */
export function listenToUserApproval(
  email: string,
  companyCode: string,
  onDecision: (request: AccessRequest) => void
): Unsubscribe {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = companyCode.trim().toUpperCase();

  try {
    const colRef = collection(db, 'access_requests');
    const q = query(colRef, where('email', '==', normalizedEmail));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data() as AccessRequest;
          if (data && (!data.companyCode || data.companyCode.toUpperCase() === normalizedCode)) {
            // Update local cache
            try {
              const raw = localStorage.getItem('kelvrin_access_requests');
              const local: AccessRequest[] = raw ? JSON.parse(raw) : [];
              const idx = local.findIndex((r) => r.id === data.id);
              if (idx >= 0) local[idx] = data;
              else local.push(data);
              localStorage.setItem('kelvrin_access_requests', JSON.stringify(local));
            } catch {}

            if (data.status === 'approved' || data.status === 'rejected') {
              onDecision(data);
              break;
            }
          }
        }
      },
      (err) => {
        console.warn(`[CloudSync] User approval listener error for ${email}:`, err);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn(`[CloudSync] Failed to initialize user approval listener:`, err);
    return () => {};
  }
}

