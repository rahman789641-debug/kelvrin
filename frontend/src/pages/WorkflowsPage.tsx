import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { MOCK_WORKFLOWS } from '../services/mockData';
import { 
  Workflow, 
  Play, 
  CheckCircle2, 
  ArrowRight, 
  FileText, 
  Eye, 
  Cpu, 
  ShieldAlert, 
  Download, 
  Clock,
  Sparkles,
  Plus
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export const WorkflowsPage: React.FC = () => {
  const [selectedWorkflow, setSelectedWorkflow] = useState(MOCK_WORKFLOWS[0]);
  const [isRunning, setIsRunning] = useState(false);
  const { success, info } = useToast();

  const handleRun = () => {
    setIsRunning(true);
    info('Pipeline Triggered', `Executing DAG workflow "${selectedWorkflow.title}"...`);

    setTimeout(() => {
      setIsRunning(false);
      success('Pipeline Completed', 'All 6 nodes executed successfully with zero egress.');
    }, 1500);
  };

  const DAG_NODES = [
    { id: 1, title: 'Document Ingestion', type: 'Input', icon: FileText, status: 'DONE', meta: 'SHA-256 Verified' },
    { id: 2, title: 'Local OCR Pipeline', type: 'Transform', icon: Eye, status: 'DONE', meta: 'PaddleOCR Engine' },
    { id: 3, title: 'Chunking & Embed', type: 'Vector', icon: Cpu, status: 'DONE', meta: 'BGE-M3 (1024d)' },
    { id: 4, title: 'LLM Reasoning', type: 'Inference', icon: Sparkles, status: 'DONE', meta: 'DeepSeek-R1 14B' },
    { id: 5, title: 'Manager Sign-Off', type: 'Gate', icon: ShieldAlert, status: 'WAITING', meta: 'Human-in-the-Loop' },
    { id: 6, title: 'Sovereign Archive', type: 'Output', icon: Download, status: 'PENDING', meta: 'Local Encrypted FS' },
  ];

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Agentic Workflows & Pipelines</h1>
            <Badge variant="ai" size="md">
              DAG Orchestrator
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Automated multi-step pipelines orchestrating document processing, local reasoning, and approval checkpoints.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={handleRun} isLoading={isRunning}>
            <Play className="h-3.5 w-3.5 fill-current mr-1" />
            Execute Active Pipeline
          </Button>
        </div>
      </div>

      {/* Visual DAG Pipeline Flow */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{selectedWorkflow.title}</CardTitle>
            <CardDescription>{selectedWorkflow.description}</CardDescription>
          </div>
          <Badge variant="sovereign" size="sm" dot>
            Sequential Execution Mode
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="py-6 overflow-x-auto">
            <div className="flex items-center justify-between min-w-[760px] gap-2">
              {DAG_NODES.map((node, i) => {
                const Icon = node.icon;
                return (
                  <React.Fragment key={node.id}>
                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-center space-y-1.5 shadow-2xs hover:border-slate-300 transition-all">
                      <div className="h-8 w-8 rounded-lg bg-navy-900 text-white flex items-center justify-center mx-auto shadow-xs">
                        <Icon className="h-4 w-4" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-900">{node.title}</h4>
                      <p className="text-[10px] text-slate-400">{node.meta}</p>
                      <div className="pt-1">
                        <Badge
                          variant={
                            node.status === 'DONE'
                              ? 'success'
                              : node.status === 'WAITING'
                              ? 'warning'
                              : 'neutral'
                          }
                          size="sm"
                        >
                          {node.status}
                        </Badge>
                      </div>
                    </div>

                    {i < DAG_NODES.length - 1 && (
                      <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workflows List */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MOCK_WORKFLOWS.map((wf) => (
          <div
            key={wf.id}
            onClick={() => setSelectedWorkflow(wf)}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              wf.id === selectedWorkflow.id
                ? 'border-navy-900 bg-white shadow-card ring-2 ring-navy-900/10'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <Badge variant="neutral" size="sm">{wf.category}</Badge>
              <Badge variant="success" size="sm" dot>{wf.status}</Badge>
            </div>
            <h4 className="text-xs font-bold text-slate-900">{wf.title}</h4>
            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{wf.description}</p>
            <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
              <span>{wf.nodesCount} DAG nodes</span>
              <span>Last run: {wf.lastRunAt}</span>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};
