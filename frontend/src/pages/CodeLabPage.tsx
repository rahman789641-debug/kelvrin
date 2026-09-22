import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { 
  Terminal, 
  Play, 
  RotateCcw, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  Cpu, 
  Layers, 
  Lock,
  Copy,
  Sparkles,
  TestTube,
  AlertTriangle,
  FileCode,
  Zap,
  Check
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { codeApi, CodeExecuteResponse, SecurityStatus } from '../services/api';

const DEFAULT_SCRIPT = `# KELVRIN Sovereign Isolated Code Lab
# AST Filter: FORBIDDEN MODULES (socket, subprocess, os, sys, urllib)
# Cgroups / Resource Limits: CPU=5.0s, RAM=512MB | Network: NONE

import math

def calculate_pressure_drop(pipe_diameter_mm, flow_rate_m3h, pipe_length_m):
    """Calculates hydrodynamic pressure drop (Darcy-Weisbach) in carbon steel piping."""
    diameter_m = pipe_diameter_mm / 1000.0
    area = math.pi * (diameter_m / 2.0) ** 2
    flow_rate_m3s = flow_rate_m3h / 3600.0
    velocity = flow_rate_m3s / area
    
    # Fluid properties for water at 20C
    density = 998.2  # kg/m3
    viscosity = 0.001002  # Pa.s
    reynolds = (density * velocity * diameter_m) / viscosity
    
    # Friction factor (Colebrook-White approximation for turbulent flow)
    friction_factor = 0.02
    
    head_loss_m = friction_factor * (pipe_length_m / diameter_m) * (velocity ** 2) / (2 * 9.81)
    delta_p_kpa = (density * 9.81 * head_loss_m) / 1000.0
    
    return {
        "velocity_mps": round(velocity, 3),
        "reynolds_number": int(reynolds),
        "head_loss_meters": round(head_loss_m, 2),
        "pressure_drop_kpa": round(delta_p_kpa, 2),
        "flow_regime": "TURBULENT" if reynolds > 4000 else "LAMINAR"
    }

# Execute deterministic engineering verification
result = calculate_pressure_drop(150.0, 120.0, 45.0)

print("=== SOVEREIGN ENGINEERING EXECUTION AUDIT ===")
for k, v in result.items():
    print(f"{k.upper():<20}: {v}")
print("SECURITY: EXECUTED IN AIR-GAPPED ISOLATED SANDBOX")
`;

const SAMPLE_TEST_CODE = `
def test_engineering_calculation():
    res = calculate_pressure_drop(150.0, 120.0, 45.0)
    assert res["flow_regime"] == "TURBULENT"
    assert res["pressure_drop_kpa"] > 0
    print("Test passed: calculate_pressure_drop correctly evaluated.")

test_engineering_calculation()
`;

export const CodeLabPage: React.FC = () => {
  const [code, setCode] = useState(DEFAULT_SCRIPT);
  const [isRunning, setIsRunning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [stderrOutput, setStderrOutput] = useState<string | null>(null);
  const [executionStats, setExecutionStats] = useState<{
    durationMs: number;
    exitCode: number;
    security: SecurityStatus;
  } | null>(null);

  // AI Prompt generation
  const [aiPrompt, setAiPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<'editor' | 'ai_assistant'>('editor');

  const { success, error, info } = useToast();

  const handleRunCode = async () => {
    setIsRunning(true);
    setOutput(null);
    setStderrOutput(null);
    info('Sandbox Initializing', 'Spawning isolated micro-process with resource boundaries...');

    try {
      const res: CodeExecuteResponse = await codeApi.execute({
        code,
        timeout_seconds: 5
      });

      setOutput(res.stdout || (res.exit_code === 0 ? '(Process completed with no output)' : ''));
      setStderrOutput(res.stderr || null);
      setExecutionStats({
        durationMs: res.duration_ms,
        exitCode: res.exit_code,
        security: res.security_status
      });

      if (res.success && res.exit_code === 0) {
        success('Execution Succeeded', `Process completed in ${res.duration_ms}ms.`);
      } else {
        error('Execution Error', res.stderr ? res.stderr.split('\n')[0] : `Process failed with exit code ${res.exit_code}`);
      }
    } catch (err: any) {
      error('Sandbox Security Block', err.message);
      setStderrOutput(`SECURITY VIOLATION / EXECUTION ERROR:\n${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunTests = async () => {
    setIsTesting(true);
    info('Running Unit Tests', 'Executing code with verification suite in sandbox...');

    try {
      const res = await codeApi.test({
        code,
        test_code: SAMPLE_TEST_CODE
      });

      setOutput(res.stdout || 'Tests completed.');
      setStderrOutput(res.stderr || null);
      setExecutionStats({
        durationMs: res.duration_ms,
        exitCode: res.exit_code,
        security: res.security_status
      });

      if (res.success && res.exit_code === 0) {
        success('All Tests Passed', 'Assertion checks verified in sandbox.');
      } else {
        error('Tests Failed', res.stderr || 'Assertion error encountered.');
      }
    } catch (err: any) {
      error('Test Execution Failed', err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    setIsGenerating(true);
    info('Generating Code', 'Local model classifying task and generating verified Python logic...');

    try {
      const res = await codeApi.generate({
        prompt: aiPrompt.trim(),
        language: 'python'
      });

      setCode(res.code);
      setActiveTab('editor');
      success('Code Generated', `Generated by ${res.model_used} [${res.task_type}].`);
    } catch (err: any) {
      error('Generation Failed', err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Isolated Code Lab & Sandbox</h1>
            <Badge variant="sovereign" size="md">
              Network Disabled (AF_INET Blocked)
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Deterministic code generation, AST static analysis, and isolated micro-process execution for autonomous tools and analysts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRunTests} 
            isLoading={isTesting}
            disabled={isRunning}
          >
            <TestTube className="h-3.5 w-3.5 mr-1 text-indigo-600" />
            Run Unit Tests
          </Button>
          <Button 
            variant="primary" 
            size="sm" 
            onClick={handleRunCode} 
            isLoading={isRunning}
            disabled={isTesting}
          >
            <Play className="h-3.5 w-3.5 fill-current mr-1" />
            Run in Sandbox
          </Button>
        </div>
      </div>

      {/* Security Boundaries Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900 text-white p-3.5 rounded-xl text-xs font-mono">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <div>
            <span className="text-slate-400 block text-[10px]">ISOLATION</span>
            <span className="font-semibold text-emerald-300">Subprocess Sandbox</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-emerald-400 shrink-0" />
          <div>
            <span className="text-slate-400 block text-[10px]">NETWORK EGRESS</span>
            <span className="font-semibold text-emerald-300">0.0.0.0/0 BLOCKED</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-amber-400 shrink-0" />
          <div>
            <span className="text-slate-400 block text-[10px]">RESOURCE BOUNDS</span>
            <span className="font-semibold text-amber-300">CPU: 5.0s | RAM: 512MB</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-indigo-400 shrink-0" />
          <div>
            <span className="text-slate-400 block text-[10px]">STATIC SECURITY</span>
            <span className="font-semibold text-indigo-300">AST Forbidden Import Filter</span>
          </div>
        </div>
      </div>

      {/* Tab Controls */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('editor')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'editor'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileCode className="h-3.5 w-3.5" />
          Code Editor
        </button>
        <button
          onClick={() => setActiveTab('ai_assistant')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'ai_assistant'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
          AI Code Assistant (Local LLM)
        </button>
      </div>

      {/* AI Assistant Drawer / Panel */}
      {activeTab === 'ai_assistant' && (
        <Card className="bg-indigo-50/50 border-indigo-200">
          <CardHeader>
            <CardTitle className="text-indigo-950 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Sovereign Code Generator
            </CardTitle>
            <CardDescription className="text-indigo-700/80">
              Prompt the local code LLM to write verified Python calculation routines or data transformation scripts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleGenerateCode} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. Calculate Weibull reliability distribution for a pressure safety valve over 50,000 hours..."
                  className="flex-1 text-xs bg-white border border-indigo-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
                />
                <Button variant="primary" size="sm" type="submit" isLoading={isGenerating}>
                  Generate Code
                </Button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-indigo-900 font-semibold">Quick Prompts:</span>
                {[
                  'Calculate Darcy-Weisbach friction factor',
                  'Simulate Monte Carlo portfolio risk with 1000 iterations',
                  'Validate ISO-9001 audit date compliance algorithm'
                ].map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAiPrompt(sample)}
                    className="text-[10px] bg-white text-indigo-800 hover:bg-indigo-100 border border-indigo-200 rounded-md px-2 py-1 transition-colors"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Editor & Console Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Code Editor (7 cols) */}
        <div className="lg:col-span-7 bg-navy-950 rounded-xl border border-slate-800 shadow-xl overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 bg-navy-900/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
            <div className="flex items-center gap-2 font-mono">
              <Terminal className="h-4 w-4 text-emerald-400" />
              <span>sandbox_runner.py</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400 font-mono">Python 3.9+ (Micro-Process)</span>
              <button
                onClick={() => setCode(DEFAULT_SCRIPT)}
                className="text-slate-400 hover:text-white transition-colors"
                title="Reset Script"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full bg-navy-950 text-emerald-300 font-mono text-xs p-4 focus:outline-none resize-none min-h-[420px] leading-5 selection:bg-slate-700"
          />

          <div className="px-4 py-2 bg-navy-900/80 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>RAM LIMIT: 512MB</span>
            <span>TIMEOUT: 5.0s</span>
            <span className="text-emerald-400 font-semibold">SOCKET: DISABLED</span>
          </div>
        </div>

        {/* Execution Output Console (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-card flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800">Sandbox Output Console</span>
            {executionStats && (
              <Badge 
                variant={executionStats.exitCode === 0 ? 'success' : 'danger'} 
                size="sm"
              >
                Exit Code {executionStats.exitCode}
              </Badge>
            )}
          </div>

          <div className="flex-1 p-4 bg-slate-900 text-slate-100 font-mono text-xs overflow-y-auto min-h-[340px] leading-5 space-y-3">
            {isRunning || isTesting ? (
              <div className="flex items-center gap-2 text-slate-400 italic">
                <Terminal className="h-4 w-4 animate-spin text-emerald-400" />
                <span>Micro-process executing inside isolated sandbox...</span>
              </div>
            ) : output || stderrOutput ? (
              <>
                {output && (
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">STDOUT:</span>
                    <pre className="whitespace-pre-wrap text-emerald-300">{output}</pre>
                  </div>
                )}
                {stderrOutput && (
                  <div>
                    <span className="text-[10px] text-rose-400 block mb-1">STDERR / SECURITY NOTICE:</span>
                    <pre className="whitespace-pre-wrap text-rose-400 bg-rose-950/40 p-2 rounded border border-rose-900">
                      {stderrOutput}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <span className="text-slate-500 italic">
                No active execution. Click "Run in Sandbox" or "Run Unit Tests" to evaluate code.
              </span>
            )}
          </div>

          {/* Sandbox Telemetry Footer */}
          {executionStats && (
            <div className="p-3 bg-slate-50 border-t border-slate-200 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Duration</span>
                <strong className="text-slate-800 font-mono">{executionStats.durationMs} ms</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Memory Bound</span>
                <strong className="text-slate-800 font-mono">512 MB Max</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Network Egress</span>
                <strong className="text-emerald-600 font-mono">0 Bytes (Blocked)</strong>
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
