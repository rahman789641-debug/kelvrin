import { 
  User, 
  MetricCardData, 
  QueryTrendData, 
  AgentUsageData, 
  DocumentItem, 
  DocumentChunk, 
  AgentItem, 
  AgentStepTrace, 
  WorkflowItem, 
  ModelItem, 
  AuditLogItem, 
  SystemTelemetry 
} from '../types';

export const CURRENT_USER_DEFAULT: User | null = null;

export const MOCK_METRICS: MetricCardData[] = [
  {
    title: 'Active Autonomous Agents',
    value: '0',
    change: 'Ready',
    isPositive: true,
    subtext: '0 tasks currently executing',
    iconName: 'Bot',
  },
  {
    title: 'Sovereign Documents',
    value: '0',
    change: 'Clean vault',
    isPositive: true,
    subtext: '0 documents on-premises',
    iconName: 'FileText',
  },
  {
    title: 'Inference Queries Today',
    value: '0',
    change: 'Standby',
    isPositive: true,
    subtext: 'Engine ready',
    iconName: 'Cpu',
  },
  {
    title: 'Encrypted Storage Used',
    value: '0 MB',
    change: '0% volume used',
    isPositive: true,
    subtext: 'Fresh enclave state',
    iconName: 'HardDrive',
  },
];

export const MOCK_QUERY_TRENDS: QueryTrendData[] = [
  { date: 'Mon', queries: 2100, tokens: 420000 },
  { date: 'Tue', queries: 2840, tokens: 680000 },
  { date: 'Wed', queries: 3200, tokens: 810000 },
  { date: 'Thu', queries: 3100, tokens: 740000 },
  { date: 'Fri', queries: 4120, tokens: 990000 },
  { date: 'Sat', queries: 1850, tokens: 360000 },
  { date: 'Sun', queries: 3842, tokens: 890000 },
];

export const MOCK_AGENT_USAGE: AgentUsageData[] = [
  { name: 'Financial Auditor', invocations: 1420, successRate: 99.2, avgDurationSec: 14.5 },
  { name: 'Threat Intelligence', invocations: 980, successRate: 98.4, avgDurationSec: 28.2 },
  { name: 'Contract Reviewer', invocations: 740, successRate: 100.0, avgDurationSec: 18.0 },
  { name: 'Code Vulnerability Scanner', invocations: 420, successRate: 96.8, avgDurationSec: 42.1 },
  { name: 'Policy Synthesizer', invocations: 282, successRate: 97.5, avgDurationSec: 12.3 },
];

export const MOCK_DOCUMENTS: DocumentItem[] = [];

export const MOCK_CHUNKS: DocumentChunk[] = [];

export const MOCK_AGENTS: AgentItem[] = [
  {
    id: 'agent-1',
    name: 'Financial Risk Auditor',
    description: 'Autonomous financial modeling agent that ingests balance sheets, runs scenario calculations in the isolated Code Lab, and generates audited variance reports.',
    category: 'Finance & Compliance',
    model: 'DeepSeek-R1 Distill 14B',
    allowedTools: ['vector_search', 'python_sandbox', 'sql_query_readonly'],
    maxSteps: 15,
    status: 'IDLE',
    lastRunAt: '2026-09-13 17:40 UTC',
    successRate: 99.2,
  },
  {
    id: 'agent-2',
    name: 'Threat Intelligence Synthesizer',
    description: 'Parses classified incident reports, correlates IP indicators against local air-gapped threat databases, and flags anomalous egress vectors.',
    category: 'Cybersecurity',
    model: 'Llama-3.1 8B Instruct',
    allowedTools: ['threat_db_lookup', 'pcap_inspector', 'calc'],
    maxSteps: 12,
    status: 'RUNNING',
    lastRunAt: '2026-09-13 18:50 UTC',
    successRate: 98.4,
  },
  {
    id: 'agent-3',
    name: 'Regulatory Contract Reviewer',
    description: 'Analyzes enterprise NDAs, master services agreements, and vendor contracts against statutory compliance rules, marking deviation clauses.',
    category: 'Legal & Risk',
    model: 'DeepSeek-R1 Distill 14B',
    allowedTools: ['vector_search', 'diff_checker'],
    maxSteps: 10,
    status: 'WAITING_APPROVAL',
    lastRunAt: '2026-09-13 18:25 UTC',
    successRate: 100.0,
  },
  {
    id: 'agent-4',
    name: 'Code Vulnerability Scanner',
    description: 'Inspects proprietary source code repositories for CVE patterns, memory leaks, and unauthorized external networking calls.',
    category: 'DevSecOps',
    model: 'Qwen-2.5-Coder 14B',
    allowedTools: ['python_sandbox', 'ast_parser', 'cve_database'],
    maxSteps: 20,
    status: 'IDLE',
    lastRunAt: '2026-09-12 22:15 UTC',
    successRate: 96.8,
  },
];

export const MOCK_AGENT_TRACE: AgentStepTrace[] = [
  {
    stepNumber: 1,
    thought: 'Goal received: "Analyze Q3 liquidity reserve adequacy and verify Tier 1 statutory compliance". I will first query the document vector store for liquidity ratios and Tier 1 metrics.',
    actionName: 'vector_search',
    actionInput: { query: 'Tier 1 statutory capital reserve liquidity ratio Q3', top_k: 3 },
    observation: 'Found 3 chunks. Key excerpt: "Operational capital reserves remain within Tier 1 statutory guidelines at 16.4%, exceeding regulatory minimum of 10.5%."',
    durationMs: 380,
  },
  {
    stepNumber: 2,
    thought: 'Now I will run an isolated Python simulation in Code Lab to verify if a 25% shock to foreign exchange derivatives would breach the 10.5% threshold.',
    actionName: 'python_sandbox',
    actionInput: {
      code: 'reserves = 0.164\nshock = 0.25 * 0.048\nfinal_ratio = reserves - shock\nprint(f"Final Capital Ratio: {final_ratio * 100:.2f}%")\nprint(f"Compliant: {final_ratio > 0.105}")',
    },
    observation: 'Output: Final Capital Ratio: 15.20%\nCompliant: True\nExit code: 0\nNetwork egress: BLOCKED (Isolated)',
    durationMs: 820,
  },
  {
    stepNumber: 3,
    thought: 'The shock test demonstrates capital adequacy remains safely above statutory requirements (15.20% vs 10.50%). Because this triggers a formal compliance record mutation, I must solicit Approver sign-off.',
    actionName: 'request_human_approval',
    actionInput: {
      action: 'RECORD_COMPLIANCE_PASS',
      summary: 'Post-shock Tier 1 capital ratio: 15.20% (Threshold: 10.50%)',
    },
    requiresApproval: true,
    approved: true,
    observation: 'Approval granted by Approver / Manager: Marcus Chen at 18:32 UTC.',
    durationMs: 140,
  },
  {
    stepNumber: 4,
    thought: 'All steps verified. Synthesizing final structured executive deliverable with grounded document citations.',
    observation: 'Deliverable synthesized with 2 verifiable citations [doc-001:p4, doc-001:p7].',
    durationMs: 460,
  },
];

export const MOCK_MODELS: ModelItem[] = [
  {
    id: 'deepseek-r1-14b',
    name: 'DeepSeek-R1 Distill Qwen 14B',
    provider: 'vLLM',
    modality: 'Text',
    contextWindow: 32768,
    vramAllocatedGb: 14.8,
    vramMaxGb: 24.0,
    status: 'ACTIVE',
    description: 'Primary reasoning engine for autonomous planning, complex analytical tasks, and mathematical deduction.',
    latencyAvgMs: 380,
  },
  {
    id: 'llama-3.1-8b',
    name: 'Meta Llama 3.1 8B Instruct',
    provider: 'vLLM',
    modality: 'Text',
    contextWindow: 16384,
    vramAllocatedGb: 6.2,
    vramMaxGb: 24.0,
    status: 'ACTIVE',
    description: 'Ultra-fast intent classifier, initial query router, and summarization assistant.',
    latencyAvgMs: 160,
  },
  {
    id: 'qwen2-vl-7b',
    name: 'Qwen2-VL 7B Instruct',
    provider: 'Ollama',
    modality: 'Vision',
    contextWindow: 8192,
    vramAllocatedGb: 7.1,
    vramMaxGb: 24.0,
    status: 'STANDBY',
    description: 'Local multimodal vision model for diagram analysis, scanned blueprint extraction, and handwritten forms.',
    latencyAvgMs: 640,
  },
  {
    id: 'bge-m3-embed',
    name: 'BAAI BGE-M3 Multilingual',
    provider: 'Local',
    modality: 'Embedding',
    contextWindow: 8192,
    vramAllocatedGb: 1.8,
    vramMaxGb: 24.0,
    status: 'ACTIVE',
    description: 'Dense 1024-dimensional semantic embedding engine supporting dense, sparse, and multi-vector search.',
    latencyAvgMs: 45,
  },
];

export const MOCK_WORKFLOWS: WorkflowItem[] = [
  {
    id: 'wf-1',
    title: 'Autonomous Ingestion & Multi-Stage Redaction',
    description: 'Ingests PDFs, runs local OCR, applies named-entity recognition for PII/classified markings, and indexes sanitized chunks into pgvector.',
    nodesCount: 6,
    status: 'ACTIVE',
    lastRunAt: '2026-09-13 18:10 UTC',
    category: 'Data Governance',
  },
  {
    id: 'wf-2',
    title: 'Quarterly Financial Vulnerability Audit',
    description: 'Extracts balance sheet metrics, runs stress simulations in Code Lab, validates statutory thresholds, and compiles executive PDF brief.',
    nodesCount: 8,
    status: 'ACTIVE',
    lastRunAt: '2026-09-13 17:45 UTC',
    category: 'Risk Management',
  },
  {
    id: 'wf-3',
    title: 'Continuous Air-Gap Network Sentry',
    description: 'Polls firewall state, tests local DNS isolation, audits container egress tables, and triggers emergency alert if outbound socket opens.',
    nodesCount: 5,
    status: 'ACTIVE',
    lastRunAt: '2026-09-13 19:00 UTC',
    category: 'Security Operations',
  },
];

export const MOCK_AUDIT_LOGS: AuditLogItem[] = [];

export const MOCK_USERS_LIST: User[] = [];

export const MOCK_TELEMETRY: SystemTelemetry = {
  gpuName: 'NVIDIA RTX 4090 24GB (On-Premises)',
  gpuVramUsedGb: 14.8,
  gpuVramTotalGb: 24.0,
  gpuTempC: 58,
  gpuUtilPct: 76,
  cpuUtilPct: 24.5,
  ramUsedGb: 38.2,
  ramTotalGb: 128.0,
  diskUsedGb: 14.2,
  diskTotalGb: 50.0,
  queueDepth: 1,
  activeModelCount: 3,
};
