import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { KelvrinLoader } from '../ui/KelvrinLoader';

import { hasPermission, normalizeRole } from '../../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  requiredPermission?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  requiredPermission,
}) => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (isLoading) {
    return <KelvrinLoader text="Verifying Sovereign Credentials" fullScreen={true} />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Permission Check
  if (requiredPermission && !hasPermission(user, requiredPermission)) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-center">
        <div className="h-14 w-14 rounded-full bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400 mb-4">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Restricted (403)</h2>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          Missing mandatory security permission <span className="font-mono text-amber-400 font-semibold">{requiredPermission}</span>.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold tracking-wide transition shadow-lg cursor-pointer"
          >
            Return to Dashboard
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
          >
            Switch Account
          </button>
        </div>
      </div>
    );
  }

  // Role Check
  if (allowedRoles && user) {
    const normUserRole = normalizeRole(user.role);
    const isAuthorized = allowedRoles.some(
      (r) => normalizeRole(r) === normUserRole || r === user.role
    );
    if (!isAuthorized && normUserRole !== 'SUPER_ADMIN') {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-center">
          <div className="h-14 w-14 rounded-full bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400 mb-4">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Restricted (403)</h2>
          <p className="text-sm text-slate-400 max-w-md mb-6">
            Your active clearance level ({user.role}) does not meet the mandatory security policy for this module.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold tracking-wide transition shadow-lg cursor-pointer"
            >
              Return to Dashboard
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
            >
              Switch Account
            </button>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};
