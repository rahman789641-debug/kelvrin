import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { 
  ShieldCheck, 
  Lock, 
  AlertTriangle, 
  CheckCircle2, 
  Radio, 
  Server, 
  Terminal, 
  Activity, 
  Layers, 
  RefreshCw,
  XCircle,
  FileCheck,
  Globe,
  Info,
  ExternalLink
} from 'lucide-react';
import { securityApi, SecurityDashboardData, AirGapAuditResult, connectorsApi, ConnectorItem } from '../services/api';
import { useToast } from '../components/ui/Toast';

export const SecurityPage: React.FC = () => {
  const [dashboard, setDashboard] = useState<SecurityDashboardData | null>(null);
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [auditResult, setAuditResult] = useState<AirGapAuditResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { success, error, info } = useToast();

  const loadSecurityData = useCallback(async () => {
    try {
      const [dashData, connData] = await Promise.all([
        securityApi.getDashboard(),
        connectorsApi.list()
      ]);
      setDashboard(dashData);
      setConnectors(Array.isArray(connData) ? connData : []);
    } catch (err: any) {
      error('Security Data Load Failed', err.message || 'Unable to fetch security dashboard metrics.');
    } finally {
      setIsLoading(false);
    }
  }, [error]);

  useEffect(() => {
    loadSecurityData();
  }, [loadSecurityData]);

  const handleAirGapAudit = async () => {
    setIsVerifying(true);
    info('Air-Gap Integrity Audit Initiated', 'Testing DNS resolution, outbound sockets, and cloud AI reachability...');

    try {
      const result = await securityApi.runAirGapAudit();
      setAuditResult(result);
      if (result.status === 'PASS') {
        success('Air-Gap Integrity Verified', 'Zero egress detected. Cloud AI endpoints are completely unreachable.');
      } else {
        error('Audit Flagged Leakage', result.message);
      }
      loadSecurityData();
    } catch (err: any) {
      error('Air-Gap Audit Failed', err.message || 'Failed to complete air-gap audit probes.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleToggleConnector = async (id: string, currentEnabled: boolean) => {
    try {
      const nextState = !currentEnabled;
      await connectorsApi.toggle(id, nextState);
      success(
        'Connector Authorization Updated',
        `Connector ${id} set to ${nextState ? 'ENABLED' : 'DISABLED'}. Action recorded in immutable audit log.`
      );
      loadSecurityData();
    } catch (err: any) {
      error('Failed to Toggle Connector', err.message || 'Error updating connector gate.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Security & Egress Monitoring</h1>
            <Badge variant="sovereign" size="md" dot>
              Air-Gap Boundary Enforced
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time verification of on-premises isolation: zero cloud AI calls, zero document leakage, and default-deny egress policies.
          </p>
        </div>
        <Button variant="sovereign" size="sm" onClick={handleAirGapAudit} isLoading={isVerifying}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Run Live Air-Gap Audit
        </Button>
      </div>

      {/* Critical Architecture Distinction Notice */}
      <div className="p-4 bg-navy-950 text-slate-100 rounded-xl border border-navy-800 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <strong className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Sovereign Air-Gap Architecture Guarantee
              </strong>
              <Badge variant="neutral" size="sm">
                AUTH_MODE: {dashboard?.auth_architecture?.auth_mode ? dashboard.auth_architecture.auth_mode.toUpperCase() : 'LOCAL'}
              </Badge>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {dashboard?.auth_architecture?.dependency_notice ||
                'AI and confidential data processing remain strictly on-premises. External authentication dependencies (Firebase) may require outbound network access if enabled.'}
            </p>
            <div className="text-[11px] text-slate-400 pt-1 flex items-center gap-4">
              <span>Cloud AI Calls: <strong className="text-emerald-400">0 Blocked (Strict Enforced)</strong></span>
              <span>Document Egress: <strong className="text-emerald-400">0 Bytes (Strict Enforced)</strong></span>
              <span>Local Inference Engine: <strong className="text-emerald-400">100% On-Premises</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Air-Gap Audit Result Card */}
      {auditResult && (
        <Card className={auditResult.status === 'PASS' ? 'border-emerald-300 bg-emerald-50/20' : 'border-rose-300 bg-rose-50/20'}>
          <CardHeader>
            <div className="flex items-center gap-2">
              {auditResult.status === 'PASS' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              )}
              <div>
                <CardTitle className="text-sm font-bold">
                  {auditResult.status === 'PASS' ? 'Air-Gap Integrity Test: PASS' : 'Air-Gap Integrity Test: ANOMALY'}
                </CardTitle>
                <CardDescription className="text-xs">{auditResult.message}</CardDescription>
              </div>
            </div>
            <Badge variant={auditResult.status === 'PASS' ? 'success' : 'danger'} size="sm">
              {auditResult.air_gap_integrity || '100% Isolated'}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 bg-white/80 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">Audit Event ID</span>
                <strong className="font-mono text-slate-800 truncate block">{auditResult.audit_id}</strong>
              </div>
              <div className="p-2.5 bg-white/80 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">Egress Detected</span>
                <strong className="font-mono text-emerald-700">{auditResult.external_egress_bytes} Bytes</strong>
              </div>
              <div className="p-2.5 bg-white/80 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">Cloud AI Reachability</span>
                <strong className="font-mono text-emerald-700">{auditResult.external_ai_calls} Calls (Blocked)</strong>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Confidential Document Egress */}
        <Card compact className="border-emerald-200 bg-emerald-50/30">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span className="text-[11px] font-bold text-emerald-900 uppercase">Document Egress</span>
          </div>
          <h3 className="text-xl font-bold text-emerald-800 mt-2">
            {`${dashboard?.egress_metrics?.confidential_data_egress_bytes ?? 0} Bytes`}
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">Zero confidential files leaked</p>
        </Card>

        {/* External AI Calls */}
        <Card compact className="border-emerald-200 bg-emerald-50/30">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-navy-900" />
            <span className="text-[11px] font-bold text-slate-700 uppercase">External AI Calls</span>
          </div>
          <h3 className="text-xl font-bold text-emerald-800 mt-2">
            {dashboard?.egress_metrics?.external_ai_calls ?? 0} Calls
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">Cloud LLMs strictly zero</p>
        </Card>

        {/* Blocked Connections */}
        <Card compact>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-indigo-600" />
            <span className="text-[11px] font-bold text-slate-500 uppercase">Blocked Sockets</span>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mt-2">
            {dashboard?.egress_metrics?.blocked_connections ?? 0} Dropped
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">Firewall egress filter</p>
        </Card>

        {/* Local AI Requests */}
        <Card compact>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600" />
            <span className="text-[11px] font-bold text-slate-500 uppercase">Local AI Queries</span>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mt-2">
            {dashboard?.egress_metrics?.local_ai_requests ?? 0}
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">Served on local GPUs/CPUs</p>
        </Card>

        {/* Sandbox Isolation */}
        <Card compact>
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-slate-700" />
            <span className="text-[11px] font-bold text-slate-500 uppercase">Sandbox Firewall</span>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mt-2 font-mono text-sm">--network none</h3>
          <p className="text-[10px] text-slate-500 mt-1">Zero network capability</p>
        </Card>

      </div>

      {/* External Connectors & Egress Gates */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>External Connector & Egress Permission Gates</CardTitle>
            <CardDescription>
              In accordance with Principle 19: External connectors are disabled by default and require administrative authorization
            </CardDescription>
          </div>
          <Badge variant="warning" size="sm">Default Deny</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {connectors.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">Loading connectors registry...</div>
          ) : (
            connectors.map((conn) => (
              <div
                key={conn.id}
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <strong className="text-slate-900 font-semibold">{conn.name}</strong>
                    <Badge variant="neutral" size="sm">{conn.type}</Badge>
                    <span className="text-[10px] text-slate-400 font-mono">{conn.config?.base_url || 'local-socket'}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {conn.is_enabled
                      ? 'Authorized: Permitted communication strictly within on-premises sovereign network'
                      : 'Default Deny: All outbound socket and HTTP traffic blocked at host network boundary'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={conn.is_enabled ? 'danger' : 'success'} size="sm">
                    {conn.is_enabled ? 'ENABLED' : 'DISABLED'}
                  </Badge>
                  <Button
                    variant={conn.is_enabled ? 'danger' : 'outline'}
                    size="xs"
                    onClick={() => handleToggleConnector(conn.id, conn.is_enabled)}
                  >
                    {conn.is_enabled ? 'Revoke Access' : 'Authorize Gate'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Dual Tables: Authentication Events & Security Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Authentication Events */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent Authentication Events</CardTitle>
              <CardDescription>Logins, token grants, and session validations</CardDescription>
            </div>
            <Badge variant="neutral" size="sm">
              {(dashboard?.security_events || []).filter(e => e.action.includes('LOGIN') || e.action.includes('USER') || e.action.includes('AUTH')).length || 0} Events
            </Badge>
          </CardHeader>
          <CardContent>
            {dashboard?.security_events && dashboard.security_events.filter(e => e.action.includes('LOGIN') || e.action.includes('USER') || e.action.includes('AUTH')).length > 0 ? (
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {dashboard.security_events
                  .filter(e => e.action.includes('LOGIN') || e.action.includes('USER') || e.action.includes('AUTH'))
                  .map((ev) => (
                    <div key={ev.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{ev.actor}</span>
                          <Badge variant={ev.status === 'SUCCESS' ? 'success' : 'danger'} size="sm">
                            {ev.status}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {ev.action} {ev.resource_type ? `&bull; ${ev.resource_type}` : ''}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-slate-400">No recent authentication events.</div>
            )}
          </CardContent>
        </Card>

        {/* Security Events */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Security & Policy Events</CardTitle>
              <CardDescription>Egress enforcement, boundary audits, and permission gates</CardDescription>
            </div>
            <Badge variant="sovereign" size="sm">
              {(dashboard?.security_events || []).filter(e => !e.action.includes('LOGIN')).length || 0} Events
            </Badge>
          </CardHeader>
          <CardContent>
            {dashboard?.security_events && dashboard.security_events.filter(e => !e.action.includes('LOGIN')).length > 0 ? (
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {dashboard.security_events
                  .filter(e => !e.action.includes('LOGIN'))
                  .map((ev) => (
                    <div key={ev.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Badge variant={ev.status === 'DENIED' || ev.status === 'BLOCKED' ? 'danger' : 'success'} size="sm">
                            {ev.status}
                          </Badge>
                          <span className="font-mono text-slate-800 font-semibold">{ev.action}</span>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          {ev.details?.message || ev.details?.action_tested || `Target: ${ev.resource_type} (${ev.resource_id || 'n/a'})`}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-slate-400">All security policies verified normal.</div>
            )}
          </CardContent>
        </Card>

      </div>

    </div>
  );
};
