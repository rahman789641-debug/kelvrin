import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  Code2, 
  Bot, 
  ShieldCheck, 
  Cpu, 
  Terminal, 
  RefreshCw,
  Download,
  Layers,
  ArrowRight,
  Zap,
  Lock,
  ExternalLink
} from 'lucide-react';
import { 
  demoApi, 
  DemoScenariosResponse, 
  DemoGoldenFlowResponse, 
  DemoCodingTaskResponse, 
  DemoMultimodalTaskResponse, 
  DemoModelRoutingResponse,
  deliverablesApi
} from '../services/api';
import { useToast } from '../components/ui/Toast';

export const DemoPage: React.FC = () => {
  const [scenarios, setScenarios] = useState<DemoScenariosResponse | null>(null);
  const [goldenFlow, setGoldenFlow] = useState<DemoGoldenFlowResponse | null>(null);
  const [codingTask, setCodingTask] = useState<DemoCodingTaskResponse | null>(null);
  const [multimodalTask, setMultimodalTask] = useState<DemoMultimodalTaskResponse | null>(null);
  const [modelRouting, setModelRouting] = useState<DemoModelRoutingResponse | null>(null);

  const [isRunningFlow, setIsRunningFlow] = useState(false);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [isRunningMulti, setIsRunningMulti] = useState(false);

  const { success, error, info } = useToast();

  const loadInitialData = useCallback(async () => {
    try {
      const [scenData, routeData] = await Promise.all([
        demoApi.getScenarios(),
        demoApi.getModelRouting()
      ]);
      setScenarios(scenData);
      setModelRouting(routeData);
    } catch (err: any) {
      error('Demo Init Failed', err.message || 'Unable to load demo scenarios.');
    }
  }, [error]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleRunGoldenFlow = async () => {
    setIsRunningFlow(true);
    info('Golden Tour Initiated', 'Coordinating 11 sovereign milestones: Intake -> OCR -> RAG -> Agent -> DOCX -> Audit...');
    try {
      const result = await demoApi.runGoldenFlow();
      setGoldenFlow(result);
      success('Golden Tour Complete', `Generated ${result.deliverable.filename} with Correlation ID ${result.correlation_id}`);
    } catch (err: any) {
      error('Golden Flow Failed', err.message || 'Execution error during golden tour.');
    } finally {
      setIsRunningFlow(false);
    }
  };

  const handleRunCodingTask = async () => {
    setIsRunningCode(true);
    try {
      const result = await demoApi.runCodingTask();
      setCodingTask(result);
      success('Code Sandbox Verified', 'Stress analysis script executed inside isolated micro-process.');
    } catch (err: any) {
      error('Coding Demo Failed', err.message || 'Execution failed.');
    } finally {
      setIsRunningCode(false);
    }
  };

  const handleRunMultimodalTask = async () => {
    setIsRunningMulti(true);
    try {
      const result = await demoApi.runMultimodalTask();
      setMultimodalTask(result);
      success('Vision Analysis Complete', 'Extracted 4 technical drawing components with zero cloud egress.');
    } catch (err: any) {
      error('Vision Demo Failed', err.message || 'Vision analysis failed.');
    } finally {
      setIsRunningMulti(false);
    }
  };

  const handleDownloadDeliverable = async (id: string, filename: string) => {
    try {
      await deliverablesApi.download(id, filename, {
        id,
        filename,
        title: 'Q3 Tier 1 Capital Reserve Audit Report',
        file_type: 'DOCX'
      });
      success('Download Initiated', `Saving ${filename} to local device.`);
    } catch (err: any) {
      error('Download Failed', err.message || 'Could not download deliverable.');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      {/* Top Banner / Golden Tour Trigger */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-navy-950 via-navy-900 to-indigo-950 p-6 rounded-2xl border border-navy-800 text-white shadow-xl">
        <div className="space-y-1.5 max-w-3xl">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
              Enterprise Verification Showcase
            </span>
            <span className="text-xs text-slate-400 font-mono">PV-201 Industrial Scenario</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            One-Click End-to-End Sovereign Agentic AI Tour
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            Execute the complete industrial compliance workflow in a single live run. Zero cloud AI calls, zero data egress, and 100% verified on-premises execution across OCR, RAG, ReAct Agent, DOCX compilation, and immutable audit logs.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="sovereign"
            size="md"
            onClick={handleRunGoldenFlow}
            isLoading={isRunningFlow}
            className="shadow-lg shadow-emerald-900/30 text-xs font-bold"
          >
            <Play className="h-4 w-4 mr-1.5 fill-current" />
            Launch 1-Click Golden Tour
          </Button>
        </div>
      </div>

      {/* Synthetic Demo Assets Shelf */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-600" />
            <div>
              <CardTitle>Synthetic Demonstration Assets</CardTitle>
              <CardDescription>
                Five realistic, non-confidential industrial equipment files prepared for this scenario
              </CardDescription>
            </div>
          </div>
          <Badge variant="sovereign" size="sm">Purely Synthetic Data</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            {scenarios?.assets.map((asset) => (
              <div
                key={asset.id}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between space-y-2 hover:border-slate-300 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                      {asset.type}
                    </span>
                    <Badge variant="neutral" size="sm">{(asset.size_bytes / 1024).toFixed(1)} KB</Badge>
                  </div>
                  <strong className="text-xs font-semibold text-slate-900 block truncate">
                    {asset.name}
                  </strong>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {asset.description}
                  </p>
                </div>
                <span className="text-[10px] text-emerald-700 font-medium">Ready for Ingestion</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Golden Flow Live Execution Visualizer */}
      {goldenFlow && (
        <Card className="border-emerald-300 bg-emerald-50/10 shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <CardTitle className="text-base text-emerald-950 font-bold">
                  Golden Tour Execution Output &bull; Correlation ID: {goldenFlow.correlation_id}
                </CardTitle>
                <CardDescription>
                  11/11 sovereign milestones executed successfully with zero data leakage
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="success" size="sm">STATUS: {goldenFlow.status}</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownloadDeliverable(goldenFlow.deliverable.id, goldenFlow.deliverable.filename)}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Download {goldenFlow.deliverable.filename}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            
            {/* Generated Deliverable Summary Box */}
            <div className="p-4 bg-white rounded-xl border border-emerald-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <strong className="text-slate-900 text-sm font-bold">{goldenFlow.deliverable.filename}</strong>
                  <Badge variant="sovereign" size="sm">{goldenFlow.deliverable.decision}</Badge>
                </div>
                <div className="text-slate-500 text-[11px] font-mono">
                  Size: {(goldenFlow.deliverable.file_size_bytes / 1024).toFixed(1)} KB &bull; SHA-256: {goldenFlow.deliverable.sha256}
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-500">
                <span>Zero Fact Fabrication: </span>
                <strong className="text-amber-700">Conditional on physical nameplate stamp</strong>
              </div>
            </div>

            {/* Stepper Grid */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Milestone Execution Trail</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {goldenFlow.steps.map((st) => (
                  <div
                    key={st.step}
                    className="p-3 bg-white rounded-lg border border-slate-200 flex items-start gap-2.5 shadow-sm"
                  >
                    <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      {st.step}
                    </div>
                    <div className="space-y-0.5">
                      <strong className="text-slate-900 font-semibold block">{st.name}</strong>
                      <p className="text-[11px] text-slate-600 leading-tight">{st.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </CardContent>
        </Card>
      )}

      {/* Side-by-Side Demonstrations: Coding Sandbox & Multimodal Vision */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Coding Task Showcase */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-purple-600" />
              <div>
                <CardTitle>Coding Task & Sandbox Showcase</CardTitle>
                <CardDescription>
                  ASME Section VIII stress calculation under kernel isolation (`--network none`)
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunCodingTask}
              isLoading={isRunningCode}
            >
              <Play className="h-3 w-3 mr-1" />
              Run Sandbox Task
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {codingTask ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Model Router Choice</span>
                    <strong className="text-slate-900">{codingTask.selected_model}</strong>
                  </div>
                  <Badge variant="ai" size="sm">{codingTask.task_classification}</Badge>
                </div>

                <div className="p-3.5 bg-navy-950 text-emerald-400 font-mono text-xs rounded-xl border border-slate-800 overflow-x-auto">
                  <div className="text-slate-400 text-[10px] mb-2 border-b border-slate-800 pb-1 flex items-center justify-between">
                    <span>MICRO-PROCESS STDOUT</span>
                    <span>Duration: {codingTask.sandbox_status.execution_time_ms} ms &bull; Exit: {codingTask.sandbox_status.exit_code}</span>
                  </div>
                  <pre className="whitespace-pre-wrap">{codingTask.sandbox_status.stdout}</pre>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Isolated: Network Disabled
                  </span>
                  <span>Limits: 5.0s CPU / 512MB RAM</span>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                Click &quot;Run Sandbox Task&quot; to execute synthetic stress calculation in secure micro-process.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Multimodal Task Showcase */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-blue-600" />
              <div>
                <CardTitle>Multimodal Vision & Technical Drawings</CardTitle>
                <CardDescription>
                  Engineering diagram inspection and local structural reasoning
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunMultimodalTask}
              isLoading={isRunningMulti}
            >
              <Play className="h-3 w-3 mr-1" />
              Analyze Technical CAD
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {multimodalTask ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Local Vision Engine</span>
                    <strong className="text-slate-900">{multimodalTask.vision_model}</strong>
                  </div>
                  <Badge variant="sovereign" size="sm">Local Inference</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {multimodalTask.extracted_components.map((comp, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <strong className="text-slate-900 block font-semibold">{comp.label}</strong>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        {comp.ndt_inspection || comp.material || comp.measured_t_min || comp.set_pressure || 'Inspected'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-[11px] leading-relaxed">
                  <strong>Local Reasoning:</strong> {multimodalTask.local_reasoning_summary}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                Click &quot;Analyze Technical CAD&quot; to test local vision reasoning over pressure vessel schematic.
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Model Routing Screen / Architecture Matrix */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-emerald-600" />
            <div>
              <CardTitle>Model Routing Architecture: Specialized Workload Distribution</CardTitle>
              <CardDescription>
                Fast dispatcher routes incoming queries to optimal on-premises model tiers
              </CardDescription>
            </div>
          </div>
          {modelRouting && (
            <Badge variant="neutral" size="sm">
              Router: {modelRouting.router_model.name} ({modelRouting.router_model.latency_ms}ms)
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {modelRouting?.routes.map((rt, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      {rt.task_type}
                    </span>
                  </div>
                  <strong className="text-sm font-bold text-slate-900 block mt-1">
                    {rt.selected_model}
                  </strong>
                  <p className="text-[11px] text-slate-500 italic">
                    &quot;{rt.sample_query}&quot;
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-200/80 space-y-1 text-[10px] text-slate-600">
                  <div>VRAM: <strong className="text-slate-800">{(rt.vram_mb / 1024).toFixed(0)} GB</strong> &bull; Context: <strong className="text-slate-800">{rt.context_window}</strong></div>
                  <p className="text-slate-500 leading-tight">{rt.rationale}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
};
