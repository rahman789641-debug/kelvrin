import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { 
  agentsApi, 
  AgentItem, 
  AgentTemplateItem, 
  AgentRunItem, 
  AgentStepItem 
} from '../services/api';
import { 
  Bot, 
  Play, 
  CheckCircle2, 
  Clock, 
  Terminal, 
  ShieldAlert, 
  Layers, 
  ArrowRight, 
  Cpu, 
  Search, 
  ShieldCheck,
  ChevronRight,
  Plus,
  AlertTriangle,
  XCircle,
  RotateCcw,
  FileText,
  Check,
  PauseCircle,
  Sparkles,
  Sliders,
  Trash2,
  Lock,
  FileSpreadsheet,
  Presentation,
  Calculator,
  Eye,
  RefreshCw
} from 'lucide-react';

const ALL_LOCAL_TOOLS = [
  { id: 'read_document', name: 'read_document', category: 'Document', desc: 'Reads parsed documents and structural metadata' },
  { id: 'search_knowledge_base', name: 'search_knowledge_base', category: 'Knowledge', desc: 'Hybrid vector search over sovereign chunks' },
  { id: 'extract_text', name: 'extract_text', category: 'Document', desc: 'Sanitizes and extracts text from files' },
  { id: 'OCR_document', name: 'OCR_document', category: 'Vision & OCR', desc: 'Local OCR engine for scanned files' },
  { id: 'analyze_image', name: 'analyze_image', category: 'Vision & OCR', desc: 'Local vision analysis for technical drawings' },
  { id: 'calculate', name: 'calculate', category: 'Compute', desc: 'Deterministic AST mathematical calculator' },
  { id: 'execute_python_sandbox', name: 'execute_python_sandbox', category: 'Compute', desc: 'Isolated sandbox for Python scripts (Sensitive)', sensitive: true },
  { id: 'generate_docx', name: 'generate_docx', category: 'Office Docs', desc: 'Generates Word (.docx) audit reports' },
  { id: 'generate_xlsx', name: 'generate_xlsx', category: 'Office Docs', desc: 'Builds structured Excel spreadsheets' },
  { id: 'generate_pptx', name: 'generate_pptx', category: 'Office Docs', desc: 'Produces executive PowerPoint decks' },
  { id: 'write_local_file', name: 'write_local_file', category: 'Storage', desc: 'Writes sandboxed files to scratch disk (Sensitive)', sensitive: true }
];

export const AgentsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'agents' | 'templates' | 'runs'>('runs');
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [templates, setTemplates] = useState<AgentTemplateItem[]>([]);
  const [runs, setRuns] = useState<AgentRunItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<AgentRunItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Dispatch modal
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchGoal, setDispatchGoal] = useState('');
  const [dispatchAgentId, setDispatchAgentId] = useState<string>('');
  const [isDispatching, setIsDispatching] = useState(false);

  // Create Agent modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDesc, setNewAgentDesc] = useState('');
  const [newAgentCategory, setNewAgentCategory] = useState('Analysis');
  const [newAgentSystemPrompt, setNewAgentSystemPrompt] = useState('You are an autonomous sovereign agent operating under strict on-premises security boundaries.');
  const [newAgentModel, setNewAgentModel] = useState('deepseek-r1-14b');
  const [newAgentTools, setNewAgentTools] = useState<string[]>([
    'read_document', 'search_knowledge_base', 'calculate', 'generate_docx'
  ]);
  const [newAgentMaxSteps, setNewAgentMaxSteps] = useState(10);
  const [isSavingAgent, setIsSavingAgent] = useState(false);

  const { success, error, info } = useToast();

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [agentsData, templatesData, runsData] = await Promise.all([
        agentsApi.list().catch(() => []),
        agentsApi.listTemplates().catch(() => []),
        agentsApi.listRuns().catch(() => [])
      ]);
      setAgents(agentsData);
      setTemplates(templatesData);
      setRuns(runsData);

      if (runsData.length > 0 && !selectedRun) {
        setSelectedRun(runsData[0]);
      } else if (selectedRun) {
        const updated = runsData.find(r => r.id === selectedRun.id);
        if (updated) setSelectedRun(updated);
      }
    } catch (err: any) {
      error('Failed to load agent data', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Poll active run if running or waiting
  useEffect(() => {
    let timer: any = null;
    if (selectedRun && (selectedRun.status === 'RUNNING' || selectedRun.status === 'PENDING')) {
      timer = setInterval(async () => {
        try {
          const fresh = await agentsApi.getRun(selectedRun.id);
          setSelectedRun(fresh);
          setRuns(prev => prev.map(r => r.id === fresh.id ? fresh : r));
        } catch {
          // ignore transient poll error
        }
      }, 2000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [selectedRun?.status, selectedRun?.id]);

  const handleDispatchRun = async () => {
    if (!dispatchGoal.trim()) {
      error('Validation Error', 'Please provide a clear goal for the autonomous agent.');
      return;
    }
    try {
      setIsDispatching(true);
      const targetAgent = agents.find(a => a.id === dispatchAgentId);
      const run = await agentsApi.triggerRun({
        goal: dispatchGoal.trim(),
        agent_id: targetAgent ? targetAgent.id : undefined,
        agent_name: targetAgent ? targetAgent.name : 'Sovereign ReAct Agent',
        tool_allowlist: targetAgent ? targetAgent.tool_allowlist : undefined,
        max_steps: targetAgent ? targetAgent.max_steps : 10
      });
      success('Agent Run Dispatched', `Goal assigned to ${run.agent_name}.`);
      setRuns(prev => [run, ...prev]);
      setSelectedRun(run);
      setIsDispatchModalOpen(false);
      setDispatchGoal('');
      setActiveTab('runs');
    } catch (err: any) {
      error('Dispatch Failed', err.message);
    } finally {
      setIsDispatching(false);
    }
  };

  const handleDispatchInspectionDemo = async () => {
    try {
      info('Dispatching PV-201 Workflow', 'Executing 15-step ReAct Inspection Approval Agent...');
      const run = await agentsApi.triggerRun({
        agent_name: 'Inspection Approval Agent',
        goal: 'Read the inspection report for PV-201 Pressure Vessel, identify key findings, consult the relevant local SOP, and prepare an approval note.',
        max_steps: 10
      });
      setRuns(prev => [run, ...prev]);
      setSelectedRun(run);
      setActiveTab('runs');
      success('Agent Dispatched', 'PV-201 Inspection Approval workflow initiated.');
    } catch (err: any) {
      error('Dispatch Failed', err.message);
    }
  };

  const handleApproveStep = async (stepId: string) => {
    if (!selectedRun) return;
    try {
      info('Authorizing Step', 'Submitting human-in-the-loop authorization checkpoint...');
      const updatedRun = await agentsApi.approveStep(selectedRun.id, stepId);
      setSelectedRun(updatedRun);
      setRuns(prev => prev.map(r => r.id === updatedRun.id ? updatedRun : r));
      success('Step Authorized', 'Agent execution resumed with granted privileges.');
    } catch (err: any) {
      error('Authorization Failed', err.message);
    }
  };

  const handleCancelRun = async () => {
    if (!selectedRun) return;
    try {
      const updated = await agentsApi.cancelRun(selectedRun.id);
      setSelectedRun(updated);
      setRuns(prev => prev.map(r => r.id === updated.id ? updated : r));
      info('Run Cancelled', 'Active agent execution halted by operator.');
    } catch (err: any) {
      error('Cancellation Failed', err.message);
    }
  };

  const handleCreateAgent = async () => {
    if (!newAgentName.trim()) {
      error('Validation Error', 'Agent name is required.');
      return;
    }
    if (newAgentTools.length === 0) {
      error('Validation Error', 'At least one tool must be in the allowlist.');
      return;
    }
    try {
      setIsSavingAgent(true);
      const agent = await agentsApi.create({
        name: newAgentName.trim(),
        description: newAgentDesc.trim() || 'Custom autonomous sovereign agent',
        category: newAgentCategory,
        system_prompt: newAgentSystemPrompt.trim(),
        model_id: newAgentModel,
        tool_allowlist: newAgentTools,
        max_steps: newAgentMaxSteps
      });
      setAgents(prev => [agent, ...prev]);
      success('Agent Created', `Agent "${agent.name}" saved to sovereign registry.`);
      setIsCreateModalOpen(false);
      setNewAgentName('');
      setNewAgentDesc('');
    } catch (err: any) {
      error('Creation Failed', err.message);
    } finally {
      setIsSavingAgent(false);
    }
  };

  const handleUseTemplate = (template: AgentTemplateItem) => {
    setNewAgentName(template.name);
    setNewAgentDesc(template.description);
    setNewAgentCategory(template.category);
    setNewAgentSystemPrompt(template.system_prompt);
    setNewAgentModel(template.default_model_id);
    setNewAgentTools(template.default_tools);
    setNewAgentMaxSteps(template.max_steps);
    setIsCreateModalOpen(true);
  };

  const handleDeleteAgent = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete agent "${name}"?`)) return;
    try {
      await agentsApi.delete(id);
      setAgents(prev => prev.filter(a => a.id !== id));
      success('Agent Deleted', `Removed "${name}" from sovereign registry.`);
    } catch (err: any) {
      error('Delete Failed', err.message);
    }
  };

  const toggleTool = (toolId: string) => {
    setNewAgentTools(prev => 
      prev.includes(toolId) ? prev.filter(t => t !== toolId) : [...prev, toolId]
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Kelvrin Autonomous Agent Engine</h1>
            <Badge variant="ai" size="md">
              ReAct &bull; Phase 10
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Goal-directed autonomous agents equipped with 11 sovereign tools, sandboxed execution, and Human-in-the-Loop governance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDispatchInspectionDemo}
            className="border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 font-semibold"
            title="Dispatch PV-201 Inspection Approval Agent Scenario"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1 text-indigo-600" />
            PV-201 Demo
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create Agent
          </Button>
          <Button 
            variant="primary" 
            size="sm" 
            onClick={() => {
              if (agents.length > 0 && !dispatchAgentId) {
                setDispatchAgentId(agents[0].id);
              }
              setIsDispatchModalOpen(true);
            }}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Dispatch Goal
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('runs')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'runs'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Terminal className="h-3.5 w-3.5" />
          Live Runs & Studio
          {runs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] text-slate-600">
              {runs.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('agents')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'agents'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Bot className="h-3.5 w-3.5" />
          My Agents
          {agents.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] text-slate-600">
              {agents.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'templates'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Templates
          {templates.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] text-slate-600">
              {templates.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: LIVE RUNS & STUDIO */}
      {activeTab === 'runs' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Runs History List */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Execution History</h2>
              <Button size="xs" variant="ghost" onClick={loadData}>
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
            </div>

            {runs.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-xs text-slate-400">
                No active or recorded runs. Dispatch a goal to begin.
              </div>
            ) : (
              <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
                {runs.map(run => {
                  const isSelected = selectedRun?.id === run.id;
                  const isWaiting = run.status === 'WAITING_APPROVAL';
                  const isRunning = run.status === 'RUNNING';

                  return (
                    <div
                      key={run.id}
                      onClick={() => setSelectedRun(run)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-500/10 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {run.agent_name}
                        </span>
                        <Badge
                          variant={
                            run.status === 'COMPLETED' ? 'success' :
                            run.status === 'RUNNING' ? 'ai' :
                            run.status === 'WAITING_APPROVAL' ? 'warning' :
                            run.status === 'CANCELLED' ? 'neutral' : 'danger'
                          }
                          size="sm"
                          dot={isRunning || isWaiting}
                        >
                          {run.status}
                        </Badge>
                      </div>

                      <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">
                        {run.goal}
                      </p>

                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>Steps: {run.steps.length} / {run.max_steps}</span>
                        <span>{new Date(run.started_at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Active Run Inspector */}
          <div className="lg:col-span-8">
            {selectedRun ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-navy-900 text-white">
                        <Terminal className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm">
                          {selectedRun.agent_name} &bull; Live Run Inspector
                        </CardTitle>
                        <CardDescription>
                          Sovereign ReAct execution trace: strictly zero chain-of-thought leaked.
                        </CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {selectedRun.status === 'RUNNING' && (
                        <Button size="xs" variant="outline" onClick={handleCancelRun}>
                          <PauseCircle className="h-3 w-3 text-red-500" />
                          Cancel Run
                        </Button>
                      )}
                      <Badge
                        variant={
                          selectedRun.status === 'COMPLETED' ? 'success' :
                          selectedRun.status === 'RUNNING' ? 'ai' :
                          selectedRun.status === 'WAITING_APPROVAL' ? 'warning' :
                          selectedRun.status === 'CANCELLED' ? 'neutral' : 'danger'
                        }
                        size="md"
                      >
                        {selectedRun.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Goal Banner */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Assigned Autonomous Objective
                      </span>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        "{selectedRun.goal}"
                      </p>
                    </div>
                    <div className="shrink-0 font-mono text-[11px] text-slate-500">
                      Step {selectedRun.current_step} of {selectedRun.max_steps}
                    </div>
                  </div>

                  {/* HITL Notice Banner if Waiting */}
                  {selectedRun.status === 'WAITING_APPROVAL' && (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 text-amber-800">
                        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
                        <div>
                          <strong className="block font-bold">Human-in-the-Loop Authorization Required</strong>
                          <span className="text-[11px] text-amber-700">
                            The agent requested execution of a sensitive action. Review and click "Authorize Step" below to resume.
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Planned Steps Sequence */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-slate-500" />
                      Execution Steps
                    </h3>

                    {/* Render completed/active steps */}
                    {selectedRun.steps.map((step) => {
                      const isWaitingThis = step.status === 'WAITING_APPROVAL';
                      const isRunningThis = step.status === 'RUNNING';
                      const isDone = step.status === 'COMPLETED';
                      const isFailed = step.status === 'FAILED';

                      return (
                        <div
                          key={step.id}
                          className={`p-4 rounded-xl border transition-all space-y-2.5 ${
                            isWaitingThis ? 'bg-amber-50/40 border-amber-300 ring-2 ring-amber-400/20' :
                            isRunningThis ? 'bg-indigo-50/30 border-indigo-300' :
                            isDone ? 'bg-white border-slate-200' : 'bg-red-50/30 border-red-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`h-5 w-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                                isDone ? 'bg-emerald-600 text-white' :
                                isRunningThis ? 'bg-indigo-600 text-white animate-pulse' :
                                isWaitingThis ? 'bg-amber-500 text-white' : 'bg-slate-300 text-slate-700'
                              }`}>
                                {isDone ? '✓' : step.step_number}
                              </span>
                              <span className="font-bold text-slate-800">
                                {step.title || `Step ${step.step_number}: ${step.action_name}`}
                              </span>
                              {step.action_name && (
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  tool: {step.action_name}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {step.duration_ms !== undefined && step.duration_ms !== null && (
                                <span className="font-mono text-[10px] text-slate-400">
                                  {step.duration_ms}ms
                                </span>
                              )}
                              <Badge
                                variant={
                                  isDone ? 'success' :
                                  isRunningThis ? 'ai' :
                                  isWaitingThis ? 'warning' : 'danger'
                                }
                                size="sm"
                              >
                                {step.status}
                              </Badge>
                            </div>
                          </div>

                          {/* Safe Output Summary (Zero CoT) */}
                          {step.safe_summary && (
                            <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-slate-700 flex items-start gap-2">
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                              <div>
                                <strong className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                                  Safe Output Summary
                                </strong>
                                <p className="mt-0.5 text-slate-800 font-sans">{step.safe_summary}</p>
                              </div>
                            </div>
                          )}

                          {/* Error if Failed */}
                          {step.error_message && (
                            <div className="text-xs bg-red-50 p-2.5 rounded-lg border border-red-200 text-red-700">
                              <strong>Error:</strong> {step.error_message}
                            </div>
                          )}

                          {/* Human in the loop action button */}
                          {isWaitingThis && (
                            <div className="p-3 bg-amber-100/60 rounded-lg border border-amber-300 flex items-center justify-between text-xs mt-2">
                              <span className="text-amber-900 font-medium">
                                Sensitive Tool Gate: Requires explicit operator approval.
                              </span>
                              <Button
                                size="xs"
                                variant="primary"
                                onClick={() => handleApproveStep(step.id)}
                              >
                                <Check className="h-3 w-3" />
                                Authorize Step
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Pending steps from Plan */}
                    {selectedRun.plan && selectedRun.plan.slice(selectedRun.steps.length).map((pendingItem, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-400"
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full border border-slate-300 text-[11px] font-bold flex items-center justify-center text-slate-400">
                            {selectedRun.steps.length + idx + 1}
                          </span>
                          <span className="font-medium text-slate-600">
                            {pendingItem.title}
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            tool: {pendingItem.tool}
                          </span>
                        </div>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                          Pending
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Final Output Report */}
                  {selectedRun.final_output && (
                    <div className="p-4 bg-slate-900 text-slate-100 rounded-xl space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                        <span className="text-slate-400 uppercase tracking-wider text-[10px] font-bold">
                          Final Autonomous Deliverable
                        </span>
                        <Badge variant="sovereign" size="sm">Air-gapped Synthesis</Badge>
                      </div>
                      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-200">
                        {selectedRun.final_output}
                      </pre>
                    </div>
                  )}

                </CardContent>
              </Card>
            ) : (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-xs text-slate-400">
                Select an agent run to view its live execution trace.
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 2: MY AGENTS */}
      {activeTab === 'agents' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Configured autonomous agents with customized prompts, model bindings, and strict tool allowlists.
            </p>
            <Button size="sm" variant="primary" onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New Agent
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map(agent => (
              <Card key={agent.id} className="hover:border-slate-300 transition-all">
                <CardHeader>
                  <div className="flex items-start justify-between w-full">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-bold text-slate-900">{agent.name}</CardTitle>
                        <Badge variant="neutral" size="sm" className="mt-0.5">{agent.category}</Badge>
                      </div>
                    </div>
                    <Button 
                      size="xs" 
                      variant="ghost" 
                      onClick={() => handleDeleteAgent(agent.id, agent.name)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-xs text-slate-600 line-clamp-2">
                    {agent.description}
                  </p>

                  <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Model:</span>
                      <strong className="text-slate-700 font-mono text-[11px]">{agent.model_id}</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Max Steps:</span>
                      <span className="font-semibold text-slate-700">{agent.max_steps}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
                        Allowed Tools ({agent.tool_allowlist.length})
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {agent.tool_allowlist.map(t => (
                          <span key={t} className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono text-slate-600">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <Button 
                      size="sm" 
                      variant="primary" 
                      className="w-full"
                      onClick={() => {
                        setDispatchAgentId(agent.id);
                        setIsDispatchModalOpen(true);
                      }}
                    >
                      <Play className="h-3 w-3 fill-current" />
                      Dispatch Task
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: TEMPLATES */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Enterprise sovereign templates equipped with pre-tuned system prompts and specialized toolsets.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(tmpl => (
              <Card key={tmpl.id} className="hover:border-slate-300 transition-all flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-start justify-between w-full">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-bold text-slate-900">{tmpl.name}</CardTitle>
                        <Badge variant="success" size="sm" className="mt-0.5">{tmpl.category}</Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <p className="text-xs text-slate-600">
                      {tmpl.description}
                    </p>

                    <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Default Model:</span>
                        <strong className="text-slate-700 font-mono text-[11px]">{tmpl.default_model_id}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
                          Default Tools ({tmpl.default_tools.length})
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {tmpl.default_tools.map(t => (
                            <span key={t} className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono text-slate-600">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-full"
                      onClick={() => handleUseTemplate(tmpl)}
                    >
                      Use Template
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* DISPATCH GOAL MODAL */}
      <Modal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        title="Dispatch Autonomous Agent Goal"
        description="Assign a mission objective to execute on the isolated local sovereign runner."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsDispatchModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleDispatchRun} disabled={isDispatching}>
              {isDispatching ? 'Dispatching...' : 'Initiate Autonomous Run'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Agent Profile
            </label>
            <select
              value={dispatchAgentId}
              onChange={(e) => setDispatchAgentId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
            >
              <option value="">Autonomous Sovereign Agent (Default)</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.category})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mission Objective / Goal <span className="text-red-500">*</span>
            </label>
            <textarea
              value={dispatchGoal}
              onChange={(e) => setDispatchGoal(e.target.value)}
              placeholder="e.g. Calculate risk metrics, verify against document policies, and compile a verified Word report (.docx)..."
              rows={4}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
            <span className="font-semibold text-slate-800">Sovereign Guardrails:</span>
            <ul className="list-disc pl-4 text-[11px] text-slate-500 space-y-0.5">
              <li>Air-gapped execution: Zero external API calls</li>
              <li>Sandboxed filesystem: Path traversal blocked</li>
              <li>Human-in-the-loop: Sensitive tools pause for authorization</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* CREATE AGENT MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Sovereign Agent"
        description="Configure a custom goal-directed agent with a dedicated tool allowlist and local model."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateAgent} disabled={isSavingAgent}>
              {isSavingAgent ? 'Saving...' : 'Save Agent'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 max-h-[650px] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Agent Name *</label>
              <input
                type="text"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="e.g. Audit Intelligence Agent"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:ring-2 focus:ring-navy-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={newAgentCategory}
                onChange={(e) => setNewAgentCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:ring-2 focus:ring-navy-900"
              >
                <option value="Analysis">Analysis</option>
                <option value="Compliance">Compliance</option>
                <option value="Vision & OCR">Vision & OCR</option>
                <option value="Compute">Compute</option>
                <option value="Automation">Automation</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <input
              type="text"
              value={newAgentDesc}
              onChange={(e) => setNewAgentDesc(e.target.value)}
              placeholder="Brief description of duties..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">System Prompt</label>
            <textarea
              value={newAgentSystemPrompt}
              onChange={(e) => setNewAgentSystemPrompt(e.target.value)}
              rows={3}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 font-mono text-[11px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Local Model</label>
              <select
                value={newAgentModel}
                onChange={(e) => setNewAgentModel(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
              >
                <option value="deepseek-r1-14b">deepseek-r1-14b (Reasoning)</option>
                <option value="llama-3-8b">llama-3-8b (General)</option>
                <option value="qwen-2.5-7b">qwen-2.5-7b (Fast)</option>
                <option value="mistral-7b">mistral-7b (Analytical)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Steps Limit</label>
              <input
                type="number"
                min={1}
                max={20}
                value={newAgentMaxSteps}
                onChange={(e) => setNewAgentMaxSteps(parseInt(e.target.value) || 10)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
              />
            </div>
          </div>

          {/* Tool Allowlist Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Permitted Tool Allowlist ({newAgentTools.length} selected)
            </label>
            <div className="space-y-1.5 border border-slate-200 rounded-lg p-2.5 bg-slate-50 max-h-[220px] overflow-y-auto">
              {ALL_LOCAL_TOOLS.map(tool => {
                const isChecked = newAgentTools.includes(tool.id);
                return (
                  <label
                    key={tool.id}
                    className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${
                      isChecked ? 'bg-white border border-indigo-200 shadow-xs' : 'hover:bg-slate-100 border border-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleTool(tool.id)}
                      className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1 text-xs">
                      <div className="flex items-center gap-2">
                        <strong className="font-mono text-slate-800 text-[11px]">{tool.name}</strong>
                        {tool.sensitive && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-700 text-[9px] font-semibold">
                            Sensitive / HITL
                          </span>
                        )}
                        <span className="text-slate-400 text-[10px] ml-auto">{tool.category}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{tool.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

    </div>
  );
};
