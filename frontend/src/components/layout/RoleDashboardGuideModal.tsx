import React, { useState, useEffect } from 'react';
import { 
  X, 
  BookOpen, 
  Brain, 
  Cpu, 
  ShieldCheck, 
  FileText, 
  Activity, 
  Code2, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Database, 
  Terminal, 
  Lock,
  Layers,
  ArrowRight,
  Fingerprint,
  Crown,
  Eye,
  Workflow,
  ScrollText,
  Users
} from 'lucide-react';
import { BorderBeamPanel } from '../ui/border-beam-panel';
import { normalizeRole, UserRole } from '../../types';

interface RoleDashboardGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole?: UserRole | string;
}

interface RoleGuideContent {
  title: string;
  badgeColor: string;
  mission: string;
  sections: {
    name: string;
    description: string;
    howToUse: string;
  }[];
  aiCapabilities: {
    idealUseCases: string[];
    queryHandling: string;
    limitations: string;
  };
  safetyRules: string[];
  redWarnings: string[];
}

const ROLE_GUIDES: Record<string, RoleGuideContent> = {
  'Super Admin': {
    title: 'Super Admin Sovereign Governance & Master Control',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-400/40',
    mission: 'Root sovereign authority governing tenant organization provisioning, zero-trust network boundaries, cryptographic master killswitches, user access clearances, and system-wide autonomous agent lifecycle.',
    sections: [
      {
        name: 'Executive Overview Telemetry',
        description: 'Real-time hardware performance, GPU VRAM allocation, CPU thread utilization, active local inference nodes, and zero-egress security status.',
        howToUse: 'Inspect sovereign telemetry charts daily to verify node stability and confirm complete network boundary containment.'
      },
      {
        name: 'User Management & Live Clearances (/users)',
        description: 'Provisioning organizational personnel, configuring role permissions, and reviewing real-time pending access requests.',
        howToUse: 'Review pending requests submitted by operators. Verify corporate identity and assign precise role-based clearances.'
      },
      {
        name: 'Emergency Enclave Killswitch',
        description: 'Cryptographic master tripwire that instantly severs external subnet interfaces, pauses agent queues, and locks down tenant databases.',
        howToUse: 'Engage only during detected network boundary violations or regulatory breach containment procedures.'
      },
      {
        name: 'Audit Trail & Compliance Ledger (/audit-logs)',
        description: 'SHA-256 hashed immutable ledger of every login, document upload, AST sandbox run, and configuration change.',
        howToUse: 'Export signed audit reports periodically for external regulators or internal board oversight.'
      },
      {
        name: 'Company Details & Settings (/company-details, /settings)',
        description: 'Managing organization master profile, state/district jurisdiction, custom sovereign logos, and air-gap network configurations.',
        howToUse: 'Update institutional metadata and manage security policies applicable across all tenant workstations.'
      },
      {
        name: 'Organization Lifecycle & Purge Authority (/settings)',
        description: 'Governs tenant workstation persistence. Once configured, operators logging out are directly routed to their role login screen. Only a Super Admin Organization Purge resets terminals to the initial setup screen.',
        howToUse: 'Authorize an Organization Purge in Settings with root password only when wiping the terminal or resetting institutional ownership.'
      }
    ],
    aiCapabilities: {
      idealUseCases: [
        'Automated telemetry anomaly detection and threat surface synthesis across enclave nodes.',
        'High-speed compliance policy cross-referencing against international statutes (BASEL III, IFRS-9, GDPR).',
        'Synthesizing institution-wide operational audit summaries and executive briefing reports in seconds.'
      ],
      queryHandling: 'Super Admin prompts are routed directly through high-capacity local sovereign reasoning models with full access to tenant metrics.',
      limitations: 'The AI cannot autonomously bypass master killswitch locks, modify database schema, or provision accounts without explicit administrator approval.'
    },
    safetyRules: [
      'Periodically rotate root passwords and verify security recovery questions.',
      'Ensure all user roles follow the principle of least privilege and single-seat accountability.'
    ],
    redWarnings: [
      'Never disengage emergency killswitches without verifying complete subnet boundary integrity.',
      'Do not delete or overwrite historical audit ledger entries; mutability violates regulatory compliance and triggers tripwires.',
      'Simultaneous active sessions with master Super Admin credentials are automatically blocked.'
    ]
  },

  'Admin': {
    title: 'Admin Operations Command & Infrastructure Oversight',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-400/40',
    mission: 'Directs day-to-day enclave infrastructure operations, monitors hardware telemetry, oversees autonomous agent pipeline executions, and manages on-premise model weights.',
    sections: [
      {
        name: 'System Monitor & Telemetry (/system-monitor)',
        description: 'Live observation of local server health, GPU inference temperature, memory buffers, and enclave port status.',
        howToUse: 'Track resource consumption curves and ensure background processes remain within allocated hardware limits.'
      },
      {
        name: 'Autonomous Agent Dispatcher (/agents)',
        description: 'Monitoring ReAct agent task executions, execution queues, step-by-step reasoning traces, and deliverable outputs.',
        howToUse: 'Select agent templates, assign execution parameters, and inspect live task steps as agents synthesize results.'
      },
      {
        name: 'Model Center & Quantizations (/models)',
        description: 'Inspecting quantized model weights (Llama, Mistral, DeepSeek), adjusting context windows, and configuring inference queues.',
        howToUse: 'Configure local model parameters (temperature, top-p) for optimal deterministic execution without cloud egress.'
      },
      {
        name: 'Operational Workflows (/workflows)',
        description: 'Running multi-step automated operational routines, data pipelines, and scheduled ingestion tasks.',
        howToUse: 'Launch predefined workflows and monitor execution progress across system modules.'
      },
      {
        name: 'Enclave Port Security Surveillance (/security)',
        description: 'Surveillance of network packet isolation, ensuring zero unmonitored WAN communication.',
        howToUse: 'Inspect live traffic counters to confirm that all communication is restricted to internal subnet interfaces.'
      }
    ],
    aiCapabilities: {
      idealUseCases: [
        'Automated workload load-balancing and diagnosing inference latency bottlenecks.',
        'Generating synthetic system health diagnostics and predictive hardware maintenance alerts.',
        'Analyzing multi-agent execution graphs to optimize pipeline throughput.'
      ],
      queryHandling: 'Technical system queries are processed using local coding and diagnostic reasoning models.',
      limitations: 'Admins cannot approve user access requests or modify root organization details (reserved strictly for Super Admin).'
    },
    safetyRules: [
      'Monitor system load before queueing high-complexity multi-agent parallel workflows.',
      'Verify that all local model weights have valid SHA-256 cryptographic signatures.'
    ],
    redWarnings: [
      'Prohibited from attempting to open external outbound ports or disabling network traffic logging.',
      'Never inject untested third-party model weights without cryptographic checksum verification.',
      'Do not terminate active agent execution pipelines during live document vector indexing.'
    ]
  },

  'AI Operator': {
    title: 'AI Operator Mission Workspace & Agent Orchestration',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-400/40',
    mission: 'Dispatches autonomous sovereign agents, engages local LLM chat assistants, runs isolated Python AST simulations, and inspects model latency.',
    sections: [
      {
        name: 'ReAct Agent Task Dispatcher (/agents)',
        description: 'Launching autonomous ReAct agents for multi-step reasoning, financial audits, code analysis, and document parsing.',
        howToUse: 'Configure agent prompt goals, select tool sets, and dispatch runs. Monitor real-time execution steps.'
      },
      {
        name: 'Local AI Assistant (/ai-assistant)',
        description: 'Interactive conversational workbench powered by local quantized models for prompt drafting, text synthesis, and research.',
        howToUse: 'Input complex queries, attach ingested document contexts, and receive instant citations with 0 cloud leakage.'
      },
      {
        name: 'Code Lab Sandbox (/code-lab)',
        description: 'Isolated Python runtime executing algorithms with Abstract Syntax Tree (AST) validation and zero external network leaks.',
        howToUse: 'Write or paste Python code. Click Execute to compile AST trees and review execution stdout with 0 outbound leaks.'
      },
      {
        name: 'Model Center Latency Monitor (/models)',
        description: 'Tracking per-token generation speed, active context memory, and model inference queues.',
        howToUse: 'Review generation tokens-per-second and verify that local GPU layers are actively utilized.'
      },
      {
        name: 'Deliverables Generation (/deliverables)',
        description: 'Viewing, inspecting, and downloading completed agent deliverables signed with cryptographic checksums.',
        howToUse: 'Open completed deliverables, verify findings, and export sealed Word or PDF artifacts.'
      }
    ],
    aiCapabilities: {
      idealUseCases: [
        'Multi-step document forensic parsing and cross-referencing large text corpuses.',
        'Compiling complex AST Python code pipelines and automated statistical simulations.',
        'Automated data cleansing, tabular extraction, and structured JSON output generation.'
      ],
      queryHandling: 'Prompts are categorized into conversational, computational, or multi-step agent flows and routed to appropriate local inference backends.',
      limitations: 'Agents operate inside a strictly sandboxed enclave; socket libraries, subprocess creation, and host OS system calls are permanently blocked.'
    },
    safetyRules: [
      'Structure agent prompts with explicit constraints, input data references, and expected output schemas.',
      'Review agent thought chains and interim reasoning steps before accepting final deliverables.'
    ],
    redWarnings: [
      'Strictly prohibited from writing Python scripts that attempt to access restricted host OS files or network sockets.',
      'Never attempt to bypass the AST code validation filter in Code Lab.',
      'Do not trigger runaway recursive agent loops without setting a maximum iteration threshold.'
    ]
  },

  'Approver / Manager': {
    title: 'Executive Manager & Approval Command Workspace',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
    mission: 'Provides human-in-the-loop governance: evaluates workflow execution requests, authorizes high-stakes deliverables, and reviews organizational intelligence metrics.',
    sections: [
      {
        name: 'Workflow Approvals & Execution Gates (/workflows)',
        description: 'Central queue for reviewing and authorizing automated workflows requiring manager sign-off before proceeding.',
        howToUse: 'Inspect incoming workflow triggers, review input parameters, and click Approve or Reject with audit notes.'
      },
      {
        name: 'Deliverables Sign-Off Workbench (/deliverables)',
        description: 'Reviewing completed reports, legal drafts, and financial audits generated by autonomous agents before institutional publication.',
        howToUse: 'Examine generated deliverable contents, verify mathematical consistency, and apply executive approval stamp.'
      },
      {
        name: 'Mission Analytics (/analytics)',
        description: 'Tracking department throughput, query frequency, model usage efficiency, and agent task completion rates.',
        howToUse: 'Review analytics graphs to understand operational bottlenecks and team utilization.'
      },
      {
        name: 'Knowledge Base Exploration (/knowledge-base)',
        description: 'Querying organizational corporate policies, SOPs, and historical compliance records stored in the sovereign vault.',
        howToUse: 'Perform semantic searches across company guidelines to ensure proposed actions conform to policy.'
      }
    ],
    aiCapabilities: {
      idealUseCases: [
        'Generating executive summaries of multi-page technical deliverables and highlighting variances.',
        'Flagging statutory discrepancies and regulatory non-compliance in draft reports.',
        'Synthesizing departmental risk trends and tracking operational KPIs.'
      ],
      queryHandling: 'Executive prompts retrieve contextual data from verified knowledge bases to provide deterministic, cite-backed decision support.',
      limitations: 'AI assistance is advisory; final approval or rejection of deliverables requires unambiguous human manager confirmation.'
    },
    safetyRules: [
      'Review automated compliance flags before approving deliverables.',
      'Maintain clear review rationale in the workflow decision audit trail.'
    ],
    redWarnings: [
      'Prohibited from rubber-stamping deliverables that have failed automated golden verification checks.',
      'Never approve workflows that request exemptions from standard enclave security policies.',
      'Sharing manager approval credentials or delegating sign-off authority to non-authorized accounts is strictly forbidden.'
    ]
  },

  'Analyst': {
    title: 'Analyst Intelligence & Semantic Exploration Workspace',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40',
    mission: 'Conducts deep semantic retrieval across enterprise document vaults, analyzes trend telemetry, synthesizes knowledge artifacts, and builds mission deliverables.',
    sections: [
      {
        name: 'Analytics & Trend Visualizations (/analytics)',
        description: 'Deep visual analytics tracking operational performance, data point distributions, and trend projections.',
        howToUse: 'Configure custom metric filters, analyze comparative quarterly charts, and export visualization summaries.'
      },
      {
        name: 'Knowledge Base & Semantic Search (/knowledge-base)',
        description: 'Natural language vector querying across thousands of corporate documents, technical specs, and historical filings.',
        howToUse: 'Type semantic research questions to retrieve precise matching paragraphs with similarity confidence scores.'
      },
      {
        name: 'Interactive AI Assistant (/ai-assistant)',
        description: 'Specialized analytical workspace for drafting complex analyses, summarizing balance sheets, and extracting tabular data.',
        howToUse: 'Direct the local model to compare data sets, identify statistical anomalies, and format tabular findings.'
      },
      {
        name: 'Document Repository Vault (/documents)',
        description: 'Secure ingestion and browsing of sovereign PDFs, Word docs, and spreadsheets indexed into local Milvus vector embeddings.',
        howToUse: 'Upload research documents, monitor automated text chunking, and verify vector embedding status.'
      },
      {
        name: 'Deliverables Drafting (/deliverables)',
        description: 'Compiling structured findings into formally signed deliverables with cryptographic SHA-256 hashes.',
        howToUse: 'Generate comprehensive analytical deliverables and submit for manager sign-off.'
      }
    ],
    aiCapabilities: {
      idealUseCases: [
        'Cross-referencing disparate data tables across hundreds of pages in seconds.',
        'Generating comparative trend analysis, regression models, and statistical syntheses.',
        'Drafting executive briefing decks with cited primary-source document proofs.'
      ],
      queryHandling: 'Queries perform semantic vector similarity searches (RAG) against local Milvus collections before feeding context to local LLMs.',
      limitations: 'Analysts cannot modify underlying system configurations or execute unvalidated Python code outside the sandbox.'
    },
    safetyRules: [
      'Use targeted semantic search terms to minimize extraneous context noise.',
      'Verify source citations provided by the AI assistant against the original ingested documents.'
    ],
    redWarnings: [
      'Prohibited from exporting raw confidential datasets outside the sovereign workbench perimeter.',
      'Do not upload unencrypted sensitive personal data without verifying organization data handling classification.',
      'Fabricating or altering analysis metrics in official deliverables is a severe compliance breach.'
    ]
  },

  'Employee': {
    title: 'Employee Mission Workspace & Productivity Enclave',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
    mission: 'Empowers staff members with private on-premise AI chat assistance, access to authorized company documentation, standard operational workflows, and team deliverables.',
    sections: [
      {
        name: 'On-Premise AI Assistant (/ai-assistant)',
        description: 'Private, secure conversational assistant for drafting communications, summarizing internal documents, and brainstorming.',
        howToUse: 'Ask questions, draft emails, summarize meeting notes, and seek guidance on company procedures.'
      },
      {
        name: 'Company Document Repository (/documents)',
        description: 'Central library of organizational guidelines, handbooks, training materials, and authorized departmental files.',
        howToUse: 'Browse company policies, search for standard operational manuals, and read verified organization publications.'
      },
      {
        name: 'Deliverables Workbench (/deliverables)',
        description: 'Accessing and downloading team deliverables, approved templates, and finalized project documentation.',
        howToUse: 'Download authorized templates and review approved deliverables published by departmental leads.'
      },
      {
        name: 'Operational Workflows (/workflows)',
        description: 'Triggering standard pre-approved organizational routines, document processing flows, and report requests.',
        howToUse: 'Select an authorized workflow (e.g. document summarizer) and initiate automated execution.'
      }
    ],
    aiCapabilities: {
      idealUseCases: [
        'Instant Q&A against company handbooks, benefit guides, and operational SOPs.',
        'Grammar, clarity, and tone refinement for professional workplace correspondence.',
        'Summarizing lengthy internal memos and extracting key action items.'
      ],
      queryHandling: 'Prompts are processed strictly on local GPU hardware with zero data transmission to external public internet servers.',
      limitations: 'Employees have access only to documents and workflows authorized for their specific organizational tier.'
    },
    safetyRules: [
      'Always verify AI-generated answers against official company handbooks.',
      'Sign out of your active workstation session at the end of each working day.'
    ],
    redWarnings: [
      'Strictly prohibited from attempting to access administrative sections or modifying document permissions.',
      'Never share account login credentials with colleagues; every operator must utilize their own assigned seat.',
      'Attempting to extract restricted company data or bypass prompt safety filters is logged in the security audit trail.'
    ]
  },

  'Auditor': {
    title: 'Auditor Compliance & Sovereign Surveillance Command',
    badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-400/40',
    mission: 'Performs independent third-party and internal audits, inspects tamper-evident event trails, monitors zero-egress network surveillance, and verifies cryptographic deliverable hashes.',
    sections: [
      {
        name: 'Tamper-Evident Audit Logs (/audit-logs)',
        description: 'Real-time searchable stream of every security event, login attempt, document ingestion, agent run, and killswitch action.',
        howToUse: 'Filter events by operator, timestamp, or event severity. Verify that no log records have been altered.'
      },
      {
        name: 'Security Surveillance & Port Monitoring (/security)',
        description: 'Inspecting enclave boundary monitors, port isolation status, active sessions, and anomalous access patterns.',
        howToUse: 'Examine network traffic meters to verify that external WAN interfaces have registered exactly zero outbound bytes.'
      },
      {
        name: 'Deliverables & SHA-256 Hash Verifier (/deliverables)',
        description: 'Cryptographic validation of SHA-256 deliverable checksums to certify that generated audit reports remain untampered.',
        howToUse: 'Compare document hashes against the immutable ledger timestamp to certify integrity for external regulators.'
      },
      {
        name: 'System Monitor & Telemetry (/system-monitor)',
        description: 'Historical review of server resource consumption, error logs, and execution throughput metrics.',
        howToUse: 'Inspect historical throughput charts to cross-verify system activity during contested operational windows.'
      }
    ],
    aiCapabilities: {
      idealUseCases: [
        'Automated forensic reconstruction of incident timelines and discrepancy detection.',
        'Cross-checking fiscal disclosures against BASEL III, IFRS-9, and statutory regulations.',
        'Detecting unauthorized privilege creep and anomalous user access distributions.'
      ],
      queryHandling: 'Queries access immutable audit indices and perform deterministic rule validation without modifying any underlying state.',
      limitations: 'Auditors have broad read-only surveillance access but cannot mutate system settings or delete historical records.'
    },
    safetyRules: [
      'Perform periodic checksum audits of published deliverables against physical records.',
      'Cross-reference flagged security events with authenticated session telemetry.'
    ],
    redWarnings: [
      'Attempting to alter or suppress audit trail records is physically prevented and immediately alerts sovereign administrators.',
      'Never validate audit deliverables that do not match their registered SHA-256 cryptographic fingerprint.',
      'Disclosing sovereign audit findings to unauthorized third parties without executive authorization is strictly prohibited.'
    ]
  }
};

function resolveRoleKey(role?: string): string {
  const norm = normalizeRole(role);
  switch (norm) {
    case 'SUPER_ADMIN': return 'Super Admin';
    case 'AI_ADMIN': return 'Admin';
    case 'AI_OPERATOR': return 'AI Operator';
    case 'APPROVER': return 'Approver / Manager';
    case 'ANALYST': return 'Analyst';
    case 'EMPLOYEE': return 'Employee';
    case 'AUDITOR': return 'Auditor';
    default: return 'Employee';
  }
}

export const RoleDashboardGuideModal: React.FC<RoleDashboardGuideModalProps> = ({ 
  isOpen, 
  onClose,
  currentRole = 'Super Admin'
}) => {
  const normCurrent = normalizeRole(currentRole);
  const isSuperAdmin = normCurrent === 'SUPER_ADMIN' || currentRole === 'Super Admin';
  const roleKey = resolveRoleKey(currentRole);

  const [selectedRole, setSelectedRole] = useState<string>(roleKey);

  // Sync selectedRole when currentRole prop changes
  useEffect(() => {
    setSelectedRole(roleKey);
  }, [roleKey]);

  if (!isOpen) return null;

  // Non-Super Admins are strictly locked to their own role guide
  const effectiveRole = isSuperAdmin ? selectedRole : roleKey;
  const guide = ROLE_GUIDES[effectiveRole] || ROLE_GUIDES['Employee'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col">
        <BorderBeamPanel 
          beams={2} 
          thickness={2.5} 
          radius={24} 
          glow 
          idleSpeed={10}
          hoverSpeed={16}
          colors={['#06b6d4', '#f43f5e']}
          className="!p-0 !bg-[#051332]/95 !border-cyan-500/40 shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-cyan-500/20 bg-gradient-to-r from-cyan-950/60 via-slate-900/70 to-rose-950/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.3)]">
                <BookOpen className="h-5 w-5 text-cyan-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white tracking-wide">
                    {effectiveRole} Operational Guide &amp; AI Intelligence
                  </h2>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${guide.badgeColor}`}>
                    {effectiveRole}
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  {isSuperAdmin 
                    ? 'Super Admin Master Governance: Comprehensive operational guide across sovereign roles'
                    : `Authorized operational procedures and autonomous AI capabilities for ${effectiveRole}`}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close Guide"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* SUPER ADMIN EXCLUSIVE ROLE EXPLORER TOOLBAR: Only rendered for Super Admin! */}
          {isSuperAdmin && (
            <div className="px-6 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0 overflow-x-auto [scrollbar-width:none]">
              <div className="flex items-center gap-2 shrink-0">
                <Crown className="h-4 w-4 text-amber-400" />
                <span className="text-[11px] text-amber-300 font-bold uppercase tracking-wider font-mono">
                  Super Admin Explorer:
                </span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {Object.keys(ROLE_GUIDES).map((role) => (
                  <button
                    key={role}
                    onClick={() => setSelectedRole(role)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                      selectedRole === role
                        ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scrollable Content */}
          <div className="px-6 py-5 overflow-y-auto space-y-6 text-slate-200 text-sm [scrollbar-width:thin] [scrollbar-color:#06b6d4_transparent]">
            
            {/* Mission Statement */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-cyan-500/30 space-y-1.5">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                {effectiveRole} Mandate &amp; Operational Scope
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {guide.mission}
              </p>
            </div>

            {/* Dashboard Sections & Operational Procedures */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-400" />
                {effectiveRole} Dashboard Modules &amp; Step-by-Step Operating Procedures
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {guide.sections.map((sec, idx) => (
                  <div key={idx} className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-colors space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-md bg-cyan-500/20 text-cyan-300 font-mono text-[10px] font-bold flex items-center justify-center">
                        0{idx + 1}
                      </div>
                      <h4 className="font-bold text-white text-xs">{sec.name}</h4>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {sec.description}
                    </p>
                    <div className="pt-2 border-t border-slate-800 text-[11px] text-cyan-200/90 flex items-start gap-1.5 bg-cyan-950/20 p-2 rounded-xl">
                      <ArrowRight className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      <span><strong>Operating Procedure:</strong> {sec.howToUse}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SPECIAL SECTION: AI SOVEREIGN AGENT INTELLIGENCE */}
            <div className="rounded-2xl bg-gradient-to-br from-indigo-950/60 via-slate-900/80 to-purple-950/50 border-2 border-indigo-500/40 p-5 space-y-4 shadow-[0_0_25px_rgba(99,102,241,0.15)]">
              <div className="flex items-center justify-between pb-2 border-b border-indigo-500/20">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl bg-indigo-500/20 border border-indigo-400 flex items-center justify-center shadow-[0_0_10px_rgba(99,102,241,0.4)]">
                    <Brain className="h-4 w-4 text-indigo-300" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white tracking-wide">
                      {effectiveRole} Autonomous AI Agent Intelligence
                    </h3>
                    <p className="text-[11px] text-indigo-200">
                      Task optimization, query routing architecture, and deterministic processing
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/40">
                  ON-PREM INFERENCE
                </span>
              </div>

              {/* What AI Agents Excel At */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  What AI Agents Are Specifically Engineered To Streamline:
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-200">
                  {guide.aiCapabilities.idealUseCases.map((useCase, idx) => (
                    <li key={idx} className="flex items-start gap-2 bg-indigo-950/30 p-2 rounded-xl border border-indigo-500/20">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{useCase}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* How Different Queries Are Handled */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-indigo-500/30 space-y-1 text-xs">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                  Query Routing &amp; Execution Pipeline:
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {guide.aiCapabilities.queryHandling}
                </p>
              </div>

              {/* Guardrails & Determinism */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-indigo-500/30 space-y-1 text-xs">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-amber-400" />
                  Sovereign Enclave Boundary &amp; Governance Limits:
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {guide.aiCapabilities.limitations}
                </p>
              </div>
            </div>

            {/* Operational Best Practices */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                {effectiveRole} Operational Compliance Best Practices
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {guide.safetyRules.map((rule, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-200 flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* STRICT RED WARNING NOTICES */}
            <div className="rounded-2xl bg-rose-950/70 border-2 border-rose-500 p-5 space-y-3.5 shadow-[0_0_30px_rgba(244,63,94,0.3)]">
              <div className="flex items-center gap-2.5 text-rose-400 pb-2 border-b border-rose-500/30">
                <AlertTriangle className="h-5 w-5 shrink-0 animate-pulse text-rose-400" />
                <h3 className="font-bold text-sm text-rose-200 tracking-wider uppercase">
                  Strict Prohibitions &amp; Security Violations
                </h3>
              </div>

              <div className="space-y-2.5 text-xs text-rose-100">
                {guide.redWarnings.map((warn, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-rose-900/40 border border-rose-500/40 flex items-start gap-2">
                    <span className="text-rose-400 font-bold text-sm shrink-0">⛔</span>
                    <p className="leading-relaxed font-medium">
                      {warn}
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-cyan-500/20 bg-[#030d22] flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
              <Fingerprint className="h-3.5 w-3.5 text-cyan-400" />
              Kelvrin {effectiveRole} Enclave Protocol
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold text-xs shadow-[0_0_15px_rgba(6,182,212,0.4)] cursor-pointer transition-all uppercase tracking-wider"
            >
              Close Guide
            </button>
          </div>
        </BorderBeamPanel>
      </div>
    </div>
  );
};
export default RoleDashboardGuideModal;
