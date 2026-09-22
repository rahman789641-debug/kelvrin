import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  X,
  Check,
  CheckCheck,
  ShieldCheck,
  Bot,
  Info,
  AlertTriangle,
  UserCheck,
  Trash2,
  BellOff,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import {
  AppNotification,
  getStoredNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  removeNotification,
  clearAllNotifications,
  formatRelativeTime,
} from '../../services/notificationService';
import {
  ApprovalItem,
  getApprovals,
  decideApproval
} from '../../services/approvalService';

export const NotificationMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread' | 'approvals'>('all');
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync notifications & approvals from localStorage and window events
  const loadData = () => {
    setNotifications(getStoredNotifications());
    setApprovals(getApprovals().filter((a) => a.status === 'PENDING'));
  };

  useEffect(() => {
    loadData();

    const handleUpdate = () => loadData();
    window.addEventListener('kelvrin_notifications_updated', handleUpdate);
    window.addEventListener('kelvrin_approvals_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('kelvrin_notifications_updated', handleUpdate);
      window.removeEventListener('kelvrin_approvals_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const safeNotifs = Array.isArray(notifications) ? notifications : [];
  const safeApprovals = Array.isArray(approvals) ? approvals : [];
  const unreadCount = safeNotifs.filter((n) => n && !n.read).length;
  const pendingApprovalsCount = safeApprovals.length;
  const totalAlertsCount = unreadCount + pendingApprovalsCount;

  const handleDecide = (id: string, decision: 'APPROVED' | 'REJECTED') => {
    decideApproval(id, decision);
    loadData();
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'security':
        return <ShieldCheck className="h-4 w-4 text-emerald-600" />;
      case 'agent':
        return <Bot className="h-4 w-4 text-indigo-600" />;
      case 'access':
        return <UserCheck className="h-4 w-4 text-amber-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-rose-600" />;
      case 'success':
        return <Check className="h-4 w-4 text-emerald-600" />;
      case 'system':
      default:
        return <Info className="h-4 w-4 text-cyan-600" />;
    }
  };

  const getIconBgForType = (type: string) => {
    switch (type) {
      case 'security':
        return 'bg-emerald-50 border-emerald-200/60';
      case 'agent':
        return 'bg-indigo-50 border-indigo-200/60';
      case 'access':
        return 'bg-amber-50 border-amber-200/60';
      case 'warning':
        return 'bg-rose-50 border-rose-200/60';
      case 'success':
        return 'bg-emerald-50 border-emerald-200/60';
      case 'system':
      default:
        return 'bg-cyan-50 border-cyan-200/60';
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') return !n.read;
    return true;
  });

  return (
    <div className="relative" ref={menuRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all relative focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
          isOpen ? 'bg-slate-100 text-slate-900 shadow-inner' : ''
        }`}
        title="Notifications & Approvals"
        aria-label="Open notifications"
        aria-expanded={isOpen}
      >
        <Bell className="h-4 w-4" />
        {totalAlertsCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-gradient-to-r from-red-500 to-rose-600 text-white font-bold text-[10px] rounded-full flex items-center justify-center ring-2 ring-white shadow-xs">
            {totalAlertsCount > 9 ? '9+' : totalAlertsCount}
          </span>
        )}
      </button>

      {/* Notification Box (Dropdown Panel) */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-88 sm:w-[420px] bg-white rounded-2xl shadow-2xl border border-slate-200/90 py-0 z-50 animate-in fade-in slide-in-from-top-2 duration-150 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Bell className="h-3.5 w-3.5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 tracking-tight">System Center</span>
                {totalAlertsCount > 0 ? (
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">
                    {totalAlertsCount} pending
                  </span>
                ) : (
                  <span className="ml-1.5 text-[10px] text-slate-400 font-medium">All clear</span>
                )}
              </div>
            </div>

            {/* Right Side Actions: Mark All Read + Close Icon (X) */}
            <div className="flex items-center gap-1">
              {unreadCount > 0 && filter !== 'approvals' && (
                <button
                  type="button"
                  onClick={markAllNotificationsAsRead}
                  title="Mark all as read"
                  className="px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-cyan-700 hover:bg-cyan-50/60 rounded-md transition-colors flex items-center gap-1"
                >
                  <CheckCheck className="h-3 w-3" />
                  <span className="hidden sm:inline">Mark read</span>
                </button>
              )}

              {/* Close Icon on Right Side */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close notifications"
                aria-label="Close notifications"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors focus:outline-none focus:ring-1 focus:ring-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filter Bar (All / Unread / Approvals) */}
          <div className="px-4 py-1.5 bg-white border-b border-slate-100 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors ${
                filter === 'all'
                  ? 'bg-slate-100 text-slate-800'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              All ({safeNotifs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors ${
                filter === 'unread'
                  ? 'bg-blue-50 text-blue-700 font-bold'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Unread ({unreadCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('approvals')}
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors flex items-center gap-1 ${
                filter === 'approvals'
                  ? 'bg-amber-50 text-amber-800 font-bold'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <span>HITL Approvals</span>
              {pendingApprovalsCount > 0 && (
                <span className="px-1 py-0.2 rounded-full text-[9px] bg-amber-200 text-amber-900 font-bold">
                  {pendingApprovalsCount}
                </span>
              )}
            </button>
          </div>

          {/* Content View: Approvals Tab OR Notifications Tab */}
          <div className="divide-y divide-slate-100 max-h-84 overflow-y-auto overscroll-contain">
            {filter === 'approvals' ? (
              approvals.length === 0 ? (
                <div className="py-10 px-4 text-center flex flex-col items-center justify-center">
                  <div className="h-10 w-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-500 mb-2">
                    <Check className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700">Approval Queue Clear</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    No pending Human-in-the-Loop agent authorizations.
                  </p>
                </div>
              ) : (
                approvals.map((appr) => (
                  <div key={appr.id} className="p-3.5 hover:bg-amber-50/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900">{appr.title}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 font-mono font-bold rounded ${
                              appr.risk === 'HIGH' || appr.risk === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : appr.risk === 'MEDIUM'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {appr.risk} RISK
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{appr.details}</p>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span>By: <strong className="text-slate-600">{appr.requester}</strong></span>
                          <span>&bull;</span>
                          <span>{appr.timeFormatted}</span>
                        </div>
                      </div>
                    </div>

                    {/* 1-Click Action Buttons */}
                    <div className="mt-2.5 flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleDecide(appr.id, 'REJECTED')}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecide(appr.id, 'APPROVED')}
                        className="px-3 py-1 rounded-md text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-2xs flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" />
                        <span>Authorize</span>
                      </button>
                    </div>
                  </div>
                ))
              )
            ) : filteredNotifications.length === 0 ? (
              <div className="py-10 px-4 text-center flex flex-col items-center justify-center">
                <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-2">
                  <BellOff className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-slate-700">No notifications</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {filter === 'unread'
                    ? 'No unread notifications right now.'
                    : 'You have no system notifications.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markNotificationAsRead(n.id);
                  }}
                  className={`p-3.5 hover:bg-slate-50/80 transition-colors flex items-start gap-3 relative group cursor-pointer ${
                    !n.read ? 'bg-cyan-50/20' : ''
                  }`}
                >
                  {/* Type Icon */}
                  <div
                    className={`h-8 w-8 rounded-lg flex items-center justify-center border shrink-0 mt-0.5 shadow-2xs ${getIconBgForType(
                      n.type
                    )}`}
                  >
                    {getIconForType(n.type)}
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs truncate ${!n.read ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                        {n.title}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                  </div>

                  {/* Unread indicator dot */}
                  {!n.read && (
                    <span className="absolute right-3 top-4 h-2 w-2 rounded-full bg-cyan-500 ring-2 ring-cyan-100 shrink-0" />
                  )}

                  {/* Delete / Dismiss Item Button on Hover */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNotification(n.id);
                    }}
                    title="Dismiss"
                    className="absolute right-2.5 top-3.5 opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-time Sovereign Sync
            </span>
            {safeNotifs.length > 0 && filter !== 'approvals' && (
              <button
                type="button"
                onClick={clearAllNotifications}
                className="text-[11px] font-medium text-slate-400 hover:text-rose-600 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
