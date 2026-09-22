import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { systemApi, SystemHealthOut, SystemMetricsOut, SystemEventItem } from '../services/api';
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  CheckCircle2, 
  Server, 
  Layers, 
  RefreshCw,
  AlertTriangle,
  XCircle,
  Database,
  FileText,
  Clock,
  Terminal,
  ShieldCheck
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export const SystemMonitorPage: React.FC = () => {
  const [health, setHealth] = useState<SystemHealthOut | null>(null);
  const [metrics, setMetrics] = useState<SystemMetricsOut | null>(null);
  const [events, setEvents] = useState<SystemEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<string>('Just now');
  const { error } = useToast();

  const loadData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const [healthData, metricsData, eventsData] = await Promise.all([
        systemApi.getHealth(),
        systemApi.getMetrics(),
        systemApi.getEvents()
      ]);
      setHealth(healthData);
      setMetrics(metricsData);
      setEvents(eventsData);
      setLastPollTime(new Date().toLocaleTimeString());
    } catch (err: any) {
      error('Monitoring Probe Failed', err.message || 'Unable to connect to system metrics endpoint.');
    } finally {
      setIsLoading(false);
      if (showRefreshing) setIsRefreshing(false);
    }
  }, [error]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const getSubsystemStatusBadge = (status: string) => {
    switch (status) {
      case 'HEALTHY':
        return <Badge variant="success" size="sm" dot>HEALTHY</Badge>;
      case 'DEGRADED':
        return <Badge variant="warning" size="sm" dot>DEGRADED</Badge>;
      case 'DOWN':
        return <Badge variant="danger" size="sm" dot>DOWN</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'ERROR':
        return <Badge variant="danger" size="sm">ERROR</Badge>;
      case 'WARNING':
        return <Badge variant="warning" size="sm">WARNING</Badge>;
      default:
        return <Badge variant="neutral" size="sm">INFO</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">On-Premises System Monitor</h1>
            {health && (
              <Badge variant={health.overall_status === 'HEALTHY' ? 'sovereign' : health.overall_status === 'DEGRADED' ? 'warning' : 'danger'} size="md" dot>
                {health.overall_status === 'HEALTHY' ? 'Hardware Health Optimal' : `System ${health.overall_status}`}
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time physical node telemetry: host CPU compute, system memory, disk allocation, GPU acceleration, and subsystem health daemons.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400 font-mono hidden md:block">
            Last updated: <strong className="text-slate-700">{lastPollTime}</strong>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadData(true)} isLoading={isRefreshing}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh Probes
          </Button>
        </div>
      </div>

      {/* Primary Hardware Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Host CPU Compute */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Host CPU Compute</span>
            <Activity className="h-4 w-4 text-blue-600" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mt-2">
            {metrics ? `${metrics.cpu.utilization_pct}%` : '--'}
          </h3>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${metrics ? metrics.cpu.utilization_pct : 0}%` }}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
            <span>{metrics ? `${metrics.cpu.core_count} Logical Cores` : 'Cores --'}</span>
            <span className="text-emerald-600 font-medium">Real-time Probe</span>
          </div>
        </Card>

        {/* System Memory (RAM) */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">System Memory</span>
            <Layers className="h-4 w-4 text-purple-600" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mt-2">
            {metrics ? (metrics.memory.used_mb / 1024).toFixed(1) : '--'}{' '}
            <span className="text-xs font-normal text-slate-400">
              / {metrics ? (metrics.memory.total_mb / 1024).toFixed(1) : '--'} GB
            </span>
          </h3>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-purple-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${metrics ? metrics.memory.percent : 0}%` }}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
            <span>Utilization: <strong className="text-slate-800">{metrics ? `${metrics.memory.percent}%` : '--'}</strong></span>
            <span className="text-slate-700 font-mono">
              {metrics ? (metrics.memory.free_mb / 1024).toFixed(1) : '--'} GB Free
            </span>
          </div>
        </Card>

        {/* Primary Storage */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Storage Volume</span>
            <HardDrive className="h-4 w-4 text-emerald-600" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mt-2">
            {metrics ? metrics.disk.used_gb : '--'}{' '}
            <span className="text-xs font-normal text-slate-400">
              / {metrics ? metrics.disk.total_gb : '--'} GB
            </span>
          </h3>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-emerald-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${metrics ? metrics.disk.percent : 0}%` }}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
            <span>Disk Usage: <strong className="text-slate-800">{metrics ? `${metrics.disk.percent}%` : '--'}</strong></span>
            <span className="text-emerald-700 font-mono">{metrics ? metrics.disk.free_gb : '--'} GB Free</span>
          </div>
        </Card>

        {/* GPU Telemetry or Genuine Fallback */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">GPU Acceleration</span>
            <Cpu className="h-4 w-4 text-indigo-600" />
          </div>
          {metrics && metrics.gpu.gpu_available ? (
            <div className="mt-2">
              <h3 className="text-2xl font-bold text-slate-900">
                {metrics.gpu.gpu_count} Active GPUs
              </h3>
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                <span>Hardware Acceleration</span>
                <Badge variant="success" size="sm">Available</Badge>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <p className="text-xs font-bold text-slate-700">GPU metrics unavailable</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Host running CPU inference &bull; No hardware GPU attached
                </p>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Inference Mode</span>
                <Badge variant="neutral" size="sm">CPU Fallback</Badge>
              </div>
            </div>
          )}
        </Card>

      </div>

      {/* Subsystem Health Status Grid */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Core Subsystem Liveness & Health</CardTitle>
            <CardDescription>Continuous operational health probes across local engines and daemons</CardDescription>
          </div>
          {health && health.subsystems && (
            <Badge variant={health.overall_status === 'HEALTHY' ? 'success' : 'warning'} size="sm">
              {Object.values(health.subsystems).filter(s => s.status === 'HEALTHY' || s.status === 'ISOLATED').length}/{Object.keys(health.subsystems).length} Subsystems Operational
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {health && health.subsystems && Object.entries(health.subsystems).map(([key, sub]) => (
              <div
                key={key}
                className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-xl flex flex-col justify-between space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {key === 'database' && <Database className="h-4 w-4 text-blue-600" />}
                    {key === 'ai_models' && <Cpu className="h-4 w-4 text-purple-600" />}
                    {key === 'ocr_engine' && <FileText className="h-4 w-4 text-amber-600" />}
                    {key === 'vector_db' && <Layers className="h-4 w-4 text-emerald-600" />}
                    {key === 'sandbox' && <Terminal className="h-4 w-4 text-slate-700" />}
                    {key === 'storage' && <HardDrive className="h-4 w-4 text-indigo-600" />}
                    <span className="text-xs font-bold text-slate-800 capitalize">
                      {key.replace('_', ' ')}
                    </span>
                  </div>
                  {getSubsystemStatusBadge(sub.status)}
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {sub.message || sub.component || 'Subsystem operational and responding to probes.'}
                </p>
                {sub.latency_ms !== undefined && (
                  <div className="text-[10px] text-slate-400 font-mono">
                    Probe Latency: <strong className="text-slate-700">{sub.latency_ms}ms</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Storage & Deliverables Footprint */}
      {metrics?.storage && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Sovereign Vault & Deliverables Storage</CardTitle>
              <CardDescription>Local filesystem capacity allocation for generated reports and scratch workspace</CardDescription>
            </div>
            <Badge variant="sovereign" size="sm">Air-Gapped Vault</Badge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-500 block">Deliverables Generated</span>
                <span className="text-xl font-bold text-slate-900 mt-1 block">
                  {metrics.storage.deliverables_count ?? 0} Files
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-500 block">Deliverables Footprint</span>
                <span className="text-xl font-bold text-slate-900 mt-1 block">
                  {((metrics.storage.deliverables_size_bytes ?? 0) / 1024).toFixed(1)} KB
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-500 block">Encrypted Scratch Mount</span>
                <span className="text-xs font-mono text-slate-700 mt-2 block truncate">
                  {metrics.storage.scratch_path ?? 'Scratch Directory'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent System Events */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent System Telemetry Events</CardTitle>
            <CardDescription>Live daemon state transitions, hardware events, and health probe anomalies</CardDescription>
          </div>
          <Badge variant="neutral" size="sm">{events.length} Events Logged</Badge>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No recent system warnings or errors. All background daemons running smoothly.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {events.map((ev) => (
                <div key={ev.id} className="py-2.5 flex items-start justify-between gap-4 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      {getSeverityBadge(ev.severity)}
                      <span className="font-mono text-slate-800 font-semibold">{ev.event_type}</span>
                      <span className="text-[10px] text-slate-400 font-mono">[{ev.subsystem}]</span>
                    </div>
                    <p className="text-[11px] text-slate-600">{ev.message}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0 whitespace-nowrap">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
};
