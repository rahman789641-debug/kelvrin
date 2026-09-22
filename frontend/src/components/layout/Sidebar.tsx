import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserRole, hasPermission, normalizeRole } from '../../types';
import { getActiveCompany } from '../../services/accessControl';
import { 
  LayoutDashboard, 
  Bot, 
  Boxes, 
  FileText, 
  Database, 
  Workflow, 
  BarChart3, 
  Terminal, 
  Cpu, 
  Activity, 
  ShieldCheck, 
  ScrollText, 
  Users, 
  Settings,
  Building2,
  Sparkles,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
  badge?: string;
  allowedRoles?: UserRole[];
  requiredPermission?: string;
}

const NAVIGATION_ITEMS: NavItem[] = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { 
    name: 'AI Assistant', 
    path: '/ai-assistant', 
    icon: Bot, 
    badge: 'Local LLM',
    requiredPermission: 'ai.chat' 
  },
  { 
    name: 'Agents', 
    path: '/agents', 
    icon: Boxes, 
    badge: 'ReAct',
    requiredPermission: 'agents.execute' 
  },
  { 
    name: 'Documents', 
    path: '/documents', 
    icon: FileText,
    requiredPermission: 'documents.read' 
  },
  { 
    name: 'Deliverables', 
    path: '/deliverables', 
    icon: ScrollText,
    badge: 'Artifacts',
    requiredPermission: 'documents.read' 
  },
  { 
    name: 'Knowledge Base', 
    path: '/knowledge-base', 
    icon: Database,
    requiredPermission: 'knowledge.read' 
  },
  { 
    name: 'Workflows', 
    path: '/workflows', 
    icon: Workflow,
    requiredPermission: 'workflow.execute' 
  },
  { 
    name: 'Analytics', 
    path: '/analytics', 
    icon: BarChart3,
    allowedRoles: ['Super Admin', 'SUPER_ADMIN', 'AI Admin', 'AI_ADMIN', 'Approver / Manager', 'APPROVER', 'Analyst', 'ANALYST', 'Viewer / Auditor', 'AUDITOR']
  },
  { 
    name: 'Code Lab', 
    path: '/code-lab', 
    icon: Terminal, 
    badge: 'Sandbox',
    requiredPermission: 'ai.execute' 
  },
  { 
    name: 'Model Center', 
    path: '/models', 
    icon: Cpu,
    requiredPermission: 'models.read'
  },
  { 
    name: 'System Monitor', 
    path: '/system-monitor', 
    icon: Activity,
    requiredPermission: 'security.read'
  },
  { 
    name: 'Security', 
    path: '/security', 
    icon: ShieldCheck,
    requiredPermission: 'security.read'
  },
  { 
    name: 'Audit Logs', 
    path: '/audit-logs', 
    icon: ScrollText,
    requiredPermission: 'audit.read',
    allowedRoles: ['Super Admin', 'SUPER_ADMIN', 'Viewer / Auditor', 'AUDITOR']
  },
  { 
    name: 'User Management', 
    path: '/users', 
    icon: Users,
    requiredPermission: 'users.read',
    allowedRoles: ['Super Admin', 'SUPER_ADMIN']
  },
  { 
    name: 'Company Details', 
    path: '/company-details', 
    icon: Building2,
    allowedRoles: ['Super Admin', 'SUPER_ADMIN']
  },
  { 
    name: 'Settings', 
    path: '/settings', 
    icon: Settings,
    allowedRoles: ['Super Admin', 'SUPER_ADMIN']
  },
];

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggleCollapse }) => {
  const { user, sovereignMode } = useAuth();
  const [company, setCompany] = React.useState(getActiveCompany());

  React.useEffect(() => {
    const handleUpdate = () => setCompany(getActiveCompany());
    window.addEventListener('kelvrin_company_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('kelvrin_company_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Filter navigation items based on role authorization and granular permissions
  const accessibleItems = NAVIGATION_ITEMS.filter((item) => {
    if (item.requiredPermission && !hasPermission(user, item.requiredPermission)) {
      return false;
    }
    if (item.allowedRoles) {
      const normRole = normalizeRole(user?.role);
      const isAllowed = item.allowedRoles.some(
        (r) => normalizeRole(r) === normRole || r === user?.role
      );
      if (!isAllowed) return false;
    }
    return true;
  });

  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-screen bg-navy-950 text-slate-300 border-r border-navy-900 transition-all duration-200 flex flex-col ${
        isCollapsed ? 'w-18' : 'w-64'
      }`}
    >
      {/* Brand Header: Dynamic Registered Company Logo & Name */}
      <div className="h-14 px-4 border-b border-navy-900 flex items-center justify-between">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 min-w-0">
            {company?.logoDataUrl ? (
              <img
                src={company.logoDataUrl}
                alt={company?.name || 'Company'}
                className="h-8 w-8 rounded-lg object-contain bg-white/10 p-0.5 border border-slate-700 shadow-xs shrink-0"
              />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 border border-cyan-400/30 flex items-center justify-center p-1 shadow-xs text-white font-bold text-sm shrink-0">
                {(company?.name || 'K').trim().charAt(0).toUpperCase() || 'K'}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-[14px] font-bold tracking-wider text-white uppercase font-sans truncate" title={company?.name || 'Kelvrin'}>
                {company?.name || 'Kelvrin Sovereign Enclave'}
              </h1>
              <p className="text-[11px] text-cyan-400 font-mono font-medium -mt-0.5 tracking-tight truncate">
                {company?.code || 'KELV-HQ'}
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto h-8 w-8 rounded-lg bg-navy-900 border border-slate-700 flex items-center justify-center p-1 overflow-hidden">
            {company?.logoDataUrl ? (
              <img src={company.logoDataUrl} alt={company?.name || 'Company'} className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs font-black text-white">{(company?.name || 'K').trim().charAt(0).toUpperCase() || 'K'}</span>
            )}
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-navy-900 transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-3 overflow-y-auto dark-scroll space-y-1">
        {!isCollapsed && (
          <div className="px-2.5 pb-2 pt-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
            Workbench Navigation
          </div>
        )}

        {accessibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-brand-blue text-white shadow-sm font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-navy-900/90'
                } ${isCollapsed ? 'justify-center px-0' : ''}`
              }
              title={isCollapsed ? item.name : undefined}
            >
              <Icon className="h-5 w-5 shrink-0 transition-transform group-hover:scale-105" />
              {!isCollapsed && (
                <>
                  <span className="truncate flex-1 font-medium">{item.name}</span>
                  {item.badge && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-navy-800 text-cyan-300 border border-slate-700 font-semibold tracking-wide">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Sovereign Footprint Footer */}
      <div className="p-3 border-t border-navy-900 bg-navy-950/80">
        {!isCollapsed ? (
          <div className="p-3 rounded-lg bg-navy-900/60 border border-slate-800/80">
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-white">
                {sovereignMode === 'AIR_GAP_LOCAL' ? 'Air-Gapped Mode' : 'Local AI Enclave'}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              {sovereignMode === 'AIR_GAP_LOCAL'
                ? '100% On-Premises Inference. Zero External Data Leakage.'
                : 'AI inference and confidential workspace data remain local. Google/Firebase is used only for authentication.'}
            </p>
          </div>
        ) : (
          <div className="flex justify-center" title="Sovereign Enclave: Zero Data Leakage">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
        )}
      </div>
    </aside>
  );
};
