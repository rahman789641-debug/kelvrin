import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { AiAssistantPage } from '../pages/AiAssistantPage';
import { AgentsPage } from '../pages/AgentsPage';
import { DocumentsPage } from '../pages/DocumentsPage';
import { DocumentDetailsPage } from '../pages/DocumentDetailsPage';
import { DocumentChatPage } from '../pages/DocumentChatPage';
import { KnowledgeBasePage } from '../pages/KnowledgeBasePage';
import { WorkflowsPage } from '../pages/WorkflowsPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { CodeLabPage } from '../pages/CodeLabPage';
import { ModelsPage } from '../pages/ModelsPage';
import { SystemMonitorPage } from '../pages/SystemMonitorPage';
import { SecurityPage } from '../pages/SecurityPage';
import { AuditLogsPage } from '../pages/AuditLogsPage';
import { UsersPage } from '../pages/UsersPage';
import { SettingsPage } from '../pages/SettingsPage';
import { CompanyDetailsPage } from '../pages/CompanyDetailsPage';
import { DeliverablesPage } from '../pages/DeliverablesPage';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';

import { ProtectedRoute } from '../components/auth/ProtectedRoute';

// 404 Fallback
const NotFoundPage: React.FC = () => (
  <div className="flex flex-col items-center justify-center p-12 text-center">
    <h2 className="text-3xl font-bold text-slate-900">404</h2>
    <p className="text-sm text-slate-500 mt-2">The requested sovereign resource or route does not exist.</p>
    <Button variant="primary" size="sm" className="mt-4" onClick={() => window.location.assign('/dashboard')}>
      Return to Dashboard
    </Button>
  </div>
);

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected App Routes inside Master AppShell */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route 
          path="/ai-assistant" 
          element={
            <ProtectedRoute requiredPermission="ai.chat">
              <AiAssistantPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/agents" 
          element={
            <ProtectedRoute requiredPermission="agents.execute">
              <AgentsPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/documents" 
          element={
            <ProtectedRoute requiredPermission="documents.read">
              <DocumentsPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/deliverables" 
          element={
            <ProtectedRoute requiredPermission="documents.read">
              <DeliverablesPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/documents/:id" 
          element={
            <ProtectedRoute requiredPermission="documents.read">
              <DocumentDetailsPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/documents/:id/chat" 
          element={
            <ProtectedRoute requiredPermission="ai.chat">
              <DocumentChatPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/knowledge-base" 
          element={
            <ProtectedRoute requiredPermission="knowledge.read">
              <KnowledgeBasePage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/workflows" 
          element={
            <ProtectedRoute requiredPermission="workflow.execute">
              <WorkflowsPage />
            </ProtectedRoute>
          } 
        />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route 
          path="/code-lab" 
          element={
            <ProtectedRoute requiredPermission="ai.execute">
              <CodeLabPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/models" 
          element={
            <ProtectedRoute requiredPermission="models.read">
              <ModelsPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/system-monitor" 
          element={
            <ProtectedRoute requiredPermission="security.read">
              <SystemMonitorPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/security" 
          element={
            <ProtectedRoute requiredPermission="security.read">
              <SecurityPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/audit-logs" 
          element={
            <ProtectedRoute requiredPermission="audit.read">
              <AuditLogsPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/users" 
          element={
            <ProtectedRoute requiredPermission="users.read">
              <UsersPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/company-details" 
          element={
            <ProtectedRoute allowedRoles={['Super Admin', 'SUPER_ADMIN']}>
              <CompanyDetailsPage />
            </ProtectedRoute>
          } 
        />
        <Route path="/company" element={<Navigate to="/company-details" replace />} />
        <Route 
          path="/settings" 
          element={
            <ProtectedRoute allowedRoles={['Super Admin', 'SUPER_ADMIN']}>
              <SettingsPage />
            </ProtectedRoute>
          } 
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};
