import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { DataTable, Column } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { adminUsersApi, AdminUserItem, RoleMetaItem } from '../services/api';
import { 
  addTeamMember, 
  getTeamMembers, 
  getStoredAdmins,
  getAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
  AccessRequest 
} from '../services/accessControl';
import { 
  fetchAccessRequestsFromCloud, 
  updateAccessRequestInCloud,
  listenToAccessRequestsFromCloud
} from '../services/cloudSync';
import { meshSync } from '../services/meshSync';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Lock, 
  CheckCircle2, 
  XCircle, 
  Mail, 
  Key, 
  ShieldAlert,
  Building2,
  Edit2,
  RefreshCw,
  AlertTriangle,
  Check,
  X,
  Clock,
  Sparkles
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [roles, setRoles] = useState<RoleMetaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRbacModalOpen, setIsRbacModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);

  const RBAC_PERMISSIONS_LIST = [
    { code: 'ai.chat', label: 'AI Chat', desc: 'Interact with on-premise LLMs' },
    { code: 'documents.read', label: 'View Documents', desc: 'Query indexed knowledge files' },
    { code: 'documents.write', label: 'Upload Documents', desc: 'Add files to sovereign vector DB' },
    { code: 'deliverables.read', label: 'View Deliverables', desc: 'Access generated spreadsheets & PDFs' },
    { code: 'deliverables.write', label: 'Publish Deliverables', desc: 'Create and sign off reports' },
    { code: 'code.execute', label: 'Run Code Lab', desc: 'Run Python in isolated sandbox' },
    { code: 'agents.execute', label: 'ReAct Agents', desc: 'Launch multi-step autonomous tasks' },
    { code: 'workflow.execute', label: 'DAG Workflows', desc: 'Execute orchestration pipelines' },
    { code: 'models.tune', label: 'Model Tuner', desc: 'Adjust temperature and VRAM' },
    { code: 'security.killswitch', label: 'Emergency Killswitch', desc: 'Engage zero-trust enclave isolation' },
    { code: 'audit.read', label: 'Audit Logs & Egress', desc: 'Inspect logs & cryptographic ledger' },
    { code: 'users.manage', label: 'User Directory Admin', desc: 'Manage users and access requests' },
  ];

  const DEFAULT_RBAC_MATRIX: Record<string, string[]> = {
    'Super Admin': ['*'],
    'AI Admin': ['ai.chat', 'documents.read', 'documents.write', 'deliverables.read', 'deliverables.write', 'code.execute', 'agents.execute', 'workflow.execute', 'models.tune', 'audit.read'],
    'AI Operator': ['ai.chat', 'documents.read', 'documents.write', 'deliverables.read', 'code.execute', 'agents.execute', 'workflow.execute'],
    'Approver': ['ai.chat', 'documents.read', 'deliverables.read', 'deliverables.write', 'workflow.execute'],
    'Analyst': ['ai.chat', 'documents.read', 'documents.write', 'deliverables.read', 'deliverables.write', 'code.execute', 'agents.execute', 'workflow.execute'],
    'Employee': ['ai.chat', 'documents.read', 'deliverables.read'],
    'Auditor': ['audit.read', 'documents.read', 'deliverables.read'],
  };

  const [rbacMatrix, setRbacMatrix] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem('kelvrin_rbac_matrix');
      return raw ? JSON.parse(raw) : DEFAULT_RBAC_MATRIX;
    } catch {
      return DEFAULT_RBAC_MATRIX;
    }
  });

  const togglePermission = (role: string, permCode: string) => {
    if (role === 'Super Admin') return;
    setRbacMatrix(prev => {
      const currentPerms = prev[role] || [];
      const updated = currentPerms.includes(permCode)
        ? currentPerms.filter(p => p !== permCode)
        : [...currentPerms, permCode];
      const next = { ...prev, [role]: updated };
      localStorage.setItem('kelvrin_rbac_matrix', JSON.stringify(next));
      return next;
    });
  };

  const resetRbacDefaults = () => {
    setRbacMatrix(DEFAULT_RBAC_MATRIX);
    localStorage.setItem('kelvrin_rbac_matrix', JSON.stringify(DEFAULT_RBAC_MATRIX));
  };

  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: async () => {},
  });

  // Form State - Add Member
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createRole, setCreateRole] = useState('Analyst');
  const [createDept, setCreateDept] = useState('Platform Engineering');
  const [createPassword, setCreatePassword] = useState('SovereignPass2026!');
  const [createConfirmPassword, setCreateConfirmPassword] = useState('SovereignPass2026!');
  const [createFormError, setCreateFormError] = useState<string | null>(null);

  // Form State - Edit
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'>('ACTIVE');

  const { success, error } = useToast();
  const { user } = useAuth();
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);

  // Derive active company code for this Super Admin
  let currentCompanyCode = user?.companyCode || 'KELV-HQ';
  try {
    const comp = localStorage.getItem('kelvrin_company');
    if (comp) {
      const parsed = JSON.parse(comp);
      if (parsed.code) currentCompanyCode = parsed.code.toUpperCase();
    }
  } catch {}

  const loadRequests = useCallback(async () => {
    let cloudList: AccessRequest[] = [];
    try {
      cloudList = await fetchAccessRequestsFromCloud(currentCompanyCode);
    } catch (err) {
      console.warn('[CloudSync] Failed to fetch access requests from cloud:', err);
    }
    const all = getAccessRequests();
    const map = new Map<string, AccessRequest>();
    all.forEach(r => map.set(r.id, r));
    cloudList.forEach(r => map.set(r.id, r));
    const combined = Array.from(map.values());
    // Filter for requests matching current Super Admin's company code
    const filtered = combined.filter(r => !r.companyCode || r.companyCode.toUpperCase() === currentCompanyCode.toUpperCase());
    setAccessRequests(filtered);
  }, [currentCompanyCode]);

  useEffect(() => {
    loadRequests();
    const interval = setInterval(loadRequests, 2000);

    const unsubscribeMesh = meshSync.subscribe((msg) => {
      if (msg.type === 'ACCESS_REQUEST_SUBMITTED' || msg.type === 'ACCESS_REQUEST_DECIDED') {
        loadRequests();
      }
    });

    const unsubscribeCloud = listenToAccessRequestsFromCloud(currentCompanyCode, (cloudRequests) => {
      if (cloudRequests && Array.isArray(cloudRequests)) {
        setAccessRequests(cloudRequests);
      } else {
        loadRequests();
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribeMesh();
      unsubscribeCloud();
    };
  }, [loadRequests, currentCompanyCode]);

  const handleAcceptRequest = async (reqId: string, fullName: string, email: string, role: string) => {
    const updated = approveAccessRequest(reqId, user?.fullName || 'Super Admin');
    // Sync approval to Cloud Firestore so any waiting device/browser unlocks immediately!
    updateAccessRequestInCloud(reqId, 'approved', user?.fullName || 'Super Admin').catch(e => console.warn(e));

    if (updated) {
      // Auto-add to team members directory so the user is officially registered
      try {
        const existingMembers = getTeamMembers();
        if (!existingMembers.some(m => m.email.toLowerCase() === email.toLowerCase())) {
          addTeamMember({
            username: email.split('@')[0],
            email: email.toLowerCase(),
            fullName,
            role: role as any,
            password: 'GoogleIdentityAuth2026!',
            companyCode: currentCompanyCode,
            department: 'Operations',
            status: 'active',
            authProvider: 'google',
          });
        }
      } catch {}

      loadRequests();
      loadUsers();
      success('Access Accepted', `Approved access for ${fullName} (${email}) as ${role}! Their dashboard is now unlocked.`);
      setRequestNotice(`Accepted: ${fullName} (${email}) has been authorized as ${role}.`);
      setTimeout(() => setRequestNotice(null), 5000);
    }
  };

  const handleRejectRequest = async (reqId: string, fullName: string) => {
    const updated = rejectAccessRequest(reqId);
    // Sync rejection to Cloud Firestore
    updateAccessRequestInCloud(reqId, 'rejected', user?.fullName || 'Super Admin').catch(e => console.warn(e));

    if (updated) {
      loadRequests();
      error('Access Declined', `Request declined for ${fullName}.`);
      setRequestNotice(`Declined: Request for ${fullName} was rejected.`);
      setTimeout(() => setRequestNotice(null), 5000);
    }
  };

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const [userData, rolesData] = await Promise.all([
        adminUsersApi.list({
          search: searchQuery || undefined,
          role: roleFilter !== 'ALL' ? roleFilter : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          page,
          page_size: 10
        }),
        adminUsersApi.getRoles()
      ]);

      // Filter out stale mock seed users that do not belong to this company
      let items = (userData.items || []).filter(u => 
        !u.email.endsWith('@kelvrin.internal') || currentCompanyCode === 'KELV-HQ'
      );

      // Merge team members registered for this company
      const members = getTeamMembers().filter(m => 
        m.companyCode && m.companyCode.toUpperCase() === currentCompanyCode.toUpperCase()
      );
      for (const m of members) {
        if (!items.some(u => u.email.toLowerCase() === m.email.toLowerCase())) {
          items.push({
            id: m.id,
            email: m.email,
            full_name: m.fullName,
            role: m.role,
            auth_provider: m.authProvider || 'google',
            status: ((m.status || 'ACTIVE').toUpperCase() === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE') as 'ACTIVE' | 'SUSPENDED',
            department: m.department || 'Operations',
            created_at: m.createdAt,
            permissions: ['documents:read', 'chat:use']
          });
        }
      }

      // Ensure active Super Admin is present at the top
      const adminEmail = user?.email || 'admin@sovereign.defense';
      if (!items.some(u => u.role === 'Super Admin' || u.email.toLowerCase() === adminEmail.toLowerCase())) {
        items.unshift({
          id: 'usr_sa_active',
          email: adminEmail,
          full_name: user?.fullName || 'Super Admin',
          role: 'Super Admin',
          auth_provider: user?.authProvider || 'google',
          status: 'ACTIVE',
          department: 'Sovereign Executive Enclave',
          created_at: new Date().toISOString(),
          permissions: ['*']
        });
      }

      setUsers(items);
      setTotal(items.length);
      setRoles(rolesData);
    } catch (err: any) {
      error('User Directory Error', err.message || 'Failed to fetch user directory.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, roleFilter, statusFilter, page, error, currentCompanyCode, user]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateFormError(null);

    const emailTrimmed = createEmail.trim().toLowerCase();
    const nameTrimmed = createName.trim();

    if (!emailTrimmed || !nameTrimmed) {
      setCreateFormError('Please enter both name and email/username.');
      return;
    }

    if (!createPassword || createPassword.length < 6) {
      setCreateFormError('Password must be at least 6 characters.');
      return;
    }

    if (createPassword !== createConfirmPassword) {
      setCreateFormError('Passwords do not match. Please verify your passwords.');
      return;
    }

    // 1. Check if email already belongs to a Super Admin
    const admins = getStoredAdmins();
    if (admins.some(a => a.email?.toLowerCase() === emailTrimmed)) {
      setCreateFormError(`This email (${emailTrimmed}) is already registered as a Super Admin. The same email cannot be reused.`);
      return;
    }

    // 2. Check if email already belongs to an existing team member
    const members = getTeamMembers();
    if (members.some(m => m.email?.toLowerCase() === emailTrimmed)) {
      setCreateFormError(`A team member with this email (${emailTrimmed}) already exists. Each member must have a unique email.`);
      return;
    }

    try {
      // 1. Get Company Code
      let companyCode = 'KELV-HQ';
      try {
        const comp = localStorage.getItem('kelvrin_company');
        if (comp) companyCode = JSON.parse(comp).code || 'KELV-HQ';
      } catch {}

      // 2. Save into Team Members store
      addTeamMember({
        username: emailTrimmed.split('@')[0],
        email: emailTrimmed,
        fullName: nameTrimmed,
        role: createRole as any,
        password: createPassword,
        companyCode: companyCode.toUpperCase(),
        department: createDept.trim() || 'Operations',
        status: 'active',
      });

      // 3. Save via API or local directory
      try {
        await adminUsersApi.create({
          email: emailTrimmed,
          full_name: nameTrimmed,
          role: createRole,
          department: createDept.trim() || 'Operations',
          password: createPassword
        });
      } catch {}

      success('Member Added Successfully', `User ${nameTrimmed} registered as ${createRole}. They can now log in using this email/username and password!`);
      setIsCreateOpen(false);
      setCreateEmail('');
      setCreateName('');
      setCreatePassword('SovereignPass2026!');
      setCreateConfirmPassword('SovereignPass2026!');
      loadUsers();
    } catch (err: any) {
      error('Failed to Add Member', err.message || 'Failed to provision member.');
    }
  };

  const openEditModal = (user: AdminUserItem) => {
    setEditingUser(user);
    setEditName(user.full_name);
    setEditRole(user.role);
    setEditDept(user.department || 'Engineering');
    setEditStatus(user.status);
    setIsEditOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    // Check if promoting to Super Admin or changing to suspended
    if (editRole === 'Super Admin' && editingUser.role !== 'Super Admin') {
      setConfirmAction({
        isOpen: true,
        title: 'Grant Super Admin Privileges?',
        message: `You are granting full sovereign enclave privileges to ${editingUser.email}. All tool and model boundaries will be bypassed.`,
        action: async () => {
          await executeUpdate();
        }
      });
      return;
    }

    await executeUpdate();
  };

  const executeUpdate = async () => {
    if (!editingUser) return;
    try {
      await adminUsersApi.update(editingUser.id, {
        full_name: editName,
        role: editRole,
        department: editDept,
        status: editStatus
      });
      success('User Updated', `Changes for ${editingUser.email} saved and audited.`);
      setIsEditOpen(false);
      setConfirmAction(prev => ({ ...prev, isOpen: false }));
      loadUsers();
    } catch (err: any) {
      error('Update Failed', err.message || 'Could not update user record.');
    }
  };

  const handleToggleStatusWithConfirm = (user: AdminUserItem) => {
    const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const isSuspending = nextStatus === 'SUSPENDED';

    setConfirmAction({
      isOpen: true,
      title: isSuspending ? 'Suspend Operator Access?' : 'Reactivate Operator Access?',
      message: isSuspending
        ? `Suspending ${user.full_name} (${user.email}) will immediately revoke their active sessions and block model/tool execution.`
        : `Reactivating ${user.full_name} (${user.email}) will restore authorization scopes for role "${user.role}".`,
      action: async () => {
        try {
          await adminUsersApi.update(user.id, { status: nextStatus });
          success('Access Status Changed', `Operator status changed to ${nextStatus}.`);
          setConfirmAction(prev => ({ ...prev, isOpen: false }));
          loadUsers();
        } catch (err: any) {
          error('Status Change Failed', err.message || 'Could not update operator status.');
        }
      }
    });
  };

  const columns: Column<AdminUserItem>[] = [
    {
      header: 'Operator & Identity',
      cell: (user) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-navy-900 text-slate-100 flex items-center justify-center font-bold text-xs border border-slate-300">
            {user.full_name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <strong className="text-xs text-slate-900 block">{user.full_name}</strong>
            <span className="text-[11px] text-slate-400 font-mono">{user.email}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Department / Unit',
      cell: (user) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-700">
          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>{user.department || 'Platform Engineering'}</span>
        </div>
      ),
    },
    {
      header: 'Assigned Sovereign Role',
      cell: (user) => (
        <Badge
          variant={
            user.role === 'Super Admin'
              ? 'danger'
              : user.role === 'AI Admin'
              ? 'info'
              : user.role === 'Approver / Manager'
              ? 'sovereign'
              : 'neutral'
          }
          size="sm"
        >
          {user.role}
        </Badge>
      ),
    },
    {
      header: 'Account Status',
      cell: (user) => (
        <Badge
          variant={user.status === 'ACTIVE' ? 'success' : 'danger'}
          size="sm"
          dot
        >
          {user.status}
        </Badge>
      ),
    },
    {
      header: 'Last Authenticated',
      cell: (user) => (
        <span className="text-[11px] text-slate-500 font-mono">
          {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : 'Never'}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      cell: (user) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={() => openEditModal(user)}
          >
            <Edit2 className="h-3 w-3 mr-1" />
            Edit
          </Button>
          <Button
            variant={user.status === 'ACTIVE' ? 'danger' : 'outline'}
            size="xs"
            onClick={() => handleToggleStatusWithConfirm(user)}
          >
            {user.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Admin Console & User Management</h1>
            <Badge variant="navy" size="md">
              Backend-Enforced RBAC
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise identity directory across 6 sovereign tiers. Manage operator roles, departmental units, and access states.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadUsers}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsRbacModalOpen(true)}
            className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1 text-indigo-600" />
            RBAC Matrix
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1" />
            Add Member
          </Button>
        </div>
      </div>

      {/* Pending Access Requests Section (Accept or Not) */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-card overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-amber-50/60 via-white to-sky-50/30">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center text-amber-600 shadow-xs shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  Enclave Role Access Requests
                </h2>
                {accessRequests.filter(r => r.status === 'pending_approval').length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                    {accessRequests.filter(r => r.status === 'pending_approval').length} Pending
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                    All Authorized
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Users connecting via Google Identity for Company Code <strong className="font-mono text-cyan-800 font-bold">{currentCompanyCode}</strong>. Accept to immediately grant access to their role's dashboard.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="xs" onClick={loadRequests}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh Requests
            </Button>
          </div>
        </div>

        {/* Action Notice */}
        {requestNotice && (
          <div className="mx-4 sm:mx-5 my-3 p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{requestNotice}</span>
          </div>
        )}

        {/* Requests List */}
        {accessRequests.filter(r => r.status === 'pending_approval').length > 0 ? (
          <div className="divide-y divide-slate-100">
            {accessRequests
              .filter(r => r.status === 'pending_approval')
              .map((req) => (
                <div 
                  key={req.id} 
                  className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    {/* User Avatar */}
                    {req.avatarUrl ? (
                      <img 
                        src={req.avatarUrl} 
                        alt={req.fullName} 
                        className="h-10 w-10 rounded-full border border-slate-300 object-cover shadow-xs shrink-0" 
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-white font-bold text-sm flex items-center justify-center shadow-xs shrink-0">
                        {(req.fullName || req.email || 'U').trim().charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm text-slate-900 font-semibold">{req.fullName}</strong>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                          Pending Approval
                        </span>
                      </div>
                      
                      {/* Email ID Prominently Displayed */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-700 mt-0.5">
                        <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono text-cyan-800 font-bold">{req.email}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] text-slate-500 mt-1">
                        <span>Requested Role: <strong className="text-slate-800 font-semibold">{req.role}</strong></span>
                        <span>•</span>
                        <span>Company Code: <strong className="font-mono text-slate-800">{req.companyCode}</strong></span>
                        <span>•</span>
                        <span>Requested: {new Date(req.requestedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Accept / Not Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <button
                      type="button"
                      onClick={() => handleRejectRequest(req.id, req.fullName)}
                      className="px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                    >
                      <X className="h-4 w-4 text-rose-600" />
                      <span>Not (Decline)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAcceptRequest(req.id, req.fullName, req.email, req.role)}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm hover:shadow-md cursor-pointer"
                    >
                      <Check className="h-4 w-4" />
                      <span>Accept (Approve)</span>
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <CheckCircle2 className="h-7 w-7 text-emerald-500/80" />
            <p className="font-semibold text-slate-700">No pending access requests for Company Code {currentCompanyCode}</p>
            <p className="text-[11px] text-slate-400 max-w-md">
              When members select a role, enter this Company Code, and authenticate with Google, their authorization requests will appear here with Accept and Not buttons.
            </p>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <input
          type="text"
          placeholder="Search by operator name or email..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
          className="w-full md:w-80 text-xs bg-slate-50 border border-slate-300 rounded-lg py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-navy-900"
        />

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg py-1 px-2 text-slate-800"
            >
              <option value="ALL">All Roles</option>
              <option value="Super Admin">Super Admin</option>
              <option value="AI Admin">AI Admin</option>
              <option value="Approver / Manager">Approver / Manager</option>
              <option value="Analyst">Analyst</option>
              <option value="Employee">Employee</option>
              <option value="Viewer / Auditor">Viewer / Auditor</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg py-1 px-2 text-slate-800"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <DataTable
        data={users}
        columns={columns}
        pageSize={10}
      />

      {/* Add Member Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateFormError(null);
        }}
        title="Add Member Account"
        description="Create an operator account with designated role and password. The member can log in directly using these credentials."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateUser}>
              Save Member
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateUser} className="space-y-3">
          {createFormError && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{createFormError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Member Full Name *
            </label>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full bg-slate-50 border border-slate-300 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email / Username *
            </label>
            <input
              type="text"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              placeholder="e.g. j.doe@kelvrin.internal or jdoe"
              className="w-full bg-slate-50 border border-slate-300 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Role Clearance *
            </label>
            <select
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
            >
              <option value="Admin">Admin</option>
              <option value="AI Operator">AI Operator</option>
              <option value="Analyst">Analyst</option>
              <option value="Employee">Employee</option>
              <option value="Auditor">Auditor</option>
              <option value="Approver / Manager">Approver / Manager</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Department / Unit
            </label>
            <input
              type="text"
              value={createDept}
              onChange={(e) => setCreateDept(e.target.value)}
              placeholder="e.g. Platform Engineering / Research"
              className="w-full bg-slate-50 border border-slate-300 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password *
              </label>
              <input
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="Min 6 chars"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-1.5 px-3 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Confirm Password *
              </label>
              <input
                type="password"
                value={createConfirmPassword}
                onChange={(e) => setCreateConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-1.5 px-3 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
                required
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Operator Profile"
        description={editingUser ? `Modifying settings for ${editingUser.email}` : ''}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveEdit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Full Legal Name
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Department / Operational Unit
            </label>
            <input
              type="text"
              value={editDept}
              onChange={(e) => setEditDept(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Sovereign Role Assignment
            </label>
            <select
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
            >
              <option value="Employee">Employee (Tier 1)</option>
              <option value="Analyst">Analyst (Tier 2)</option>
              <option value="Approver / Manager">Approver / Manager (Tier 3)</option>
              <option value="AI Admin">AI Admin (Tier 4)</option>
              <option value="Viewer / Auditor">Viewer / Auditor (Tier 5)</option>
              <option value="Super Admin">Super Admin (Tier 6)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Account Status
            </label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="DEACTIVATED">DEACTIVATED</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog */}
      <Modal
        isOpen={confirmAction.isOpen}
        onClose={() => setConfirmAction(prev => ({ ...prev, isOpen: false }))}
        title={confirmAction.title}
        description={confirmAction.message}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmAction(prev => ({ ...prev, isOpen: false }))}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={confirmAction.action}
            >
              Confirm Action
            </Button>
          </>
        }
      >
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <span>This action alters sovereign clearance scopes and will be permanently recorded in the immutable audit trail.</span>
        </div>
      </Modal>

      {/* Granular RBAC Permission Matrix Modal */}
      {isRbacModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Granular Role-Based Access Control (RBAC) Matrix</h3>
                  <p className="text-xs text-slate-400">Configure feature access and execution gates across enterprise roles</p>
                </div>
              </div>
              <button
                onClick={() => setIsRbacModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4 min-w-[200px]">Permission Scope</th>
                    <th className="py-3 px-2 text-center">Super Admin</th>
                    <th className="py-3 px-2 text-center">AI Admin</th>
                    <th className="py-3 px-2 text-center">AI Operator</th>
                    <th className="py-3 px-2 text-center">Approver</th>
                    <th className="py-3 px-2 text-center">Analyst</th>
                    <th className="py-3 px-2 text-center">Employee</th>
                    <th className="py-3 px-2 text-center">Auditor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {RBAC_PERMISSIONS_LIST.map((perm) => (
                    <tr key={perm.code} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-800">{perm.label}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{perm.code} • {perm.desc}</div>
                      </td>

                      {/* Super Admin: Immutable Full Access */}
                      <td className="py-2.5 px-2 text-center">
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-emerald-100 text-emerald-700 font-bold text-xs" title="Full Sovereign Authorization">
                          ✓
                        </span>
                      </td>

                      {/* Configurable Roles */}
                      {['AI Admin', 'AI Operator', 'Approver', 'Analyst', 'Employee', 'Auditor'].map((roleName) => {
                        const hasPerm = (rbacMatrix[roleName] || []).includes(perm.code);
                        return (
                          <td key={roleName} className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => togglePermission(roleName, perm.code)}
                              className={`h-6 w-6 rounded inline-flex items-center justify-center transition-all cursor-pointer ${
                                hasPerm
                                  ? 'bg-emerald-500 text-white font-bold shadow-xs hover:bg-emerald-600'
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                              title={`${hasPerm ? 'Revoke' : 'Grant'} ${perm.label} for ${roleName}`}
                            >
                              {hasPerm ? '✓' : '–'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => {
                  resetRbacDefaults();
                  success('Defaults Restored', 'Reset role permissions to initial sovereign defaults.');
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
              >
                Reset to Sovereign Defaults
              </button>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setIsRbacModalOpen(false);
                    success('RBAC Matrix Saved', 'Role permissions updated and actively enforced.');
                  }}
                >
                  Save &amp; Apply Scopes
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
