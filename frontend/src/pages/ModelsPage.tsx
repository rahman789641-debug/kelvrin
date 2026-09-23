import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useToast } from '../components/ui/Toast';
import { 
  modelsApi, 
  SovereignModel, 
  ModelRoutingLog, 
  TaskClassificationResult, 
  RouteExecuteResult 
} from '../services/api';
import { 
  Cpu, 
  Layers, 
  CheckCircle2, 
  Activity, 
  Zap, 
  Server,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Plus,
  Play,
  Clock,
  AlertTriangle,
  Code2,
  Brain,
  Eye,
  FileSpreadsheet,
  Terminal,
  Compass,
  Check,
  XCircle
} from 'lucide-react';

const CAPABILITY_ICONS: Record<string, any> = {
  TEXT: Terminal,
  CODING: Code2,
  REASONING: Brain,
  VISION: Eye,
  EMBEDDING: Layers,
  OCR: FileSpreadsheet
};

export const ModelsPage: React.FC = () => {
  const { success, error, info } = useToast();

  const [models, setModels] = useState<SovereignModel[]>([]);
  const [routingLogs, setRoutingLogs] = useState<ModelRoutingLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Health checking state per model
  const [probingModelId, setProbingModelId] = useState<string | null>(null);

  // Register Modal State
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [regId, setRegId] = useState('');
  const [regName, setRegName] = useState('');
  const [regProvider, setRegProvider] = useState('mock');
  const [regEndpoint, setRegEndpoint] = useState('http://127.0.0.1:8001/v1');
  const [regModality, setRegModality] = useState('text');
  const [regCaps, setRegCaps] = useState<string[]>(['TEXT']);
  const [regCtx, setRegCtx] = useState(8192);
  const [regVram, setRegVram] = useState(4096);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Router Sandbox State
  const [testPrompt, setTestPrompt] = useState('Write a python script to parse sovereign logs and filter exceptions');
  const [classificationResult, setClassificationResult] = useState<TaskClassificationResult | null>(null);
  const [routeResult, setRouteResult] = useState<RouteExecuteResult | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isExecutingRoute, setIsExecutingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [modelsData, logsData] = await Promise.all([
        modelsApi.list(),
        modelsApi.getRoutingLogs(15)
      ]);
      setModels(Array.isArray(modelsData) ? modelsData : []);
      setRoutingLogs(Array.isArray(logsData) ? logsData : []);
    } catch (err: any) {
      error('Failed to load models data', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCheckHealth = async (modelId: string) => {
    try {
      setProbingModelId(modelId);
      const res = await modelsApi.checkHealth(modelId);
      setModels(prev =>
        prev.map(m =>
          m.id === modelId
            ? {
                ...m,
                health_status: res.health_status,
                latency_ms: res.latency_ms,
                last_health_check: res.checked_at,
                error_message: res.error_message
              }
            : m
        )
      );
      if (res.health_status === 'HEALTHY') {
        success('Health Verified', `${modelId} is online with ${res.latency_ms} ms latency.`);
      } else {
        error('Health Degraded', `${modelId}: ${res.error_message || 'Endpoint unreachable'}`);
      }
    } catch (err: any) {
      error('Probe Failed', err.message);
    } finally {
      setProbingModelId(null);
    }
  };

  const handleToggleStatus = async (modelId: string) => {
    try {
      const updated = await modelsApi.toggleStatus(modelId);
      setModels(prev => prev.map(m => (m.id === modelId ? updated : m)));
      success('Status Updated', `Model ${modelId} is now ${updated.is_active ? 'ACTIVE' : 'STANDBY'}.`);
    } catch (err: any) {
      error('Toggle Failed', err.message || 'Permission models.manage required.');
    }
  };

  const handleCapabilityToggle = (cap: string) => {
    if (regCaps.includes(cap)) {
      if (regCaps.length > 1) {
        setRegCaps(regCaps.filter(c => c !== cap));
      }
    } else {
      setRegCaps([...regCaps, cap]);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regId.trim() || !regName.trim()) {
      error('Missing Fields', 'Model ID and Display Name are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      const newModel = await modelsApi.register({
        id: regId.trim().toLowerCase().replace(/\s+/g, '-'),
        name: regName.trim(),
        provider_type: regProvider,
        endpoint_url: regEndpoint.trim(),
        modality: regModality,
        capabilities: regCaps,
        context_window: Number(regCtx),
        vram_allocated_mb: Number(regVram),
        is_active: true
      });
      success('Model Registered', `${newModel.name} added to local sovereign registry.`);
      setIsRegisterOpen(false);
      setRegId('');
      setRegName('');
      loadData();
    } catch (err: any) {
      error('Registration Failed', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClassifyOnly = async () => {
    if (!testPrompt.trim()) return;
    try {
      setIsClassifying(true);
      setRouteError(null);
      const res = await modelsApi.classify(testPrompt);
      setClassificationResult(res);
      success('Intent Classified', `Detected: ${res.detected_intent} (${res.primary_capability})`);
    } catch (err: any) {
      error('Classification Failed', err.message);
    } finally {
      setIsClassifying(false);
    }
  };

  const handleRouteAndExecute = async () => {
    if (!testPrompt.trim()) return;
    try {
      setIsExecutingRoute(true);
      setRouteError(null);
      setRouteResult(null);

      const res = await modelsApi.routeExecute(testPrompt);
      setRouteResult(res);
      setClassificationResult({
        prompt: testPrompt,
        primary_capability: res.required_capabilities[0] || 'TEXT',
        required_capabilities: res.required_capabilities,
        confidence: res.confidence,
        detected_intent: res.detected_intent,
        reasoning: res.routing_reasoning
      });
      success('Task Executed', `Routed to ${res.model_id} in ${res.execution_time_ms} ms`);
      // Refresh logs
      const updatedLogs = await modelsApi.getRoutingLogs(15);
      setRoutingLogs(Array.isArray(updatedLogs) ? updatedLogs : []);
    } catch (err: any) {
      setRouteError(err.message || 'Execution error');
      error('Routing Rejection', err.message);
      // Refresh logs to see failure record
      const updatedLogs = await modelsApi.getRoutingLogs(15);
      setRoutingLogs(Array.isArray(updatedLogs) ? updatedLogs : []);
    } finally {
      setIsExecutingRoute(false);
    }
  };

  const setSampleQuery = (prompt: string) => {
    setTestPrompt(prompt);
    setClassificationResult(null);
    setRouteResult(null);
    setRouteError(null);
  };

  const healthyCount = models.filter(m => m.health_status === 'HEALTHY' && m.is_active).length;
  const totalVramGb = (models.reduce((acc, m) => acc + (m.vram_allocated_mb || 0), 0) / 1024).toFixed(1);

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sovereign Model Center</h1>
            <Badge variant="ai" size="md">
              Local VRAM Orchestrator
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Provider-independent local foundation models, dynamic task capability routing, and zero cloud telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh local registry & telemetry"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsRegisterOpen(true)}>
            <Plus className="h-4 w-4" />
            Register Model
          </Button>
        </div>
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-card">
          <div>
            <span className="text-xs text-slate-500 font-medium">Registered Models</span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">{models.length}</div>
          </div>
          <div className="p-3 bg-blue-50 text-navy-900 rounded-lg">
            <Cpu className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-card">
          <div>
            <span className="text-xs text-slate-500 font-medium">Healthy & Online</span>
            <div className="text-2xl font-bold text-emerald-600 mt-0.5">{healthyCount}</div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-card">
          <div>
            <span className="text-xs text-slate-500 font-medium">Local VRAM Allocated</span>
            <div className="text-2xl font-bold text-purple-700 mt-0.5">{totalVramGb} GB</div>
          </div>
          <div className="p-3 bg-purple-50 text-purple-700 rounded-lg">
            <Server className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-card">
          <div>
            <span className="text-xs text-slate-500 font-medium">Routing Decisions</span>
            <div className="text-2xl font-bold text-slate-700 mt-0.5">{routingLogs?.length || 0}</div>
          </div>
          <div className="p-3 bg-slate-100 text-slate-700 rounded-lg">
            <Compass className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Model Cards Grid */}
      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-3 shadow-card">
          <LoadingSpinner size="lg" />
          <p className="text-xs text-slate-500 font-medium">Querying local sovereign model instances...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {models.map((model) => {
            const isProbing = probingModelId === model.id;
            return (
              <Card key={model.id} className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-navy-900 text-white shadow-xs">
                      <Cpu className="h-5 w-5 text-indigo-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">{model.name}</h3>
                        {model.is_default && (
                          <Badge variant="sovereign" size="sm">Default</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-mono">
                        <span className="uppercase font-semibold text-slate-700">{model.provider_type}</span>
                        <span>&bull;</span>
                        <span>{model.modality}</span>
                        <span>&bull;</span>
                        <span>{model.context_window?.toLocaleString()} ctx</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Badge 
                      variant={
                        model.health_status === 'HEALTHY' 
                          ? 'success' 
                          : model.health_status === 'DEGRADED' 
                          ? 'warning' 
                          : 'danger'
                      } 
                      size="sm" 
                      dot
                    >
                      {model.health_status}
                    </Badge>
                    <Badge variant={model.is_active ? 'info' : 'neutral'} size="sm">
                      {model.is_active ? 'ACTIVE' : 'STANDBY'}
                    </Badge>
                  </div>
                </div>

                {/* Capability Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {model.capabilities?.map((cap) => {
                    const IconComponent = CAPABILITY_ICONS[cap] || Terminal;
                    return (
                      <span
                        key={cap}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 border border-indigo-100 text-indigo-700 font-mono"
                      >
                        <IconComponent className="h-3 w-3" />
                        {cap}
                      </span>
                    );
                  })}
                </div>

                {/* Engine Endpoint & VRAM Meter */}
                <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Local Endpoint URL:</span>
                    <span className="font-mono text-slate-800 text-[11px] truncate max-w-[200px]" title={model.endpoint_url}>
                      {model.endpoint_url}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">GPU VRAM Allocated</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {(model.vram_allocated_mb / 1024).toFixed(1)} GB
                    </span>
                  </div>
                </div>

                {/* Actions & Health Telemetry */}
                <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                  <div className="text-[11px] text-slate-400 font-mono">
                    Latency: <strong className="text-slate-700">{model.latency_ms ? `${model.latency_ms} ms` : '—'}</strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleCheckHealth(model.id)}
                      disabled={isProbing}
                      title="Run health probe"
                    >
                      <Activity className={`h-3.5 w-3.5 ${isProbing ? 'animate-spin' : ''}`} />
                      Probe
                    </Button>
                    <Button
                      variant={model.is_active ? 'outline' : 'primary'}
                      size="xs"
                      onClick={() => handleToggleStatus(model.id)}
                    >
                      {model.is_active ? 'Standby' : 'Activate'}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Interactive Task Classifier & Sovereign Model Router Sandbox */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-indigo-600" />
                Task Classifier & Dynamic Router Sandbox
              </CardTitle>
              <CardDescription>
                Test task intent detection, capability requirements, and local model dispatch with zero external cloud fallback
              </CardDescription>
            </div>
            <Badge variant="sovereign" size="sm">Zero Cloud Fallback Guaranteed</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {/* Quick-Pick Samples */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 text-[11px] font-medium">Quick Tasks:</span>
            <button
              onClick={() => setSampleQuery('Write a Python function to compute HMAC SHA-256 integrity tokens')}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] transition-colors"
            >
              Coding: Python SHA-256
            </button>
            <button
              onClick={() => setSampleQuery('Summarize the root cause analysis and explain why the gateway failed')}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] transition-colors"
            >
              Reasoning: Root Cause Analysis
            </button>
            <button
              onClick={() => setSampleQuery('Inspect this scanned blueprint diagram and describe components')}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] transition-colors"
            >
              Vision: Blueprint Diagram
            </button>
            <button
              onClick={() => setSampleQuery('Perform OCR extraction and decode this scanned blueprint diagram')}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] transition-colors"
            >
              OCR: Scanned Invoice
            </button>
          </div>

          {/* Prompt Input */}
          <div className="space-y-2">
            <textarea
              rows={3}
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="Enter a task or prompt to classify and route locally..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900 font-mono"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Tasks requiring unavailable capabilities will trigger an actionable 422 refusal.
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClassifyOnly}
                  disabled={isClassifying || isExecutingRoute}
                >
                  {isClassifying ? 'Analyzing...' : 'Classify Intent'}
                </Button>
                <Button
                  variant="ai"
                  size="sm"
                  onClick={handleRouteAndExecute}
                  disabled={isExecutingRoute}
                >
                  <Play className="h-3.5 w-3.5" />
                  {isExecutingRoute ? 'Routing Locally...' : 'Route & Execute'}
                </Button>
              </div>
            </div>
          </div>

          {/* Error refusal box */}
          {routeError && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900 animate-in fade-in">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold block">Sovereign Air-Gap Rejection:</strong>
                <p className="mt-0.5 leading-relaxed">{routeError}</p>
                <p className="text-[10px] text-amber-700 mt-1">
                  Air-gap policy strictly prohibited third-party cloud routing.
                </p>
              </div>
            </div>
          )}

          {/* Classification & Execution Results */}
          {classificationResult && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Detected Intent:</span>
                  <Badge variant="info" size="sm">{classificationResult.detected_intent}</Badge>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({(classificationResult.confidence * 100).toFixed(0)}% confidence)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500">Required:</span>
                  {classificationResult.required_capabilities.map((c) => (
                    <span
                      key={c}
                      className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-bold rounded font-mono"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-xs text-slate-600 italic">
                Reasoning: {classificationResult.reasoning}
              </p>

              {/* Real Local Execution Output */}
              {routeResult && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Dispatched to Local Model: <strong className="font-mono text-indigo-700">{routeResult.model_id}</strong>
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {routeResult.execution_time_ms} ms &bull; {routeResult.prompt_tokens} in / {routeResult.completion_tokens} out
                    </span>
                  </div>
                  <div className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs max-h-56 overflow-y-auto leading-relaxed whitespace-pre-wrap selection:bg-purple-900">
                    {routeResult.text}
                  </div>
                </div>
              )}
            </div>
          )}

        </CardContent>
      </Card>

      {/* Routing Decision History Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Immutable Model Routing Decision Logs
              </CardTitle>
              <CardDescription>
                Auditable governance log of classified intents, capability requirements, and local model dispatch
              </CardDescription>
            </div>
            <Badge variant="neutral" size="sm">{routingLogs?.length || 0} Records</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!routingLogs || routingLogs.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-6">No routing decisions recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-medium">
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Task Prompt</th>
                    <th className="py-2.5 px-3">Detected Intent</th>
                    <th className="py-2.5 px-3">Required Capabilities</th>
                    <th className="py-2.5 px-3">Selected Model</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(Array.isArray(routingLogs) ? routingLogs : []).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800 max-w-xs truncate" title={log.task_prompt}>
                        {log.task_prompt}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {log.detected_intent}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {log.required_capabilities?.map((c) => (
                            <span key={c} className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded text-[10px] font-mono">
                              {c}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-indigo-700">
                        {log.selected_model_id || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant={
                            log.status === 'ROUTED'
                              ? 'success'
                              : log.status === 'NO_COMPATIBLE_MODEL'
                              ? 'warning'
                              : 'danger'
                          }
                          size="sm"
                        >
                          {log.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-500">
                        {log.execution_time_ms} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Register Model Modal */}
      <Modal
        isOpen={isRegisterOpen}
        onClose={() => !isSubmitting && setIsRegisterOpen(false)}
        title="Register On-Premises Model"
        description="Configure a local inference engine (Ollama, vLLM, llama.cpp, or mock) with declared capabilities."
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRegisterOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRegisterSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Registering...' : 'Register Engine'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleRegisterSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Model Slug ID
              </label>
              <input
                type="text"
                placeholder="e.g. qwen2-vl-7b"
                value={regId}
                onChange={(e) => setRegId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900 font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Display Title
              </label>
              <input
                type="text"
                placeholder="e.g. Qwen2-VL 7B Vision"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Provider Adapter
              </label>
              <select
                value={regProvider}
                onChange={(e) => setRegProvider(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
              >
                <option value="mock">mock (Deterministic Test / GPU-free)</option>
                <option value="ollama">ollama (Local Ollama Daemon)</option>
                <option value="vllm">vllm (OpenAI-compatible server)</option>
                <option value="llamacpp">llamacpp (llama.cpp server)</option>
                <option value="tgi">tgi (Text Generation Inference)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Modality
              </label>
              <select
                value={regModality}
                onChange={(e) => setRegModality(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
              >
                <option value="text">text</option>
                <option value="vision">vision</option>
                <option value="embedding">embedding</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Endpoint URL
            </label>
            <input
              type="text"
              placeholder="http://127.0.0.1:8001/v1 or http://127.0.0.1:11434"
              value={regEndpoint}
              onChange={(e) => setRegEndpoint(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900 font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Declared Capabilities
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['TEXT', 'REASONING', 'CODING', 'VISION', 'EMBEDDING', 'OCR'].map((cap) => {
                const isSelected = regCaps.includes(cap);
                return (
                  <button
                    type="button"
                    key={cap}
                    onClick={() => handleCapabilityToggle(cap)}
                    className={`flex items-center justify-between p-2 rounded-lg border text-xs font-mono font-semibold transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>{cap}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-indigo-700" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Context Window (Tokens)
              </label>
              <input
                type="number"
                value={regCtx}
                onChange={(e) => setRegCtx(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                VRAM Allocation (MB)
              </label>
              <input
                type="number"
                value={regVram}
                onChange={(e) => setRegVram(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900 font-mono"
              />
            </div>
          </div>

          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Local on-premises engine only. Zero cloud API leakage.</span>
          </div>
        </form>
      </Modal>

    </div>
  );
};
