import { User, UserRole, normalizeRole } from '../types';

export interface AccessRequest {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  companyCode: string;
  companyName?: string;
  avatarUrl?: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  requestedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  authProvider: 'google' | 'air_gap' | 'sso';
}

export interface ActiveSession {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  companyCode: string;
  loginAt: string;
  lastActiveAt: string;
  ipAddress?: string;
  status: 'online' | 'idle';
}

export interface TeamMember {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  password: string;
  companyCode: string;
  department?: string;
  createdAt: string;
  status: 'active' | 'suspended';
  authProvider?: 'google' | 'air_gap' | 'sso';
}

const STORAGE_KEYS = {
  REQUESTS: 'kelvrin_access_requests',
  SESSIONS: 'kelvrin_active_sessions',
  TEAM_MEMBERS: 'kelvrin_team_members',
};

// ==========================================
// ACCESS REQUESTS MANAGEMENT
// ==========================================

export function getAccessRequests(): AccessRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REQUESTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to parse access requests:', err);
    return [];
  }
}

export function saveAccessRequests(requests: AccessRequest[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(requests));
  } catch (err) {
    console.error('Failed to save access requests:', err);
  }
}

export function submitAccessRequest(data: {
  fullName: string;
  email: string;
  role: UserRole;
  companyCode: string;
  companyName?: string;
  avatarUrl?: string;
  authProvider?: 'google' | 'air_gap' | 'sso';
}): AccessRequest {
  const requests = getAccessRequests();
  const normalizedEmail = data.email.trim().toLowerCase();
  const normalizedCode = data.companyCode.trim().toUpperCase();

  // Check if an existing request exists for this email & company code
  const existingIndex = requests.findIndex(
    r => r.email.toLowerCase() === normalizedEmail && r.companyCode.toUpperCase() === normalizedCode
  );

  if (existingIndex >= 0) {
    // If already approved, return it directly
    if (requests[existingIndex].status === 'approved') {
      return requests[existingIndex];
    }
    // Otherwise update timestamp and re-pend
    requests[existingIndex] = {
      ...requests[existingIndex],
      fullName: data.fullName,
      role: data.role,
      avatarUrl: data.avatarUrl || requests[existingIndex].avatarUrl,
      status: 'pending_approval',
      requestedAt: new Date().toISOString(),
    };
    saveAccessRequests(requests);
    return requests[existingIndex];
  }

  const newRequest: AccessRequest = {
    id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    fullName: data.fullName,
    email: normalizedEmail,
    role: data.role,
    companyCode: normalizedCode,
    companyName: data.companyName,
    avatarUrl: data.avatarUrl,
    status: 'pending_approval',
    requestedAt: new Date().toISOString(),
    authProvider: data.authProvider || 'google',
  };

  requests.unshift(newRequest);
  saveAccessRequests(requests);
  return newRequest;
}

export function approveAccessRequest(requestId: string, approvedBy: string = 'Super Admin'): AccessRequest | null {
  const requests = getAccessRequests();
  const index = requests.findIndex(r => r.id === requestId);
  if (index === -1) return null;

  requests[index] = {
    ...requests[index],
    status: 'approved',
    approvedAt: new Date().toISOString(),
    approvedBy,
  };

  saveAccessRequests(requests);

  // Auto-register this approved user in team directory if not already present
  try {
    const members = getTeamMembers();
    const approvedReq = requests[index];
    if (!members.some(m => m.email.toLowerCase() === approvedReq.email.toLowerCase())) {
      const newMember: TeamMember = {
        id: `usr_member_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        username: approvedReq.email.split('@')[0],
        email: approvedReq.email.toLowerCase(),
        fullName: approvedReq.fullName,
        role: approvedReq.role,
        password: '',
        companyCode: approvedReq.companyCode,
        department: 'Operations',
        createdAt: new Date().toISOString(),
        status: 'active',
        authProvider: approvedReq.authProvider || 'google',
      };
      members.unshift(newMember);
      saveTeamMembers(members);
    }
  } catch (err) {
    console.warn('Could not auto-register approved member to team directory:', err);
  }

  // NOTE: We deliberately do NOT call recordActiveSession here!
  // Approving grants authorization; an active online session must only be recorded
  // when the user actually signs in through the login portal.

  return requests[index];
}

export function rejectAccessRequest(requestId: string): AccessRequest | null {
  const requests = getAccessRequests();
  const index = requests.findIndex(r => r.id === requestId);
  if (index === -1) return null;

  requests[index] = {
    ...requests[index],
    status: 'rejected',
  };

  saveAccessRequests(requests);
  return requests[index];
}

export function checkUserApprovalStatus(email: string, companyCode: string): {
  isApproved: boolean;
  isPending: boolean;
  isRejected: boolean;
  request: AccessRequest | null;
} {
  const requests = getAccessRequests();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = companyCode.trim().toUpperCase();

  const req = requests.find(
    r => r.email.toLowerCase() === normalizedEmail && r.companyCode.toUpperCase() === normalizedCode
  );

  if (!req) {
    return { isApproved: false, isPending: false, isRejected: false, request: null };
  }

  return {
    isApproved: req.status === 'approved',
    isPending: req.status === 'pending_approval',
    isRejected: req.status === 'rejected',
    request: req,
  };
}

// ==========================================
// ACTIVE LOGGED-IN SESSIONS TELEMETRY
// ==========================================

export function getActiveSessions(): ActiveSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to parse active sessions:', err);
    return [];
  }
}

export function saveActiveSessions(sessions: ActiveSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  } catch (err) {
    console.error('Failed to save active sessions:', err);
  }
}

export function recordActiveSession(user?: {
  id?: string;
  fullName?: string;
  email?: string;
  role?: UserRole;
  companyCode?: string;
  status?: string;
  permissions?: string[];
} | null): ActiveSession | null {
  if (!user || !user.email) return null;
  const sessions = getActiveSessions();
  const normalizedEmail = (user.email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  const existingIdx = sessions.findIndex(s => s.email && s.email.toLowerCase() === normalizedEmail);
  const now = new Date().toISOString();

  const sessionObj: ActiveSession = {
    id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId: user.id || `usr_${Date.now()}`,
    fullName: user.fullName || normalizedEmail.split('@')[0],
    email: normalizedEmail,
    role: user.role || ('Super Admin' as UserRole),
    companyCode: user.companyCode || 'SOVEREIGN-HQ',
    loginAt: existingIdx >= 0 ? sessions[existingIdx].loginAt : now,
    lastActiveAt: now,
    ipAddress: '127.0.0.1 (Enclave Air-Gap)',
    status: 'online',
  };

  if (existingIdx >= 0) {
    sessions[existingIdx] = sessionObj;
  } else {
    sessions.unshift(sessionObj);
  }

  saveActiveSessions(sessions);
  return sessionObj;
}

export function removeActiveSession(userEmailOrId: string): void {
  const sessions = getActiveSessions();
  const filtered = sessions.filter(
    s => s.userId !== userEmailOrId && s.email.toLowerCase() !== userEmailOrId.toLowerCase()
  );
  saveActiveSessions(filtered);
}

export function terminateSession(sessionId: string): void {
  const sessions = getActiveSessions();
  const filtered = sessions.filter(s => s.id !== sessionId);
  saveActiveSessions(filtered);
}

// ==========================================
// TEAM MEMBERS MANAGEMENT (ADD MEMBER BY SUPER ADMIN)
// ==========================================

export function getTeamMembers(): TeamMember[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TEAM_MEMBERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to parse team members:', err);
    return [];
  }
}

export function saveTeamMembers(members: TeamMember[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TEAM_MEMBERS, JSON.stringify(members));
  } catch (err) {
    console.error('Failed to save team members:', err);
  }
}

export function addTeamMember(member: Omit<TeamMember, 'id' | 'createdAt'>): TeamMember {
  const members = getTeamMembers();
  const normalizedEmail = member.email.trim().toLowerCase();

  // Enforce unique email check across members
  if (members.some(m => m.email.toLowerCase() === normalizedEmail)) {
    throw new Error(`A team member with email "${member.email}" already exists.`);
  }

  // Enforce unique email check against Super Admins
  const admins = getStoredAdmins();
  if (admins.some(a => a.email?.toLowerCase() === normalizedEmail)) {
    throw new Error(`Email "${member.email}" is already registered as a Super Admin.`);
  }

  const newMember: TeamMember = {
    ...member,
    email: normalizedEmail,
    id: `usr_member_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    createdAt: new Date().toISOString(),
  };

  members.unshift(newMember);
  saveTeamMembers(members);
  return newMember;
}

export function validateTeamMemberLogin(
  identifier: string,
  passwordInput: string,
  companyCode?: string
): TeamMember | null {
  const members = getTeamMembers();
  const normalizedId = identifier.trim().toLowerCase();
  const normalizedCode = companyCode?.trim().toUpperCase();

  const found = members.find(m => {
    // Accounts registered with Google OAuth cannot log in via password
    if (m.authProvider === 'google') return false;

    const idMatch = m.username.toLowerCase() === normalizedId || m.email.toLowerCase() === normalizedId;
    const passMatch = m.password === passwordInput;
    const codeMatch = normalizedCode ? m.companyCode.toUpperCase() === normalizedCode : true;
    return idMatch && passMatch && codeMatch;
  });

  return found || null;
}

export function deleteTeamMember(id: string): void {
  const members = getTeamMembers();
  const filtered = members.filter(m => m.id !== id);
  saveTeamMembers(filtered);
}

// ==========================================
// ROLE DEFAULT PERMISSIONS
// ==========================================

export function getRoleDefaultPermissions(role?: string): string[] {
  const norm = normalizeRole(role);
  switch (norm) {
    case 'SUPER_ADMIN':
      return ['*'];
    case 'AI_ADMIN':
      return [
        'documents:read', 'documents:write',
        'deliverables:read', 'deliverables:write',
        'ai:chat', 'ai:execute',
        'agents:execute', 'agents:run',
        'workflow:execute',
        'knowledge:read', 'knowledge:write',
        'analytics:read',
        'models:read', 'models:write',
        'security:read',
        'code:execute',
      ];
    case 'AI_OPERATOR':
      return [
        'documents:read', 'documents:write',
        'deliverables:read',
        'ai:chat', 'ai:execute',
        'agents:execute', 'agents:run',
        'workflow:execute',
        'knowledge:read',
        'analytics:read',
        'models:read',
        'code:execute',
      ];
    case 'APPROVER':
      return [
        'documents:read', 'documents:write',
        'deliverables:read', 'deliverables:write',
        'ai:chat',
        'workflow:execute',
        'analytics:read',
        'knowledge:read',
      ];
    case 'ANALYST':
      return [
        'documents:read', 'documents:write',
        'deliverables:read', 'deliverables:write',
        'ai:chat', 'ai:execute',
        'agents:execute', 'agents:run',
        'code:execute',
        'workflow:execute',
        'analytics:read',
        'knowledge:read',
      ];
    case 'AUDITOR':
      return [
        'audit:read', 'security:read',
        'documents:read', 'deliverables:read',
        'analytics:read',
      ];
    case 'EMPLOYEE':
    default:
      return [
        'documents:read', 'deliverables:read',
        'ai:chat',
        'knowledge:read',
      ];
  }
}

// ==========================================
// REGISTRATION STORAGE HELPERS & COMPANY PROFILE
// ==========================================

export interface CompanyProfile {
  name: string;
  code: string;
  country?: string;
  state?: string;
  district?: string;
  logoDataUrl?: string | null;
  website?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export function getActiveCompany(): CompanyProfile {
  const fallback: CompanyProfile = {
    name: 'Kelvrin Sovereign Enclave',
    code: 'KELV-HQ',
    logoDataUrl: null,
    website: null,
    country: 'IN',
    state: 'TN',
    district: 'Chennai'
  };

  try {
    // 1. Strict Multi-Tenant Enforcement: Check logged-in user's company information FIRST
    const rawUser = localStorage.getItem('kelvrin_user');
    if (rawUser && rawUser !== 'undefined' && rawUser !== 'null') {
      const u = JSON.parse(rawUser);
      if (u && (u.companyCode || u.companyName)) {
        const userCompCode = (u.companyCode || '').trim().toUpperCase();
        const userCompName = (u.companyName || '').trim();
        
        // Match from stored companies list
        const comps = getStoredCompanies();
        const matched = comps.find(c => (c.code || c.companyCode)?.toUpperCase() === userCompCode);
        if (matched) {
          return {
            name: (matched.name || matched.companyName || userCompName || fallback.name).trim(),
            code: userCompCode || fallback.code,
            logoDataUrl: matched.logoDataUrl || matched.logo_url || null,
            website: matched.website || null,
            country: matched.country || fallback.country,
            state: matched.state || fallback.state,
            district: matched.district || fallback.district,
            createdAt: matched.createdAt,
            updatedAt: matched.updatedAt
          };
        }

        // Check if direct kelvrin_company matches this user's company code
        const rawComp = localStorage.getItem('kelvrin_company');
        if (rawComp) {
          try {
            const parsedComp = JSON.parse(rawComp);
            if ((parsedComp.code || parsedComp.companyCode)?.toUpperCase() === userCompCode) {
              return {
                name: parsedComp.name || userCompName || fallback.name,
                code: userCompCode,
                logoDataUrl: parsedComp.logoDataUrl || null,
                website: parsedComp.website || null,
                country: parsedComp.country || fallback.country,
                state: parsedComp.state || fallback.state,
                district: parsedComp.district || fallback.district,
                createdAt: parsedComp.createdAt,
                updatedAt: parsedComp.updatedAt
              };
            }
          } catch {}
        }

        if (userCompName || userCompCode) {
          return {
            name: userCompName || fallback.name,
            code: userCompCode || fallback.code,
            logoDataUrl: null,
            website: null,
            country: fallback.country,
            state: fallback.state,
            district: fallback.district
          };
        }
      }
    }

    // 2. If no user is logged in, check direct kelvrin_company item
    const raw = localStorage.getItem('kelvrin_company');
    if (raw && raw !== 'undefined' && raw !== 'null') {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const resolvedName = (parsed.name || parsed.companyName || parsed.company_name || '').trim();
        const resolvedCode = (parsed.code || parsed.companyCode || parsed.company_code || '').trim().toUpperCase();
        if (resolvedName || resolvedCode) {
          return {
            name: resolvedName || fallback.name,
            code: resolvedCode || fallback.code,
            logoDataUrl: parsed.logoDataUrl || parsed.logo_url || null,
            website: parsed.website || null,
            country: parsed.country || fallback.country,
            state: parsed.state || fallback.state,
            district: parsed.district || fallback.district,
            createdAt: parsed.createdAt,
            updatedAt: parsed.updatedAt
          };
        }
      }
    }

    // 3. Check stored companies collection
    const comps = getStoredCompanies();
    if (comps && comps.length > 0) {
      for (const c of comps) {
        if (c && typeof c === 'object') {
          const resolvedName = (c.name || c.companyName || c.company_name || '').trim();
          const resolvedCode = (c.code || c.companyCode || c.company_code || '').trim().toUpperCase();
          if (resolvedName || resolvedCode) {
            return {
              name: resolvedName || fallback.name,
              code: resolvedCode || fallback.code,
              logoDataUrl: c.logoDataUrl || c.logo_url || null,
              country: c.country || fallback.country,
              state: c.state || fallback.state,
              district: c.district || fallback.district
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('[AccessControl] getActiveCompany fallback used:', err);
  }

  return fallback;
}

export function saveActiveCompany(company: Partial<CompanyProfile>): void {
  try {
    const existing = getActiveCompany();
    const safeCompany: CompanyProfile = {
      name: (company.name || existing.name || 'Kelvrin Sovereign Enclave').trim(),
      code: (company.code || existing.code || 'KELV-HQ').trim().toUpperCase(),
      logoDataUrl: company.logoDataUrl !== undefined ? company.logoDataUrl : (existing.logoDataUrl || null),
      website: company.website !== undefined ? company.website : (existing.website || null),
      country: company.country || existing.country || 'IN',
      state: company.state || existing.state || 'TN',
      district: company.district || existing.district || 'Chennai',
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('kelvrin_company', JSON.stringify(safeCompany));

    const companies = getStoredCompanies();
    const idx = companies.findIndex(c => (c.code || c.companyCode)?.toUpperCase() === safeCompany.code);
    if (idx >= 0) {
      companies[idx] = { ...companies[idx], ...safeCompany };
    } else {
      companies.push(safeCompany);
    }
    localStorage.setItem('kelvrin_companies', JSON.stringify(companies));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kelvrin_company_updated'));
    }
  } catch (err) {
    console.error('Failed to save active company:', err);
  }
}

export function purgeEntireOrganization(superAdminPassword: string): { success: boolean; error?: string } {
  try {
    const admins = getStoredAdmins();
    let isPasswordValid = false;

    // Check if password matches any registered Super Admin
    for (const a of admins) {
      if ((a.role === 'Super Admin' || !a.role) && a.password === superAdminPassword) {
        isPasswordValid = true;
        break;
      }
    }

    if (!isPasswordValid) {
      const single = localStorage.getItem('kelvrin_registered_admin');
      if (single) {
        const parsed = JSON.parse(single);
        if (parsed.password === superAdminPassword) {
          isPasswordValid = true;
        }
      }
    }

    if (!isPasswordValid) {
      return { success: false, error: 'Incorrect Super Admin password. Organization purge authorization denied.' };
    }

    // 1. Wipe all organization & auth data from localStorage
    localStorage.removeItem('kelvrin_company');
    localStorage.removeItem('kelvrin_companies');
    localStorage.removeItem('kelvrin_registered_admin');
    localStorage.removeItem('kelvrin_registered_admins');
    localStorage.removeItem('kelvrin_team_members');
    localStorage.removeItem('kelvrin_access_requests');
    localStorage.removeItem('kelvrin_active_sessions');
    localStorage.removeItem('kelvrin_user');
    localStorage.removeItem('kelvrin_mock_user');
    localStorage.removeItem('kelvrin_token');
    localStorage.removeItem('kelvrin_session_token');
    localStorage.removeItem('kelvrin_last_role');
    localStorage.removeItem('kelvrin_last_company_code');
    localStorage.removeItem('kelvrin_authorized_email');
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith('kelvrin_authorized_email_')) {
          localStorage.removeItem(k);
        }
      }
    } catch {}

    // 2. Dispatch events
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kelvrin_company_updated'));
      window.dispatchEvent(new Event('storage'));
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to purge organization.' };
  }
}

export function getStoredAdmins(): any[] {
  try {
    const raw = localStorage.getItem('kelvrin_registered_admins');
    if (raw) return JSON.parse(raw);
    const single = localStorage.getItem('kelvrin_registered_admin');
    return single ? [JSON.parse(single)] : [];
  } catch {
    return [];
  }
}

export function getStoredCompanies(): any[] {
  try {
    const raw = localStorage.getItem('kelvrin_companies');
    if (raw) return JSON.parse(raw);
    const single = localStorage.getItem('kelvrin_company');
    return single ? [JSON.parse(single)] : [];
  } catch {
    return [];
  }
}

// ==========================================
// STRICT EMAIL CONFLICT & CONCURRENT LOGIN PREVENTION
// ==========================================

export function isEmailCurrentlyLoggedIn(email?: string): boolean {
  if (!email) return false;
  const sessions = getActiveSessions();
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  
  const existing = sessions.find(s => s && s.email && s.email.toLowerCase() === normalized && s.status === 'online');
  if (!existing) return false;

  // Stale session expiration: if not active in 30 minutes, release it
  const lastActiveTime = new Date(existing.lastActiveAt || existing.loginAt).getTime();
  const now = Date.now();
  if (now - lastActiveTime > 30 * 60 * 1000) {
    removeActiveSession(email);
    return false;
  }

  return true;
}

export interface EmailConflictResult {
  hasConflict: boolean;
  reason?: string;
  conflictType?: 'active_session' | 'super_admin' | 'team_member' | 'different_company' | 'different_role';
}

/**
 * Enforces strict single-identity rule:
 * 1. An email cannot have multiple concurrent active sessions (unless verifying via Google OAuth in real-time).
 * 2. An email already registered as Super Admin cannot be used in Role Login or Connect with Google.
 * 3. An email cannot be registered across different companies.
 * 4. An email cannot switch roles without administrative authorization.
 */
export function checkEmailConflict(
  email: string,
  intendedRole?: string,
  intendedCompanyCode?: string,
  isGoogleAuth: boolean = false
): EmailConflictResult {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = intendedCompanyCode?.trim().toUpperCase();

  // 1. Concurrent active session check
  // NOTE: When authenticating via Google OAuth (isGoogleAuth = true), cryptographic identity is verified in real-time.
  // We automatically refresh and clear any prior stale session instead of blocking the user from their own account.
  if (!isGoogleAuth && isEmailCurrentlyLoggedIn(normalizedEmail)) {
    return {
      hasConflict: true,
      conflictType: 'active_session',
      reason: `This email (${normalizedEmail}) is already logged in on an active session. Simultaneous logins with the same email are not permitted.`
    };
  }

  // 2. Super Admin email protection
  // Strictly prevent non-Super Admin from using Super Admin's email for any role or account!
  const admins = getStoredAdmins();
  const adminMatch = admins.find(a => a.email?.toLowerCase() === normalizedEmail);
  if (adminMatch) {
    if (intendedRole && intendedRole !== 'Super Admin') {
      return {
        hasConflict: true,
        conflictType: 'super_admin',
        reason: `This email (${normalizedEmail}) is registered as a Super Admin. You cannot use the Super Admin's email to log in or request access as ${intendedRole}. Each role and account must use a unique email.`
      };
    }
  }

  // 3. Team Member email protection
  const members = getTeamMembers();
  const memberMatch = members.find(m => m.email?.toLowerCase() === normalizedEmail);
  if (memberMatch) {
    if (normalizedCode && memberMatch.companyCode.toUpperCase() !== normalizedCode) {
      return {
        hasConflict: true,
        conflictType: 'different_company',
        reason: `This email (${normalizedEmail}) is already registered under Company Code "${memberMatch.companyCode}". It cannot be used under Company "${normalizedCode}".`
      };
    }
    if (!isGoogleAuth && intendedRole && memberMatch.role !== intendedRole) {
      return {
        hasConflict: true,
        conflictType: 'different_role',
        reason: `This email (${normalizedEmail}) is already registered with role "${memberMatch.role}". It cannot be used to log in as "${intendedRole}".`
      };
    }
  }

  // 4. Existing Access Requests check
  const requests = getAccessRequests();
  const reqMatch = requests.find(r => r.email?.toLowerCase() === normalizedEmail);
  if (reqMatch) {
    if (normalizedCode && reqMatch.companyCode.toUpperCase() !== normalizedCode) {
      return {
        hasConflict: true,
        conflictType: 'different_company',
        reason: `This email (${normalizedEmail}) is already registered with Company Code "${reqMatch.companyCode}". It cannot be used for Company "${normalizedCode}".`
      };
    }
    if (!isGoogleAuth && intendedRole && reqMatch.role !== intendedRole && reqMatch.status === 'approved') {
      return {
        hasConflict: true,
        conflictType: 'different_role',
        reason: `This email (${normalizedEmail}) is already authorized as "${reqMatch.role}". It cannot be used for role "${intendedRole}".`
      };
    }
    if (reqMatch.status === 'rejected') {
      return {
        hasConflict: true,
        conflictType: 'different_role',
        reason: `Access request for (${normalizedEmail}) was declined by the Super Admin.`
      };
    }
  }

  return { hasConflict: false };
}
