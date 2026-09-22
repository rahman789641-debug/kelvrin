import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { 
  MOCK_METRICS, 
  MOCK_QUERY_TRENDS, 
  MOCK_AGENT_USAGE, 
} from '../services/mockData';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
} from 'recharts';
import { 
  Bot, 
  FileText, 
  Cpu, 
  HardDrive, 
  ShieldCheck, 
  Activity, 
  ArrowUpRight, 
  CheckCircle2, 
  Users,
  UserCheck,
  UserX,
  Clock,
  Check,
  X,
  RefreshCw,
  Sparkles,
  Lock,
  ScrollText,
  Zap,
  Terminal,
  ArrowRight,
  Workflow,
  Layers,
  ShieldAlert,
  BarChart3,
  AlertCircle,
  FileCheck,
  CheckSquare,
  Search
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { normalizeRole } from '../types';
import { GlareAnalyticsSection } from '../components/analytics/GlareAnalyticsSection';
import { 
  getActiveSessions, 
  getAccessRequests, 
  approveAccessRequest, 
  rejectAccessRequest, 
  terminateSession,
  getActiveCompany,
  CompanyProfile,
  ActiveSession,
  AccessRequest 
} from '../services/accessControl';
import { 
  fetchAccessRequestsFromCloud, 
  updateAccessRequestInCloud,
  listenToAccessRequestsFromCloud
} from '../services/cloudSync';
import { meshSync } from '../services/meshSync';
import { 
  getApprovals, 
  decideApproval, 
  ApprovalItem 
} from '../services/approvalService';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { sovereignMode, user } = useAuth();
  const [company, setCompany] = useState<CompanyProfile>(getActiveCompany());

  // Active Sessions & Access Requests state
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'sessions' | 'requests'>('sessions');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Approver / Manager HITL Queue State
  const [approverQueue, setApproverQueue] = useState<ApprovalItem[]>(() => 
    getApprovals().filter(a => a.status === 'PENDING')
  );

  const refreshApprovals = () => {
    setApproverQueue(getApprovals().filter(a => a.status === 'PENDING'));
  };

  const handleApproverDecision = (id: string, decision: 'approved' | 'rejected', title: string) => {
    decideApproval(id, decision === 'approved' ? 'APPROVED' : 'REJECTED', user?.fullName || 'Manager');
    refreshApprovals();
    setActionNotice(`Manager Decision: ${decision === 'approved' ? 'Approved & Authorized' : 'Declined'} "${title}"`);
    setTimeout(() => setActionNotice(null), 4500);
  };

  useEffect(() => {
    refreshApprovals();
    const handleSync = () => refreshApprovals();
    window.addEventListener('kelvrin_approvals_updated', handleSync);
    return () => {
      window.removeEventListener('kelvrin_approvals_updated', handleSync);
    };
  }, []);

  useEffect(() => {
    const handleUpdate = () => setCompany(getActiveCompany());
    window.addEventListener('kelvrin_company_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('kelvrin_company_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const loadTelemetry = async () => {
    try {
      await fetchAccessRequestsFromCloud(user?.companyCode);
    } catch {}
    const sess = getActiveSessions();
    const reqs = getAccessRequests();
    setActiveSessions(Array.isArray(sess) ? sess : []);
    setAccessRequests(Array.isArray(reqs) ? reqs : []);
  };

  useEffect(() => {
    loadTelemetry();
    const interval = setInterval(loadTelemetry, 2500);

    // 1. Subscribe to real-time mesh events for 0ms notification across tabs on same machine
    const unsubscribeMesh = meshSync.subscribe((msg) => {
      if (msg.type === 'ACCESS_REQUEST_SUBMITTED' || msg.type === 'ACCESS_REQUEST_DECIDED') {
        loadTelemetry();
      }
    });

    // 2. Subscribe to Firebase Cloud Firestore for instant cross-laptop real-time reception (< 200ms)
    const unsubscribeCloud = listenToAccessRequestsFromCloud(user?.companyCode, () => {
      loadTelemetry();
    });

    return () => {
      clearInterval(interval);
      unsubscribeMesh();
      unsubscribeCloud();
    };
  }, [user?.companyCode]);

  const handleApproveRequest = (reqId: string) => {
    const updated = approveAccessRequest(reqId, user?.fullName || 'Super Admin');
    updateAccessRequestInCloud(reqId, 'approved', user?.fullName || 'Super Admin').catch(e => console.warn(e));
    if (updated) {
      loadTelemetry();
      setActionNotice(`Access approved for ${updated.fullName} (${updated.email}). Operator activated!`);
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const handleRejectRequest = (reqId: string) => {
    const updated = rejectAccessRequest(reqId);
    updateAccessRequestInCloud(reqId, 'rejected', user?.fullName || 'Super Admin').catch(e => console.warn(e));
    if (updated) {
      loadTelemetry();
      setActionNotice(`Access rejected for ${updated.fullName}.`);
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const handleTerminateSession = (sessId: string, name: string) => {
    terminateSession(sessId);
    loadTelemetry();
    setActionNotice(`Session terminated for ${name}.`);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const getMetricIcon = (name: string) => {
    switch (name) {
      case 'Bot':
        return <Bot className="h-5 w-5 text-indigo-600" />;
      case 'FileText':
        return <FileText className="h-5 w-5 text-blue-600" />;
      case 'Cpu':
        return <Cpu className="h-5 w-5 text-purple-600" />;
      case 'HardDrive':
        return <HardDrive className="h-5 w-5 text-emerald-600" />;
      default:
        return <Activity className="h-5 w-5 text-slate-600" />;
    }
  };

  const getInitial = (name?: string, email?: string) => {
    if (name && name.trim()) return name.trim().charAt(0).toUpperCase();
    if (email && email.trim()) return email.trim().charAt(0).toUpperCase();
    return 'U';
  };

  const userRole = user?.role || 'Super Admin';
  const normRole = normalizeRole(userRole);

  const safeAccessRequests = Array.isArray(accessRequests) ? accessRequests : [];
  const pendingRequests = safeAccessRequests.filter(r => {
    if (!r || r.status !== 'pending_approval') return false;
    if (normRole === 'SUPER_ADMIN') {
      if (!user?.companyCode) return true;
      return !r.companyCode || r.companyCode.toUpperCase() === user.companyCode.toUpperCase();
    }
    return false;
  });

  const getRoleDashboardMeta = () => {
    switch (normRole) {
      case 'EMPLOYEE':
        return {
          title: 'Employee Mission Workspace',
          badgeText: 'Role: Employee',
          badgeVariant: 'success' as const,
          description: 'Enterprise AI assistant, documentation repository, deliverables workbench, and operational workflows.',
          action1: { label: 'Chat with AI Assistant', path: '/ai-assistant', icon: Bot },
          action2: { label: 'Browse Documents', path: '/documents', icon: FileText }
        };
      case 'AI_OPERATOR':
        return {
          title: 'AI Operator Mission Workspace',
          badgeText: 'Role: AI Operator',
          badgeVariant: 'ai' as const,
          description: 'Autonomous agent dispatch, local LLM orchestration, model latency monitoring, and sandbox code execution.',
          action1: { label: 'Dispatch Agent Task', path: '/agents', icon: Bot },
          action2: { label: 'Model Center', path: '/models', icon: Cpu }
        };
      case 'ANALYST':
        return {
          title: 'Analyst Intelligence Workspace',
          badgeText: 'Role: Analyst',
          badgeVariant: 'info' as const,
          description: 'Deep semantic retrieval, knowledge base exploration, query volume metrics, and mission intelligence deliverables.',
          action1: { label: 'Analytics Telemetry', path: '/analytics', icon: Activity },
          action2: { label: 'Knowledge Base', path: '/knowledge-base', icon: HardDrive }
        };
      case 'APPROVER':
        return {
          title: 'Executive Manager & Approval Command',
          badgeText: 'Role: Approver / Manager',
          badgeVariant: 'warning' as const,
          description: 'Human-in-the-loop governance: Workflow authorizations, agent execution sign-offs, and compliance gatekeeping.',
          action1: { label: 'Review Workflows', path: '/workflows', icon: Workflow },
          action2: { label: 'Deliverables Sign-Off', path: '/deliverables', icon: ScrollText }
        };
      case 'AUDITOR':
        return {
          title: 'Auditor Compliance & Governance Workspace',
          badgeText: 'Role: Auditor',
          badgeVariant: 'neutral' as const,
          description: 'Tamper-evident audit logs, sovereignty verification, enclave activity surveillance, and security integrity monitoring.',
          action1: { label: 'View Audit Logs', path: '/audit-logs', icon: ShieldCheck },
          action2: { label: 'Security Surveillance', path: '/security', icon: Activity }
        };
      case 'AI_ADMIN':
        return {
          title: 'Admin Operations Command',
          badgeText: 'Role: Admin',
          badgeVariant: 'sovereign' as const,
          description: 'Operational team telemetry monitoring, inference pipeline control, model status, and sovereign resource oversight.',
          action1: { label: 'System Monitor', path: '/system-monitor', icon: Activity },
          action2: { label: 'Dispatch Agent Task', path: '/agents', icon: Bot }
        };
      default:
        return {
          title: 'Super Admin Sovereign Mission Operations',
          badgeText: 'Role: Super Admin',
          badgeVariant: 'danger' as const,
          description: 'Root sovereignty controller: Zero-leakage enclave governance, user management, identity clearance, and full hardware oversight.',
          action1: { label: 'Upload Document', path: '/documents', icon: FileText },
          action2: { label: 'Dispatch Agent Task', path: '/agents', icon: Bot }
        };
    }
  };

  const roleMeta = getRoleDashboardMeta();

  return (
    <div className="space-y-6">

      {/* Real-Time User Authorization Request Alert Banner for Super Admin */}
      {normRole === 'SUPER_ADMIN' && pendingRequests.length > 0 && pendingRequests[0] && (
        <div className="relative overflow-hidden rounded-xl border-2 border-amber-400/90 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-white p-4 shadow-md backdrop-blur-xs animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-xs shrink-0 mt-0.5">
                <span className="relative flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-white"></span>
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                    <span>🔔 New User Authorization Request</span>
                    <Badge variant="warning" size="sm">
                      {pendingRequests.length} Pending
                    </Badge>
                  </h2>
                </div>
                <p className="text-xs text-amber-900/90 mt-1 leading-relaxed">
                  <span className="font-semibold text-slate-900">{pendingRequests[0].fullName || 'New User'}</span>{' '}
                  <span className="text-slate-600">({pendingRequests[0].email || 'N/A'})</span> is requesting access as role{' '}
                  <span className="font-semibold text-amber-950 px-1.5 py-0.5 bg-amber-100 rounded border border-amber-200">
                    {pendingRequests[0].role || 'Employee'}
                  </span>{' '}
                  for Company <span className="font-mono font-bold text-amber-950">{pendingRequests[0].companyCode || 'DEFAULT'}</span>.
                </p>
                {pendingRequests.length > 1 && (
                  <p className="text-[11px] text-amber-700 font-medium mt-1">
                    +{pendingRequests.length - 1} more pending request(s) awaiting your decision in User Management.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRejectRequest(pendingRequests[0].id)}
                className="text-xs border-amber-300 text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
              >
                <X className="h-3.5 w-3.5 mr-1 text-red-500" />
                Decline
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/users')}
                className="text-xs border-amber-300 text-slate-800 hover:bg-amber-100"
              >
                Review in User Management →
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleApproveRequest(pendingRequests[0].id)}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs font-semibold"
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Accept & Authorize
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Top Banner / Sovereign Executive Command Header with Company Branding */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-950 via-[#071330] to-[#0a1b42] p-6 border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.25)] text-white">
        {/* Subtle background ambient mesh glow */}
        <div className="absolute top-0 right-0 w-96 h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-500/15 via-indigo-500/10 to-transparent pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            {company?.logoDataUrl ? (
              <div className="relative shrink-0">
                <img
                  src={company.logoDataUrl}
                  alt={company?.name || 'Company'}
                  className="h-14 w-14 rounded-2xl object-contain border border-cyan-400/40 bg-slate-900/90 p-1.5 shadow-[0_0_20px_rgba(0,210,255,0.2)]"
                />
                <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-950"></span>
                </span>
              </div>
            ) : (
              <div className="relative shrink-0">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 border border-cyan-400/50 flex items-center justify-center text-white font-black text-2xl shadow-[0_0_25px_rgba(0,210,255,0.3)]">
                  {(company?.name || 'C').trim().charAt(0).toUpperCase() || 'C'}
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-950"></span>
                </span>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-black text-white tracking-tight truncate drop-shadow-sm">{roleMeta.title}</h1>
                <Badge variant={roleMeta.badgeVariant} size="md" className="shadow-xs font-semibold">
                  {roleMeta.badgeText}
                </Badge>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 truncate flex items-center gap-1.5 shadow-xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                  <span>{company?.name || 'Kelvrin Enclave'} &bull; {company?.code || 'KELV-HQ'}</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 shadow-xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{sovereignMode === 'AIR_GAP_LOCAL' ? 'Air-Gapped Sovereign Mode' : 'Local AI Enclave'}</span>
                </span>
              </div>
              <p className="text-xs text-slate-300/90 mt-1.5 leading-relaxed max-w-3xl">
                {roleMeta.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 self-end lg:self-center">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate(roleMeta.action1.path)}
              className="bg-slate-900/80 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-800 hover:border-cyan-400/50 shadow-sm"
            >
              <roleMeta.action1.icon className="h-3.5 w-3.5 text-cyan-400" />
              <span>{roleMeta.action1.label}</span>
            </Button>
            <Button 
              variant="ai" 
              size="sm" 
              onClick={() => navigate(roleMeta.action2.path)}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold shadow-[0_0_20px_rgba(0,210,255,0.3)] border-none"
            >
              <roleMeta.action2.icon className="h-3.5 w-3.5" />
              <span>{roleMeta.action2.label}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          ROLE-TAILORED DASHBOARD CONTENT
          ========================================================================= */}

      {/* 1. EMPLOYEE WORKBENCH */}
      {normRole === 'EMPLOYEE' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* 3 Core Productivity Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* 1. Chat with Enterprise AI */}
            <Card className="border-indigo-100 hover:border-indigo-300 hover:shadow-md transition-all group flex flex-col justify-between p-6">
              <div>
                <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <Bot className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  Chat with Local AI Assistant
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Engage with your private, zero-leakage local LLM. Draft emails, summarize lengthy reports, formulate proposals, and get instant answers grounded in enterprise context.
                </p>
                <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Private on-premise inference</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Contextual Q&A on company docs</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Zero external cloud egress</span>
                  </li>
                </ul>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100">
                <Button 
                  variant="primary" 
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2 justify-center"
                  onClick={() => navigate('/ai-assistant')}
                >
                  <span>Open AI Assistant</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </Card>

            {/* 2. Analyze & Query Documents */}
            <Card className="border-blue-100 hover:border-blue-300 hover:shadow-md transition-all group flex flex-col justify-between p-6">
              <div>
                <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  Enterprise Document Vault
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Search, view, and interrogate approved company manuals, contracts, standard operating procedures, and PDFs with semantic page citations.
                </p>
                <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Instant semantic search</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Verifiable page number citations</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Secure role-restricted access</span>
                  </li>
                </ul>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100">
                <Button 
                  variant="primary" 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 justify-center"
                  onClick={() => navigate('/documents')}
                >
                  <span>Browse Documents</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </Card>

            {/* 3. Generated Deliverables */}
            <Card className="border-cyan-100 hover:border-cyan-300 hover:shadow-md transition-all group flex flex-col justify-between p-6">
              <div>
                <div className="h-12 w-12 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <ScrollText className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-cyan-700 transition-colors">
                  Deliverables & Artifacts
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Access and download verified enterprise deliverables produced by AI agents, including executive summaries, Excel tables, and formatted reports.
                </p>
                <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>One-click .docx / .xlsx downloads</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Executive-ready formatted reports</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Audit trail & timestamped versions</span>
                  </li>
                </ul>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100">
                <Button 
                  variant="primary" 
                  className="w-full bg-cyan-600 hover:bg-cyan-700 text-white gap-2 justify-center"
                  onClick={() => navigate('/deliverables')}
                >
                  <span>View Deliverables</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          </div>

          {/* Quick Start Prompt Workflows */}
          <Card className="border-slate-200">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                  <span>Quick Start AI Prompts & Productivity Workflows</span>
                </CardTitle>
                <CardDescription>
                  Select a verified enterprise prompt to launch the AI Assistant with instant context
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  {
                    title: "Draft Executive Summary",
                    prompt: "Please draft a concise 1-page executive summary of our indexed company documentation, highlighting key milestones and risks.",
                    category: "Synthesis"
                  },
                  {
                    title: "Review Compliance & Policy Alignment",
                    prompt: "Review our vendor agreement terms against standard NDA and confidentiality compliance standards.",
                    category: "Compliance"
                  },
                  {
                    title: "Extract Action Items & Financials",
                    prompt: "Extract all scheduled deliverables, key dates, budget figures, and responsible owners from our project documents.",
                    category: "Extraction"
                  },
                  {
                    title: "Formulate Project Risk Mitigation",
                    prompt: "Generate a structured risk assessment matrix and recommended mitigation steps for current operational deliverables.",
                    category: "Analysis"
                  }
                ].map((item, idx) => (
                  <div 
                    key={idx}
                    onClick={() => navigate(`/ai-assistant?prompt=${encodeURIComponent(item.prompt)}`)}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-indigo-50/50 hover:border-indigo-200 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                        {item.title}
                      </span>
                      <Badge variant="neutral" size="sm">{item.category}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">
                      "{item.prompt}"
                    </p>
                    <div className="mt-2.5 flex items-center text-[11px] font-semibold text-indigo-600 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Launch Prompt</span>
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Knowledge Base Status & Sovereignty Notice */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card compact className="border-emerald-200 bg-emerald-50/30">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg shrink-0 mt-0.5">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">Enterprise Data Sovereignty</h4>
                  <p className="text-xs text-emerald-900/80 mt-1 leading-relaxed">
                    Your conversations, prompt histories, and document queries are processed exclusively within this local enclave. No data is shared externally or sent to third-party cloud providers.
                  </p>
                </div>
              </div>
            </Card>

            <Card compact className="border-blue-200 bg-blue-50/30">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0 mt-0.5">
                  <HardDrive className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-blue-950 uppercase tracking-wider">Approved Knowledge Repositories</h4>
                  <p className="text-xs text-blue-900/80 mt-1 leading-relaxed">
                    Company knowledge collections are indexed and available for semantic retrieval. You have read-only access to approved organizational manuals.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 2. APPROVER / MANAGER COMMAND WORKSPACE */}
      {normRole === 'APPROVER' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Action Notification Banner */}
          {actionNotice && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{actionNotice}</span>
              </div>
              <button onClick={() => setActionNotice(null)} className="text-amber-700 hover:text-amber-900">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* 4 Management KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-amber-200/90 bg-amber-50/20">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Pending HITL Approvals</span>
                  <div className="flex items-center gap-2 mt-1">
                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{approverQueue.length}</h3>
                    {approverQueue.length > 0 && (
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-ping" />
                    )}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
                  <ShieldAlert className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-amber-100">
                <span className="text-amber-800 font-medium">Action Required</span>
                <span className="text-slate-500">{approverQueue.length > 0 ? 'Review below' : 'Queue clear'}</span>
              </div>
            </Card>

            <Card className="hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Supervised Pipelines</span>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">3 Active</h3>
                </div>
                <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
                  <Workflow className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                <span className="text-indigo-600 font-medium">99.2% Node Health</span>
                <span className="text-slate-400">1 Blocked Gate</span>
              </div>
            </Card>

            <Card className="hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Authorized Deliverables</span>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">48 Reports</h3>
                </div>
                <div className="p-2 rounded-lg bg-blue-50 border border-blue-100 text-blue-600">
                  <ScrollText className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                <span className="text-emerald-600 font-medium">100% Policy Adherence</span>
                <span className="text-slate-400">Zero Flags</span>
              </div>
            </Card>

            <Card className="hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approval Turnaround</span>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">1.8 mins</h3>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                <span className="text-emerald-600 font-medium">SLA Exceeded (&lt;15m)</span>
                <span className="text-slate-400">High Velocity</span>
              </div>
            </Card>
          </div>

          {/* Human-in-the-Loop Pending Approvals Queue */}
          <Card className="border-amber-200/90 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-amber-600" />
                  <span>Human-in-the-Loop (HITL) Authorization Queue</span>
                </CardTitle>
                <CardDescription>
                  Review and decide on operational actions, high-risk agent workflows, and deliverable publications requiring managerial clearance
                </CardDescription>
              </div>
              <Badge variant={approverQueue.length > 0 ? 'warning' : 'success'} size="md">
                {approverQueue.length} Pending Decision
              </Badge>
            </CardHeader>
            <CardContent>
              {approverQueue.length > 0 ? (
                <div className="space-y-3">
                  {approverQueue.map((item) => (
                    <div 
                      key={item.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-amber-300 hover:shadow-xs transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900">{item.title}</span>
                          <Badge variant="neutral" size="sm">{item.type}</Badge>
                          <Badge 
                            variant={item.risk === 'HIGH' ? 'danger' : item.risk === 'MEDIUM' ? 'warning' : 'success'} 
                            size="sm"
                          >
                            {item.risk} Risk
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{item.details}</p>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400">
                          <span>Requested by: <strong className="text-slate-700">{item.requester}</strong></span>
                          <span>&bull;</span>
                          <span>{item.timeFormatted || (item as any).time}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleApproverDecision(item.id, 'rejected', item.title)}
                          className="text-xs border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          <span>Decline</span>
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleApproverDecision(item.id, 'approved', item.title)}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs font-semibold"
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          <span>Approve & Authorize</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
                  <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">All Operations Clear</h4>
                  <p className="text-xs text-slate-500 max-w-md">
                    There are no pending Human-in-the-Loop approvals at this time. All agent steps and deliverable releases are authorized.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Workflow DAG Pipelines & Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Workflow className="h-5 w-5 text-indigo-600" />
                    <span>Active Workflow DAG Pipeline Gates</span>
                  </CardTitle>
                  <CardDescription>Multi-step automated workflows currently orchestrated across local infrastructure</CardDescription>
                </div>
                <Button variant="ghost" size="xs" onClick={() => navigate('/workflows')}>
                  Orchestrator →
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  {
                    title: "Regulatory Compliance & Risk Sweep",
                    status: "AWAITING_APPROVAL",
                    currentNode: "Node 5: Manager Sign-Off",
                    progress: 83,
                    eta: "Blocked on Sign-Off"
                  },
                  {
                    title: "Cross-Department Financial Reconciliation",
                    status: "RUNNING",
                    currentNode: "Node 3: DeepSeek-R1 Local Reasoning",
                    progress: 50,
                    eta: "~45s remaining"
                  },
                  {
                    title: "New Document Ingestion & Chunk Indexing",
                    status: "COMPLETED",
                    currentNode: "Node 6: Encrypted Local Archival",
                    progress: 100,
                    eta: "Completed"
                  }
                ].map((wf, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900">{wf.title}</span>
                      <Badge 
                        variant={wf.status === 'AWAITING_APPROVAL' ? 'warning' : wf.status === 'RUNNING' ? 'ai' : 'success'}
                        size="sm"
                      >
                        {wf.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          wf.status === 'AWAITING_APPROVAL' ? 'bg-amber-500' : wf.status === 'RUNNING' ? 'bg-indigo-600' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${wf.progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{wf.currentNode}</span>
                      <span className="font-medium text-slate-700">{wf.eta}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Approver Quick Management Action Launcher */}
            <Card>
              <CardHeader>
                <CardTitle>Governance Actions</CardTitle>
                <CardDescription>Rapid management operations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {[
                  { title: "Manage Workflows", desc: "Inspect & trigger DAG nodes", path: "/workflows", icon: Workflow, color: "text-indigo-600 bg-indigo-50" },
                  { title: "Review Deliverables", desc: "Audit generated reports & spreadsheets", path: "/deliverables", icon: ScrollText, color: "text-cyan-600 bg-cyan-50" },
                  { title: "Browse Document Vault", desc: "Verify indexed company manuals", path: "/documents", icon: FileText, color: "text-blue-600 bg-blue-50" },
                  { title: "Platform Analytics", desc: "Inspect query throughput and telemetry", path: "/analytics", icon: BarChart3, color: "text-purple-600 bg-purple-50" },
                ].map((act, idx) => {
                  const Icon = act.icon;
                  return (
                    <div 
                      key={idx}
                      onClick={() => navigate(act.path)}
                      className="p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${act.color} group-hover:scale-105 transition-transform`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{act.title}</p>
                          <p className="text-[11px] text-slate-400">{act.desc}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* 3. ANALYST INTELLIGENCE WORKSPACE */}
      {normRole === 'ANALYST' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* 4 Intelligence Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Semantic Retrievals</span>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">3,420</h3>
                </div>
                <div className="p-2 rounded-lg bg-blue-50 border border-blue-100 text-blue-600">
                  <Search className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                <span className="text-emerald-600 font-medium">+14.2% this week</span>
                <span className="text-slate-400">High Precision</span>
              </div>
            </Card>

            <Card className="hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Synthesized Documents</span>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">184 Docs</h3>
                </div>
                <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
                  <FileText className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                <span className="text-indigo-600 font-medium">Full Citations Grounded</span>
                <span className="text-slate-400">Zero Hallucinations</span>
              </div>
            </Card>

            <Card className="hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Code Lab Notebooks</span>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">42 Runs</h3>
                </div>
                <div className="p-2 rounded-lg bg-cyan-50 border border-cyan-100 text-cyan-600">
                  <Terminal className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                <span className="text-cyan-600 font-medium">Isolated gVisor</span>
                <span className="text-slate-400">100% Success</span>
              </div>
            </Card>

            <Card className="hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vector Query Latency</span>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">24 ms</h3>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600">
                  <HardDrive className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                <span className="text-emerald-600 font-medium">BGE-M3 (1024d)</span>
                <span className="text-slate-400">HNSW Index</span>
              </div>
            </Card>
          </div>

          {/* Analytical Tool Launchpad */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start gap-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-left transition-all"
              onClick={() => navigate('/ai-assistant')}
            >
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Deep Research Assistant</span>
                <span className="text-[11px] text-slate-500">Query grounded documentation with page citations</span>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start gap-2 border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-left transition-all"
              onClick={() => navigate('/knowledge-base')}
            >
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Vector Knowledge Explorer</span>
                <span className="text-[11px] text-slate-500">Inspect embedding cosine clusters and chunk distributions</span>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start gap-2 border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/40 text-left transition-all"
              onClick={() => navigate('/code-lab')}
            >
              <div className="p-2 rounded-lg bg-cyan-50 text-cyan-600">
                <Terminal className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Code Lab Data Sandbox</span>
                <span className="text-[11px] text-slate-500">Execute Python scripts and tabular data processing</span>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start gap-2 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40 text-left transition-all"
              onClick={() => navigate('/analytics')}
            >
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Analytics & Telemetry</span>
                <span className="text-[11px] text-slate-500">Examine platform query volumes & resource trends</span>
              </div>
            </Button>
          </div>

          {/* Interactive 3D GlareCard Neural Telemetry & Analytics (Full Extended Suite) */}
          <GlareAnalyticsSection compact={false} />

          <div className="grid grid-cols-1 gap-6">
            {/* Departmental Knowledge Corpora */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Indexed Corpora</CardTitle>
                  <CardDescription>Active domain knowledge</CardDescription>
                </div>
                <Button variant="ghost" size="xs" onClick={() => navigate('/knowledge-base')}>
                  View All
                </Button>
              </CardHeader>
              <CardContent className="space-y-3.5">
                {[
                  { name: "Engineering & Architecture", chunks: "4,120 chunks", health: "99.4%", color: "bg-blue-500" },
                  { name: "Regulatory & Compliance", chunks: "6,850 chunks", health: "100%", color: "bg-emerald-500" },
                  { name: "Financial & Operational", chunks: "3,920 chunks", health: "98.9%", color: "bg-purple-500" },
                  { name: "Security Protocols & SOPs", chunks: "2,140 chunks", health: "100%", color: "bg-cyan-500" },
                ].map((corp, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${corp.color}`} />
                        <span className="font-semibold text-slate-800 truncate max-w-[140px]">{corp.name}</span>
                      </div>
                      <Badge variant="success" size="sm">{corp.health}</Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 pl-4">{corp.chunks} &bull; AES-256 Encrypted</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Quick Analytical Synthesis Workflows */}
          <Card className="border-slate-200">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                  <span>Deep Analytical Synthesis Prompts</span>
                </CardTitle>
                <CardDescription>
                  Pre-configured intelligence prompts designed for rigorous research, data extraction, and comparative analysis
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  {
                    title: "Cross-Document Trend & Variance Analysis",
                    prompt: "Perform a cross-document comparative analysis of our indexed reports, identifying key variances, trend shifts, and anomalous metrics.",
                    category: "Comparative"
                  },
                  {
                    title: "Generate Quantitative Risk Matrix Table",
                    prompt: "Formulate a comprehensive quantitative risk assessment matrix from indexed documentation, detailing probability, severity, and mitigation owners.",
                    category: "Risk Model"
                  },
                  {
                    title: "Synthesize Quarterly Policy Delta Digest",
                    prompt: "Extract all regulatory updates and policy changes introduced across our indexed materials over the last two quarters with citations.",
                    category: "Regulatory"
                  },
                  {
                    title: "Extract Financial Deliverables & Line Items",
                    prompt: "Extract all scheduled deliverables, cost breakdowns, and budgetary allocations into a structured tabular Markdown format.",
                    category: "Financial"
                  }
                ].map((item, idx) => (
                  <div 
                    key={idx}
                    onClick={() => navigate(`/ai-assistant?prompt=${encodeURIComponent(item.prompt)}`)}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-200 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                        {item.title}
                      </span>
                      <Badge variant="neutral" size="sm">{item.category}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">
                      "{item.prompt}"
                    </p>
                    <div className="mt-2.5 flex items-center text-[11px] font-semibold text-blue-600 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Launch Analysis</span>
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 2. AUDITOR WORKSPACE */}
      {normRole === 'AUDITOR' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* 4 Compliance Integrity Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-emerald-200 bg-emerald-50/20">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Data Sovereignty</span>
                  <h3 className="text-2xl font-bold text-emerald-950 mt-1 tracking-tight">100%</h3>
                </div>
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-emerald-100">
                <span className="text-emerald-700 font-medium">Air-Gap Verified</span>
                <span className="text-slate-400">0 Leakage</span>
              </div>
            </Card>

            <Card className="border-blue-200 bg-blue-50/20">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Audit Events</span>
                  <h3 className="text-2xl font-bold text-blue-950 mt-1 tracking-tight">24,812</h3>
                </div>
                <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                  <ScrollText className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-blue-100">
                <span className="text-blue-700 font-medium">Append-Only</span>
                <span className="text-slate-400">Tamper-Evident</span>
              </div>
            </Card>

            <Card className="border-indigo-200 bg-indigo-50/20">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">SHA-256 Ledger Chain</span>
                  <h3 className="text-2xl font-bold text-indigo-950 mt-1 tracking-tight">Verified</h3>
                </div>
                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
                  <Lock className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-indigo-100">
                <span className="text-emerald-600 font-medium">0 Collisions</span>
                <span className="text-slate-400">Continuously Signed</span>
              </div>
            </Card>

            <Card className="border-cyan-200 bg-cyan-50/20">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-cyan-700 uppercase tracking-wider">Outbound Egress</span>
                  <h3 className="text-2xl font-bold text-cyan-950 mt-1 tracking-tight">0 Packets</h3>
                </div>
                <div className="p-2 rounded-lg bg-cyan-100 text-cyan-700">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-cyan-100">
                <span className="text-emerald-600 font-medium">Enclave Sealed</span>
                <span className="text-slate-400">Hardware Isolated</span>
              </div>
            </Card>
          </div>

          {/* Governance Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start gap-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left"
              onClick={() => navigate('/audit-logs')}
            >
              <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
                <ScrollText className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Tamper-Evident Audit Logs</span>
                <span className="text-[11px] text-slate-500">Inspect cryptographically signed event records</span>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start gap-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left"
              onClick={() => navigate('/security')}
            >
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Security Surveillance</span>
                <span className="text-[11px] text-slate-500">Live enclave integrity & network isolation</span>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start gap-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left"
              onClick={() => navigate('/analytics')}
            >
              <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">System Analytics Telemetry</span>
                <span className="text-[11px] text-slate-500">Operational query volume and resource trends</span>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start gap-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left"
              onClick={() => navigate('/documents')}
            >
              <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Repository Verification</span>
                <span className="text-[11px] text-slate-500">Inspect indexed documents & permission scopes</span>
              </div>
            </Button>
          </div>

          {/* Compliance Checklist & Real-time Audit Stream Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Compliance & Sovereignty Architecture Checklist</CardTitle>
                  <CardDescription>Independent regulatory verification of on-premise infrastructure</CardDescription>
                </div>
                <Badge variant="success" size="sm">Fully Compliant</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  {
                    control: "Local Inference Air-Gap Guarantee",
                    standard: "ISO/IEC 27001 & SOC 2 Type II",
                    status: "Passed",
                    desc: "DeepSeek-R1 running on local GPUs with zero external API calls."
                  },
                  {
                    control: "Immutable Audit Log Chaining",
                    standard: "NIST SP 800-92",
                    status: "Passed",
                    desc: "Every query, login, and export is hashed with SHA-256 and chained."
                  },
                  {
                    control: "At-Rest & In-Flight Encryption",
                    standard: "FIPS 140-3 Level 2",
                    status: "Passed",
                    desc: "Vector embeddings and sqlite/pgvector stores encrypted with AES-256-GCM."
                  },
                  {
                    control: "Strict Role-Based Access Separation",
                    standard: "Common Criteria EAL4+",
                    status: "Passed",
                    desc: "Non-superadmin roles strictly blocked from user provisioning or company resets."
                  }
                ].map((item, i) => (
                  <div key={i} className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{item.control}</span>
                        <Badge variant="neutral" size="sm">{item.standard}</Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">{item.desc}</p>
                    </div>
                    <Badge variant="success" size="sm" className="shrink-0">{item.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Tamper-Evident Ledger Stream (Read-Only)</CardTitle>
                  <CardDescription>Continuous cryptographic append stream</CardDescription>
                </div>
                <Button variant="ghost" size="xs" onClick={() => navigate('/audit-logs')}>
                  Full Log Ledger →
                </Button>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {[
                  { action: "ENCLAVE_SESSION_AUTH", actor: user?.fullName || "Operator", time: "Just now", hash: "a8f9c1...3e7b" },
                  { action: "DOCUMENT_SEMANTIC_QUERY", actor: "Employee", time: "3m ago", hash: "4d12e8...9a0c" },
                  { action: "DELIVERABLE_EXPORT_DOCX", actor: "Analyst", time: "12m ago", hash: "7b89f0...112e" },
                  { action: "AIR_GAP_EGRESS_VERIFIED", actor: "System Enclave", time: "25m ago", hash: "99e1a2...45f1" },
                  { action: "ACCESS_POLICY_VALIDATION", actor: "Access Control", time: "42m ago", hash: "2c44d9...88a1" },
                ].map((log, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg border border-slate-100 bg-white flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-mono font-bold text-slate-800 text-[11px] truncate">{log.action}</span>
                      <span className="text-slate-400 text-[11px]">by {log.actor}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                        {log.hash}
                      </span>
                      <span className="text-[10px] text-slate-400">{log.time}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* 3. AI OPERATOR WORKSPACE */}
      {normRole === 'AI_OPERATOR' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* 4 Agentic Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Autonomous Agents</span>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">4 Running</h3>
                </div>
                <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
                  <Bot className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                <span className="text-indigo-600 font-medium">ReAct Multi-Step Loops</span>
                <span className="text-slate-400">98.4% Success</span>
              </div>
            </Card>

            <Card className="hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">GPU Inference Latency</span>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">380 ms</h3>
                </div>
                <div className="p-2 rounded-lg bg-purple-50 border border-purple-100 text-purple-600">
                  <Cpu className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                <span className="text-emerald-600 font-medium">DeepSeek-R1 (14B)</span>
                <span className="text-slate-400">Local CUDA 0</span>
              </div>
            </Card>

            <Card className="hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Code Sandbox Runtime</span>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">Isolated</h3>
                </div>
                <div className="p-2 rounded-lg bg-cyan-50 border border-cyan-100 text-cyan-600">
                  <Terminal className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                <span className="text-cyan-600 font-medium">gVisor Enclave</span>
                <span className="text-slate-400">Secure Jail</span>
              </div>
            </Card>

            <Card className="hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Token Throughput</span>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">1.24M / day</h3>
                </div>
                <div className="p-2 rounded-lg bg-amber-50 border border-amber-100 text-amber-600">
                  <Zap className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                <span className="text-amber-600 font-medium">Peak: 2,400 tok/s</span>
                <span className="text-slate-400">vLLM PagedAttn</span>
              </div>
            </Card>
          </div>

          {/* Operator Quick Launch Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start gap-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left"
              onClick={() => navigate('/agents')}
            >
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Dispatch Agent Task</span>
                <span className="text-[11px] text-slate-500">Trigger multi-step autonomous workflows</span>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start gap-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left"
              onClick={() => navigate('/models')}
            >
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Model Center</span>
                <span className="text-[11px] text-slate-500">Monitor VRAM, weights & quantization</span>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start gap-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left"
              onClick={() => navigate('/code-lab')}
            >
              <div className="p-2 rounded-lg bg-cyan-50 text-cyan-600">
                <Terminal className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Code Lab Sandbox</span>
                <span className="text-[11px] text-slate-500">Run Python & bash scripts in isolated runtime</span>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start gap-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left"
              onClick={() => navigate('/knowledge-base')}
            >
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Vector Knowledge Base</span>
                <span className="text-[11px] text-slate-500">Inspect chunk embeddings & cosine indexes</span>
              </div>
            </Button>
          </div>

          {/* Interactive 3D GlareCard Neural Telemetry & Analytics (Full Extended Suite) */}
          <GlareAnalyticsSection compact={false} />

          {/* Agent Fleet Status */}
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Agent Fleet Status</CardTitle>
                  <CardDescription>Multi-step ReAct loops</CardDescription>
                </div>
                <Button variant="ghost" size="xs" onClick={() => navigate('/agents')}>
                  View All
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {MOCK_AGENT_USAGE.map((agent, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 truncate max-w-[160px]">{agent.name}</span>
                      <span className="text-slate-500 font-mono text-[11px]">{agent.invocations} runs ({agent.successRate}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${(agent.invocations / 1500) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Model Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card compact>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-900">DeepSeek-R1 (14B)</h4>
                <Badge variant="ai" size="sm">Active</Badge>
              </div>
              <p className="text-xs text-slate-500">Q4_K_M Quantized &bull; 14.8 GB VRAM</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Latency: 380ms</span>
                <span className="text-emerald-600 font-semibold">100% Health</span>
              </div>
            </Card>

            <Card compact>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-900">Llama-3.1-8B Router</h4>
                <Badge variant="neutral" size="sm">Standby</Badge>
              </div>
              <p className="text-xs text-slate-500">FP16 &bull; 6.2 GB VRAM</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Latency: 120ms</span>
                <span className="text-slate-600 font-semibold">Ready</span>
              </div>
            </Card>

            <Card compact>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-900">BGE-M3 Embeddings</h4>
                <Badge variant="success" size="sm">Loaded</Badge>
              </div>
              <p className="text-xs text-slate-500">1024-dim dense + sparse &bull; 1.8 GB VRAM</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Latency: 18ms</span>
                <span className="text-emerald-600 font-semibold">Online</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 4. ADMIN & 5. SUPER ADMIN WORKSPACES */}
      {(normRole === 'AI_ADMIN' || normRole === 'SUPER_ADMIN') && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Sovereign ROI & Cost Avoidance Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-navy-950 to-blue-950 text-white border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 w-96 h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-500/20 via-transparent to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1.5 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Sovereign ROI Engine
                  </span>
                  <span className="text-xs text-slate-400 font-mono">Monthly Compute Valuation</span>
                </div>
                <h3 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span>$14,820 Cloud API Cost Saved</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    97.2% Cost Avoidance
                  </span>
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  By executing 4.82M inference tokens on local air-gapped GPUs (vLLM / Ollama) instead of commercial third-party cloud APIs, your organization eliminated recurring egress bills and retained 100% data residency.
                </p>
              </div>

              <div className="flex items-center gap-4 shrink-0 bg-white/5 border border-white/10 rounded-xl p-3.5 backdrop-blur-sm">
                <div className="text-center px-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Cloud Cost</span>
                  <div className="text-base font-bold text-rose-400 line-through mt-0.5">$15,240</div>
                  <span className="text-[10px] text-slate-500">Commercial API</span>
                </div>
                <div className="h-8 w-px bg-white/15" />
                <div className="text-center px-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Local Compute</span>
                  <div className="text-base font-bold text-emerald-400 mt-0.5">$420</div>
                  <span className="text-[10px] text-slate-400">Power & Cluster</span>
                </div>
                <div className="h-8 w-px bg-white/15" />
                <div className="text-center px-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Data Leak Risk</span>
                  <div className="text-base font-bold text-cyan-400 mt-0.5">0.00%</div>
                  <span className="text-[10px] text-emerald-400 font-bold">100% Air-Gap</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Core Metric Cards with Elevated Executive Styling */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {MOCK_METRICS.map((metric, idx) => {
              const borderGradients = [
                'from-cyan-500 via-blue-500 to-indigo-500',
                'from-emerald-400 via-teal-500 to-cyan-500',
                'from-indigo-500 via-purple-500 to-pink-500',
                'from-amber-400 via-orange-500 to-rose-500'
              ];
              const iconColors = [
                'text-cyan-600 bg-cyan-50 border-cyan-200/80',
                'text-emerald-600 bg-emerald-50 border-emerald-200/80',
                'text-indigo-600 bg-indigo-50 border-indigo-200/80',
                'text-amber-600 bg-amber-50 border-amber-200/80'
              ];
              return (
                <div 
                  key={idx} 
                  className="relative overflow-hidden rounded-2xl bg-white p-5 border border-slate-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 group"
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${borderGradients[idx % 4]}`} />
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                        {metric.title}
                      </span>
                      <h3 className="text-2xl lg:text-3xl font-black text-slate-900 mt-1.5 tracking-tight font-sans">
                        {metric.value}
                      </h3>
                    </div>
                    <div className={`p-2.5 rounded-xl border shadow-xs group-hover:scale-110 transition-transform ${iconColors[idx % 4]}`}>
                      {getMetricIcon(metric.iconName)}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                    <span className="text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/50">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      {metric.change}
                    </span>
                    <span className="text-slate-400 font-medium truncate max-w-[120px]">{metric.subtext}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive 3D GlareCard Neural Telemetry & Analytics (Full Extended Suite) */}
          <GlareAnalyticsSection compact={false} />

          {/* Top Agent Usage Card */}
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Top Agent Usage</CardTitle>
                  <CardDescription>Autonomous task execution volume</CardDescription>
                </div>
                <Button variant="ghost" size="xs" onClick={() => navigate('/agents')}>
                  View All
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {MOCK_AGENT_USAGE.map((agent, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 truncate max-w-[160px]">
                        {agent.name}
                      </span>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {agent.invocations} runs ({agent.successRate}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${(agent.invocations / 1500) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Identity & Active Operator Sessions Card */}
          <Card className="border-cyan-200/60 shadow-lg">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-cyan-600" />
                      <span>Enclave Identity & Real-Time Operator Telemetry</span>
                    </CardTitle>
                    {normRole === 'SUPER_ADMIN' && pendingRequests.length > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white animate-pulse">
                        {pendingRequests.length} Pending
                      </span>
                    )}
                  </div>
                  <CardDescription>
                    {normRole === 'SUPER_ADMIN'
                      ? 'Real-time active operator sessions, permission grants, and incoming Company Code access requests'
                      : 'Live monitoring of active team members logged in under your company domain'}
                  </CardDescription>
                </div>

                {/* View Switcher Tabs (Only Super Admin gets Pending Approvals tab) */}
                {normRole === 'SUPER_ADMIN' ? (
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                    <button
                      onClick={() => setActiveTab('sessions')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        activeTab === 'sessions'
                          ? 'bg-white text-cyan-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span>Active Logged-In ({activeSessions.length})</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('requests')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        activeTab === 'requests'
                          ? 'bg-white text-cyan-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Clock className="h-3 w-3 text-amber-500" />
                      <span>Pending Approvals ({pendingRequests.length})</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Active Sessions ({activeSessions.length}) &bull; Read-Only</span>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent>
              {/* Notice banner for Admin */}
              {normRole !== 'SUPER_ADMIN' && (
                <div className="mb-4 p-3 bg-cyan-50/70 border border-cyan-200 rounded-xl text-xs text-cyan-900 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-cyan-700 shrink-0" />
                  <span>
                    <strong>Admin Operations View:</strong> You have read-only visibility into active team sessions. User approval, role assignment, and session termination are strictly managed by the Super Admin.
                  </span>
                </div>
              )}

              {/* Action Notification Banner */}
              {actionNotice && (
                <div className="mb-4 p-3 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-800 text-xs font-medium flex items-center justify-between animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cyan-600" />
                    <span>{actionNotice}</span>
                  </div>
                  <button onClick={() => setActionNotice(null)} className="text-cyan-600 hover:text-cyan-800">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Tab: SESSIONS (shown for Admin & Super Admin) */}
              {(normRole !== 'SUPER_ADMIN' || activeTab === 'sessions') && (
                activeSessions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-2.5 px-3">Operator</th>
                          <th className="py-2.5 px-3">Enclave Role</th>
                          <th className="py-2.5 px-3">Company Code</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Session Started</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {activeSessions.map((session) => (
                          <tr key={session.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2.5">
                                <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                                  {getInitial(session.fullName, session.email)}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-800 truncate">{session.fullName}</p>
                                  <p className="text-[11px] text-slate-500 truncate">{session.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant={session.role === 'Super Admin' ? 'navy' : 'info'} size="sm">
                                {session.role}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-600 text-[11px]">
                              {session.companyCode || company.code}
                            </td>
                            <td className="py-3 px-3">
                              <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium text-[11px]">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                                <span>Online</span>
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-400 text-[11px]">
                              {new Date(session.loginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="py-3 px-3 text-right">
                              {normRole === 'SUPER_ADMIN' ? (
                                session.role !== 'Super Admin' ? (
                                  <button
                                    onClick={() => handleTerminateSession(session.id, session.fullName)}
                                    className="text-[11px] text-rose-600 hover:text-rose-800 font-medium hover:underline cursor-pointer"
                                  >
                                    Terminate
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">Protected</span>
                                )
                              ) : (
                                <Badge variant="success" size="sm">Active</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    No active operator sessions recorded.
                  </div>
                )
              )}

              {/* Tab: REQUESTS (Only for Super Admin) */}
              {normRole === 'SUPER_ADMIN' && activeTab === 'requests' && (
                pendingRequests.length > 0 ? (
                  <div className="space-y-3">
                    {pendingRequests.map((req) => (
                      <div 
                        key={req.id}
                        className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:bg-amber-50/70"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 text-white font-bold text-sm flex items-center justify-center shadow-xs shrink-0">
                            {getInitial(req.fullName, req.email)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-slate-900">{req.fullName}</h4>
                              <Badge variant="warning" size="sm">
                                Pending Approval
                              </Badge>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5">{req.email}</p>
                            <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1">
                              <span>Requested Role: <strong className="text-slate-700">{req.role}</strong></span>
                              <span>&bull;</span>
                              <span>Company Code: <strong className="text-slate-700">{req.companyCode}</strong></span>
                              <span>&bull;</span>
                              <span>Auth: <strong>{req.authProvider.toUpperCase()}</strong></span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="danger"
                            size="xs"
                            onClick={() => handleRejectRequest(req.id)}
                            className="!rounded-lg gap-1"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>Reject</span>
                          </Button>
                          <Button
                            variant="primary"
                            size="xs"
                            onClick={() => handleApproveRequest(req.id)}
                            className="!rounded-lg !bg-emerald-600 hover:!bg-emerald-700 gap-1 shadow-sm"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Approve Access</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500/80" />
                    <p className="font-semibold text-slate-700">All access requests have been approved</p>
                    <p className="text-[11px] text-slate-400">When users sign in with your Company Code via Google, their authorization requests will appear here for your review.</p>
                  </div>
                )
              )}
            </CardContent>
          </Card>

          {/* Operational Status Widgets Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* System Status Card */}
            <Card compact>
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">System Status</h4>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">vLLM Inference Engine</span>
                  <Badge variant="success" size="sm" dot>Online (GPU 0)</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">PostgreSQL + pgvector</span>
                  <Badge variant="success" size="sm" dot>Healthy (42ms)</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Code Lab Sandbox</span>
                  <Badge variant="sovereign" size="sm">Isolated</Badge>
                </div>
              </div>
            </Card>

            {/* Model Status Card */}
            <Card compact>
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="h-4 w-4 text-indigo-600" />
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Model Status</h4>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">DeepSeek-R1 (14B)</span>
                  <Badge variant="ai" size="sm">Active (14.8 GB)</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Llama-3.1-8B Router</span>
                  <Badge variant="ai" size="sm">Standby (6.2 GB)</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">BGE-M3 Embeddings</span>
                  <Badge variant="neutral" size="sm">Ready (1.8 GB)</Badge>
                </div>
              </div>
            </Card>

            {/* Active Operators Card */}
            <Card compact>
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-blue-600" />
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Active Operators</h4>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-800 font-semibold">{activeSessions.length} Authorized</span>
                  <Badge variant="neutral" size="sm">{activeSessions.length} Online</Badge>
                </div>
                {activeSessions.length > 0 ? (
                  <div className="flex -space-x-1.5 overflow-hidden py-1">
                    {activeSessions.slice(0, 5).map((s) => (
                      <div
                        key={s.id}
                        className="inline-flex h-6 w-6 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-white font-bold text-[10px] items-center justify-center ring-2 ring-white shadow-xs shrink-0"
                        title={`${s.fullName} (${s.role})`}
                      >
                        {getInitial(s.fullName, s.email)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 py-1">No operators logged in yet.</p>
                )}
                <p className="text-[10px] text-slate-400">Strict RBAC enforced by local backend.</p>
              </div>
            </Card>

            {/* Sovereignty / Security Status Card */}
            <Card compact className="border-emerald-200/80 bg-emerald-50/30">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Sovereignty Card</h4>
              </div>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-1.5 text-emerald-800 font-semibold text-[11px]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Zero Cloud Data Leakage</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  All documents, vector indexes, and AI prompts are encrypted and contained strictly within your premises.
                </p>
                <div className="pt-1 text-[10px] font-mono text-emerald-700 font-medium">
                  EGRESS: 0 PACKETS &bull; AIR-GAP: VERIFIED
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

    </div>
  );
};
