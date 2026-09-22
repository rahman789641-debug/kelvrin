import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '../../context/AuthContext';
import { getActiveCompany, saveActiveCompany } from '../../services/accessControl';
import { fetchCompanyFromCloud, listenToCompanyFromCloud } from '../../services/cloudSync';

export const AppShell: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user } = useAuth();

  // Multi-Tenant Cross-Role Organization & Logo Synchronization
  // Ensures all roles (Admin, AI Operator, Analyst, Employee, Auditor)
  // render the Super Admin's uploaded company logo and branding in real-time!
  useEffect(() => {
    const compCode = user?.companyCode || getActiveCompany().code || 'KELV-HQ';
    if (!compCode) return;

    // 1. Instant cloud fetch on shell mount
    fetchCompanyFromCloud(compCode).then((cloudComp) => {
      if (cloudComp) {
        saveActiveCompany(cloudComp);
        window.dispatchEvent(new CustomEvent('kelvrin_company_updated', { detail: cloudComp }));
      }
    }).catch(() => {});

    // 2. Real-time Firestore subscription: updates logo/name live when Super Admin modifies them
    const unsub = listenToCompanyFromCloud(compCode, (updatedComp) => {
      if (updatedComp) {
        saveActiveCompany(updatedComp);
        window.dispatchEvent(new CustomEvent('kelvrin_company_updated', { detail: updatedComp }));
      }
    });

    return () => {
      unsub();
    };
  }, [user?.companyCode]);

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-800">
      {/* Sidebar */}
      <Sidebar isCollapsed={isCollapsed} onToggleCollapse={() => setIsCollapsed(!isCollapsed)} />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          isCollapsed ? 'ml-18' : 'ml-64'
        }`}
      >
        <Topbar />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-150">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

