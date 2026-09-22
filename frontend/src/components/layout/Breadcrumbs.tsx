import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const ROUTE_NAMES: Record<string, string> = {
  dashboard: 'Dashboard',
  'ai-assistant': 'AI Assistant',
  agents: 'Autonomous Agents',
  documents: 'Sovereign Documents',
  chat: 'Document Q&A',
  'knowledge-base': 'Knowledge Base',
  workflows: 'Workflows',
  analytics: 'Analytics',
  'code-lab': 'Code Lab Sandbox',
  models: 'Model Center',
  'system-monitor': 'System Monitor',
  security: 'Security & Network',
  'audit-logs': 'Audit Logs',
  users: 'User Management',
  settings: 'Settings',
};

export const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  if (pathnames.length === 0 || (pathnames.length === 1 && pathnames[0] === 'dashboard')) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
        <Home className="h-3.5 w-3.5 text-slate-400" />
        <span>/</span>
        <span className="text-slate-800 font-semibold">Dashboard</span>
      </div>
    );
  }

  return (
    <nav className="flex items-center gap-1 text-xs text-slate-500 font-medium">
      <Link to="/dashboard" className="hover:text-slate-800 flex items-center gap-1 text-slate-400">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {pathnames.map((value, index) => {
        const to = `/${pathnames.slice(0, index + 1).join('/')}`;
        const isLast = index === pathnames.length - 1;
        const displayName = ROUTE_NAMES[value] || value;

        return (
          <React.Fragment key={to}>
            <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />
            {isLast ? (
              <span className="font-semibold text-slate-800 truncate max-w-[200px]">
                {displayName}
              </span>
            ) : (
              <Link to={to} className="hover:text-slate-800 hover:underline truncate max-w-[150px]">
                {displayName}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
