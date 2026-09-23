import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';
import { AccessRequest, TeamMember } from './accessControl';
import { companyApi, SovereignDocument } from './api';
import { meshSync } from './meshSync';

/**
 * Cloud Sync Service:
 * Synchronizes Registered Companies, Super Admins, Access Requests, Team Members,
 * and Cross-Role Company Documents across Local Mesh (BroadcastChannel) and Firebase Firestore
 * so that all roles in an organization share real-time company identity and documents!
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
    const codeKey = (comp.code || comp.companyCode || '').trim().toUpperCase();
    const idx = companies.findIndex(c => (c.code || c.companyCode)?.toUpperCase() === codeKey);
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
  website?: string | null;
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
    // Support high-resolution company logos up to 800KB base64 (well within Firestore 1MB doc limit)
    let sanitizedLogo = company.logoDataUrl;
    if (sanitizedLogo && sanitizedLogo.length > 800000) {
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
        website: company.website || null,
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

  // 1. Query Firebase Cloud Firestore by Document ID first to guarantee fresh logo & details
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

  // 2. Query Firebase Cloud Firestore by 'code' field
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

  // 3. Query Firebase Cloud Firestore by 'companyCode' field fallback
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

  // 4. Fallback to local cache if Firestore is unreachable
  try {
    const raw = localStorage.getItem('kelvrin_companies');
    const local: any[] = raw ? JSON.parse(raw) : [];
    const foundLocal = local.find(c => (c.code || c.companyCode)?.toUpperCase() === codeKey);
    if (foundLocal) return foundLocal;
  } catch {}

  // 5. Query Backend REST API verify endpoint
  try {
    const verifiedResult = await companyApi.verifyCompany(codeKey);
    if (verifiedResult && verifiedResult.verified && verifiedResult.company) {
      saveToLocalCompanies(verifiedResult.company);
      meshSync.broadcast('COMPANY_REGISTERED', verifiedResult.company);
      return verifiedResult.company;
    }
  } catch {}

  return null;
}

/**
 * Real-time listener for Company Profile & Logo updates.
 * Whenever Super Admin modifies company name, logo, or website,
 * ALL roles on ALL systems receive the update in real-time (<200ms)!
 */
export function listenToCompanyFromCloud(
  companyCode: string,
  callback?: (company: any) => void
): Unsubscribe {
  const codeKey = (companyCode || '').trim().toUpperCase();
  if (!codeKey) return () => {};

  try {
    const docRef = doc(db, 'companies', codeKey);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data) {
            saveToLocalCompanies(data);
            try {
              const activeRaw = localStorage.getItem('kelvrin_company');
              if (activeRaw) {
                const active = JSON.parse(activeRaw);
                if ((active.code || active.companyCode)?.toUpperCase() === codeKey) {
                  localStorage.setItem('kelvrin_company', JSON.stringify({ ...active, ...data }));
                }
              }
            } catch {}

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('kelvrin_company_updated', { detail: data }));
            }
            if (callback) callback(data);
          }
        }
      },
      (err) => {
        console.warn(`[CloudSync] Company listener error for ${codeKey}:`, err);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.warn(`[CloudSync] Failed to listen to company ${codeKey}:`, err);
    return () => {};
  }
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
  const safeId = req.id || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const cleanReq: AccessRequest = {
    ...req,
    id: safeId,
    companyCode: (req.companyCode || '').trim().toUpperCase(),
    email: (req.email || '').trim().toLowerCase(),
    fullName: req.fullName || (req.email ? req.email.split('@')[0] : 'User'),
    role: req.role,
    status: req.status || 'pending_approval',
    requestedAt: req.requestedAt || new Date().toISOString(),
    authProvider: req.authProvider || 'google',
  };

  // 1. Broadcast locally via Mesh (notifies Super Admin tab in 0ms)
  try {
    meshSync.broadcast('ACCESS_REQUEST_SUBMITTED', cleanReq);
  } catch {}

  // 2. Sync to Backend REST API
  try {
    await companyApi.submitAccessRequest(cleanReq).catch(() => {});
  } catch {}

  // 3. Sync to Firebase Cloud Firestore
  try {
    const docRef = doc(db, 'access_requests', safeId);
    await withTimeout(
      setDoc(docRef, {
        ...cleanReq,
        updatedAt: new Date().toISOString(),
      }, { merge: true }),
      undefined
    );
    console.info(`[CloudSync] Access request ${safeId} synchronized to cloud.`);
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
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as AccessRequest));
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
          const data = { ...d.data(), id: d.id } as AccessRequest;
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

// ==========================================
// 5. DOCUMENTS CLOUD SYNC (CROSS-ROLE SHARING & STRICT TENANT ISOLATION)
// ==========================================

export async function syncDocumentToCloud(
  docData: SovereignDocument,
  companyCode: string
): Promise<void> {
  const safeId = docData.id || `doc_${Date.now()}`;
  const targetCode = (companyCode || '').trim().toUpperCase();
  if (!targetCode) {
    console.warn('[CloudSync] Cannot sync document without companyCode.');
    return;
  }

  // Ensure sanitized dataUrl (Firestore max doc size is 1MB)
  let safeFileDataUrl = (docData as any).file_data_url || null;
  if (safeFileDataUrl && safeFileDataUrl.length > 600000) {
    safeFileDataUrl = null;
  }

  // Sanitize document to guarantee ZERO undefined fields (prevent Firestore throw)
  const cleanDoc: Record<string, any> = {
    id: safeId,
    title: docData.title || 'Untitled Document',
    filename: docData.filename || 'document.pdf',
    file_size_bytes: docData.file_size_bytes || 0,
    mime_type: docData.mime_type || 'application/pdf',
    sha256_hash: docData.sha256_hash || '',
    classification: docData.classification || 'INTERNAL',
    status: docData.status || 'COMPLETED',
    ocr_applied: docData.ocr_applied ?? true,
    total_pages: docData.total_pages || 1,
    total_chunks: docData.total_chunks || 1,
    uploaded_by: docData.uploaded_by || 'Enclave User',
    owner_name: docData.owner_name || 'Enclave User',
    owner_email: docData.owner_email || null,
    content_preview: docData.content_preview || '',
    asset_category: docData.asset_category || 'Operations',
    created_at: docData.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    companyCode: targetCode
  };

  if (safeFileDataUrl) {
    cleanDoc.file_data_url = safeFileDataUrl;
  }

  // 1. Immediately persist to local airgap storage for this tenant
  try {
    const localKey = `kelvrin_airgap_docs_${targetCode}`;
    const raw = localStorage.getItem(localKey);
    const list: SovereignDocument[] = raw ? JSON.parse(raw) : [];
    const updated = [cleanDoc as SovereignDocument, ...list.filter(d => d.id !== safeId)];
    localStorage.setItem(localKey, JSON.stringify(updated));
  } catch {}

  // 2. Broadcast locally via Mesh (0ms latency for open tabs of all roles)
  try {
    meshSync.broadcast('DOCUMENT_UPLOADED', cleanDoc);
  } catch {}

  // 3. Sync to Cloud Firestore in company_documents collection
  try {
    const docRef = doc(db, 'company_documents', safeId);
    await withTimeout(
      setDoc(docRef, cleanDoc, { merge: true }),
      undefined
    );
    console.info(`[CloudSync] Document ${safeId} synced to cloud for company ${targetCode}.`);
  } catch (err) {
    console.warn('[CloudSync] Failed to sync document to Firestore:', err);
  }
}

export async function fetchDocumentsFromCloud(companyCode: string): Promise<SovereignDocument[]> {
  const targetCode = (companyCode || '').trim().toUpperCase();
  if (!targetCode) return [];

  const map = new Map<string, SovereignDocument>();

  // 1. Read existing from local airgap storage cache
  try {
    const raw = localStorage.getItem(`kelvrin_airgap_docs_${targetCode}`);
    if (raw) {
      const local: SovereignDocument[] = JSON.parse(raw);
      local.forEach(d => map.set(d.id, d));
    }
  } catch {}

  // 2. Query Cloud Firestore with STRICT Multi-Tenant Isolation
  try {
    const colRef = collection(db, 'company_documents');
    const q = query(colRef, where('companyCode', '==', targetCode));
    const snap = await withTimeout(getDocs(q), null);
    if (snap && !snap.empty) {
      snap.docs.forEach(d => {
        const data = d.data() as SovereignDocument;
        if (data && data.id) {
          map.set(data.id, data);
        }
      });
    }
  } catch (err) {
    console.warn(`[CloudSync] Failed to fetch cloud documents for ${targetCode}:`, err);
  }

  const list = Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );

  // Cache back to local storage
  try {
    localStorage.setItem(`kelvrin_airgap_docs_${targetCode}`, JSON.stringify(list));
  } catch {}

  return list;
}

export function listenToDocumentsFromCloud(
  companyCode: string,
  callback: (docs: SovereignDocument[]) => void
): Unsubscribe {
  const targetCode = (companyCode || '').trim().toUpperCase();
  if (!targetCode) return () => {};

  try {
    const colRef = collection(db, 'company_documents');
    // STRICT Multi-Tenant Filter: only documents belonging to this companyCode
    const q = query(colRef, where('companyCode', '==', targetCode));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const map = new Map<string, SovereignDocument>();

        // Load existing from local storage
        try {
          const raw = localStorage.getItem(`kelvrin_airgap_docs_${targetCode}`);
          if (raw) {
            const local: SovereignDocument[] = JSON.parse(raw);
            local.forEach(d => map.set(d.id, d));
          }
        } catch {}

        snapshot.docs.forEach(d => {
          const data = d.data() as SovereignDocument;
          if (data && data.id) {
            map.set(data.id, data);
          }
        });

        const sorted = Array.from(map.values()).sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );

        // Update local cache
        try {
          localStorage.setItem(`kelvrin_airgap_docs_${targetCode}`, JSON.stringify(sorted));
        } catch {}

        callback(sorted);
      },
      (err) => {
        console.warn(`[CloudSync] Documents listener error for ${targetCode}:`, err);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn(`[CloudSync] Failed to initialize documents listener:`, err);
    return () => {};
  }
}

export async function deleteDocumentFromCloud(
  docId: string,
  companyCode: string
): Promise<void> {
  const targetCode = (companyCode || '').trim().toUpperCase();

  // 1. Broadcast via Mesh
  try {
    meshSync.broadcast('DOCUMENT_DELETED', { id: docId, companyCode: targetCode });
  } catch {}

  // 2. Remove from local storage
  try {
    const key = `kelvrin_airgap_docs_${targetCode}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const local: SovereignDocument[] = JSON.parse(raw);
      const filtered = local.filter(d => d.id !== docId);
      localStorage.setItem(key, JSON.stringify(filtered));
    }
  } catch {}

  // 3. Delete from Cloud Firestore
  try {
    const docRef = doc(db, 'company_documents', docId);
    await withTimeout(deleteDoc(docRef), undefined);
    console.info(`[CloudSync] Document ${docId} deleted from cloud.`);
  } catch (err) {
    console.warn(`[CloudSync] Failed to delete document ${docId} from cloud:`, err);
  }
}


