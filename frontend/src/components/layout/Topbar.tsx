import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Breadcrumbs } from './Breadcrumbs';
import { StatusIndicator } from './StatusIndicator';
import { UserMenu } from './UserMenu';
import { NotificationMenu } from './NotificationMenu';
import { Building2, LogOut, ShieldAlert, AlertTriangle, CheckCircle2, X, Info } from 'lucide-react';
import { getActiveCompany, CompanyProfile } from '../../services/accessControl';
import { useAuth } from '../../context/AuthContext';
import { getLockdownState, engageLockdown, liftLockdown, LockdownState } from '../../services/killswitchService';
import { RoleDashboardGuideModal } from './RoleDashboardGuideModal';

export const Topbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = user?.role === 'Super Admin' || (user?.role && user.role.toUpperCase().replace(/\s+/g, '_') === 'SUPER_ADMIN');
  const [company, setCompany] = useState<CompanyProfile>(getActiveCompany());
  const [lockdown, setLockdown] = useState<LockdownState>(getLockdownState());
  const [showKillswitchModal, setShowKillswitchModal] = useState(false);
  const [showRoleGuideModal, setShowRoleGuideModal] = useState(false);
  const [lockdownReason, setLockdownReason] = useState('Suspected Boundary Anomaly');

  useEffect(() => {
    const handleUpdate = () => setCompany(getActiveCompany());
    const handleLockdownUpdate = () => setLockdown(getLockdownState());

    window.addEventListener('kelvrin_company_updated', handleUpdate);
    window.addEventListener('kelvrin_lockdown_updated', handleLockdownUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('kelvrin_company_updated', handleUpdate);
      window.removeEventListener('kelvrin_lockdown_updated', handleLockdownUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const handleToggleLockdown = () => {
    if (lockdown.isActive) {
      liftLockdown(user?.fullName || 'Super Admin');
      setLockdown(getLockdownState());
      setShowKillswitchModal(false);
    } else {
      engageLockdown(user?.fullName || 'Super Admin', lockdownReason);
      setLockdown(getLockdownState());
      setShowKillswitchModal(false);
    }
  };

  return (
    <>
      {/* Emergency Lockdown Top Alert Banner */}
      {lockdown.isActive && (
        <div className="bg-rose-600 text-white px-4 py-1.5 text-xs font-bold flex items-center justify-between shadow-md z-40 sticky top-0 animate-pulse">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>
              CRITICAL: ZERO-TRUST SOVEREIGN LOCKDOWN ACTIVE • All External Ports &amp; Autonomous Agent Queues Frozen
            </span>
          </div>
          {isSuperAdmin && (
            <button
              onClick={() => setShowKillswitchModal(true)}
              className="px-2 py-0.5 rounded bg-white text-rose-700 hover:bg-rose-50 text-[11px] font-bold shadow-xs transition-colors"
            >
              Lift Lockdown
            </button>
          )}
        </div>
      )}

      <header className="h-14 bg-white border-b border-slate-200/90 px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        {/* Left: Breadcrumbs & Path */}
        <div className="flex items-center gap-4">
          <Breadcrumbs />
        </div>

        {/* Right: Company Branding, Killswitch, Security Status, Notification Bell, User Menu */}
        <div className="flex items-center gap-3">
          {/* Dynamic Registered Company Pill */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-gradient-to-r from-slate-50 to-cyan-50/50 border border-slate-200/90 rounded-xl shadow-2xs">
            {company?.logoDataUrl ? (
              <img
                src={company.logoDataUrl}
                alt={company?.name || 'Company'}
                className="h-5 w-5 rounded-md object-contain shrink-0 border border-slate-200 bg-white"
              />
            ) : (
              <div className="h-5 w-5 rounded-md bg-gradient-to-tr from-cyan-600 to-blue-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 shadow-2xs">
                {(company?.name || 'C').trim().charAt(0).toUpperCase() || 'C'}
              </div>
            )}
            <span className="text-xs font-bold text-slate-800 tracking-tight max-w-[150px] truncate" title={company?.name || 'Company'}>
              {company?.name || 'Kelvrin Enclave'}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-white border border-slate-200 text-cyan-800">
              {company?.code || 'KELV-HQ'}
            </span>
          </div>

          {/* Super Admin Emergency Killswitch Button */}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setShowKillswitchModal(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                lockdown.isActive
                  ? 'bg-rose-600 text-white hover:bg-rose-700 animate-bounce'
                  : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
              }`}
              title="Sovereign Enclave Emergency Killswitch"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{lockdown.isActive ? 'Lockdown Active' : 'Killswitch'}</span>
            </button>
          )}

          {/* Role Operational Guide & AI Architecture Button */}
          <button
            type="button"
            onClick={() => setShowRoleGuideModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer bg-cyan-50 text-cyan-800 border border-cyan-200 hover:bg-cyan-100 hover:border-cyan-300"
            title="Role Operational & AI Intelligence Guide"
          >
            <Info className="h-3.5 w-3.5 text-cyan-600" />
            <span className="hidden md:inline">Role Guide</span>
          </button>

          <StatusIndicator />

          {/* Notification Bell with Dropdown Panel and Close Icon */}
          <NotificationMenu />

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* User Menu */}
          <UserMenu />

          {!isSuperAdmin && (
            <button
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Killswitch Confirmation Modal */}
      {showKillswitchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${lockdown.isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {lockdown.isActive ? 'Lift Sovereign Lockdown' : 'Engage Emergency Killswitch'}
                  </h3>
                  <p className="text-xs text-slate-400">Zero-Trust Enclave Isolation Protocol</p>
                </div>
              </div>
              <button
                onClick={() => setShowKillswitchModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              {lockdown.isActive ? (
                <p className="leading-relaxed">
                  Lifting the lockdown will restore normal operator access, unfreeze autonomous agent execution pipelines, and reconnect internal subnet interfaces.
                </p>
              ) : (
                <>
                  <p className="leading-relaxed">
                    Activating the Emergency Killswitch will immediately:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    <li>Sever all external WAN routing interfaces</li>
                    <li>Instantly freeze all background ReAct autonomous agent tasks</li>
                    <li>Revoke transient operator login tokens</li>
                    <li>Record a high-priority tamper-evident event into the Audit Log</li>
                  </ul>
                  <div className="pt-2">
                    <label className="block text-slate-500 font-medium mb-1">Reason for Emergency Lockdown:</label>
                    <input
                      type="text"
                      value={lockdownReason}
                      onChange={(e) => setLockdownReason(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 text-slate-800"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowKillswitchModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleToggleLockdown}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-xs ${
                  lockdown.isActive ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {lockdown.isActive ? 'Restore Enclave Operations' : 'Confirm Lockdown'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Role Dashboard & AI Capabilities Guide Modal */}
      <RoleDashboardGuideModal
        isOpen={showRoleGuideModal}
        onClose={() => setShowRoleGuideModal(false)}
        currentRole={user?.role || 'Super Admin'}
      />
    </>
  );
};
