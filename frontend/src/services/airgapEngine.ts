/**
 * Sovereign Air-Gap Autonomous Simulation Engine
 * 
 * Provides 100% interactive, stateful on-premises simulation for Kelvrin
 * when running in standalone mode, air-gapped hardware, or when the Python
 * backend port 8000 is not started.
 * 
 * Guarantees every single page (AI Agents, Chat, Knowledge, Documents, Code Lab,
 * Telemetry, Deliverables, Audit, Demo) works smoothly without error.
 */

import {
  AgentItem,
  AgentTemplateItem,
  AgentRunItem,
  Conversation,
  ChatMessage,
  SovereignDocument,
  DocumentProcessingLogItem,
  DocumentChunkItem,
  SovereignModel,
  ModelHealthResponse,
  TaskClassificationResult,
  RouteExecuteResult,
  KnowledgeSummary,
  KnowledgeSearchResponse,
  CodeGenerateResponse,
  CodeExecuteResponse,
  DeliverableItem,
  AnalyticsSummary,
  TimeSeriesPoint,
  ModelUsageItem,
  CategoryDistributionItem,
  SystemHealthOut,
  SystemMetricsOut,
  SystemEventItem,
  AuditRecord,
  PaginatedAuditRecords,
  PaginatedAdminUsers,
  AdminUserItem,
  RoleMetaItem,
  DemoScenariosResponse,
  DemoGoldenFlowResponse
} from './api';

// ==========================================
// 1. DEFAULT MOCK SEED DATA
// ==========================================

const SEED_AGENTS: AgentItem[] = [
  {
    id: 'agt_fin_01',
    name: 'Financial Risk Auditor',
    description: 'Autonomous financial modeling agent that ingests balance sheets, runs scenario calculations in the isolated Code Lab, and generates audited variance reports.',
    category: 'Finance & Compliance',
    system_prompt: 'You are a sovereign financial auditor operating under air-gapped regulatory protocols.',
    model_id: 'deepseek-r1-14b',
    tool_allowlist: ['read_document', 'search_knowledge_base', 'calculate', 'generate_docx'],
    max_steps: 12,
    timeout_seconds: 120,
    is_active: true,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: 'agt_sec_02',
    name: 'Threat Intelligence Synthesizer',
    description: 'Parses classified incident reports, correlates indicators against local air-gapped threat databases, and flags anomalous egress vectors.',
    category: 'Cybersecurity',
    system_prompt: 'You are an enclave cyber threat intelligence analyst with zero-external network access.',
    model_id: 'llama-3.1-8b',
    tool_allowlist: ['search_knowledge_base', 'execute_python_sandbox', 'extract_text'],
    max_steps: 10,
    timeout_seconds: 90,
    is_active: true,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: 'agt_leg_03',
    name: 'Regulatory Contract Reviewer',
    description: 'Analyzes enterprise NDAs, master services agreements, and vendor contracts against statutory compliance rules, marking deviation clauses.',
    category: 'Legal & Risk',
    system_prompt: 'You are a statutory compliance agent specialized in bilateral contracts and non-disclosure clauses.',
    model_id: 'deepseek-r1-14b',
    tool_allowlist: ['read_document', 'search_knowledge_base', 'generate_docx'],
    max_steps: 8,
    timeout_seconds: 60,
    is_active: true,
    created_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'agt_code_04',
    name: 'Code Vulnerability Scanner',
    description: 'Inspects proprietary source code repositories for CVE patterns, memory leaks, and unauthorized external networking calls.',
    category: 'DevSecOps',
    system_prompt: 'You are a secure code analysis agent. Inspect code for security defects and network egress.',
    model_id: 'qwen-2.5-coder-14b',
    tool_allowlist: ['execute_python_sandbox', 'extract_text', 'generate_xlsx'],
    max_steps: 15,
    timeout_seconds: 180,
    is_active: true,
    created_at: new Date(Date.now() - 3600000 * 6).toISOString()
  }
];

const SEED_TEMPLATES: AgentTemplateItem[] = [
  {
    id: 'tpl_fin',
    name: 'Financial Audit & Variance Specialist',
    description: 'Autonomous financial agent that calculates cash flow ratios, tests capital buffers, and outputs executive reports.',
    category: 'Finance',
    system_prompt: 'Analyze financial statements and verify regulatory liquidity compliance.',
    default_tools: ['read_document', 'calculate', 'generate_docx'],
    default_model_id: 'deepseek-r1-14b',
    icon: 'Calculator',
    max_steps: 10
  },
  {
    id: 'tpl_sec',
    name: 'Air-Gap Cyber Sentinel',
    description: 'Monitors hardware enclave logs, detects anomalous memory read operations, and isolates sandbox containers.',
    category: 'Security',
    system_prompt: 'Perform defensive cybersecurity audit over air-gap telemetry.',
    default_tools: ['search_knowledge_base', 'execute_python_sandbox'],
    default_model_id: 'llama-3.1-8b',
    icon: 'ShieldCheck',
    max_steps: 12
  },
  {
    id: 'tpl_leg',
    name: 'Statutory Compliance Auditor',
    description: 'Verifies bilateral agreement clauses against ISO 27001, SOC2 Type II, and sovereign air-gap statutes.',
    category: 'Compliance',
    system_prompt: 'Review contracts for strict air-gap compliance.',
    default_tools: ['read_document', 'search_knowledge_base', 'generate_docx'],
    default_model_id: 'deepseek-r1-14b',
    icon: 'FileText',
    max_steps: 8
  },
  {
    id: 'tpl_code',
    name: 'AST Code Audit Specialist',
    description: 'Deterministic code auditor scanning AST structures for un-sanitized inputs and network sockets.',
    category: 'DevSecOps',
    system_prompt: 'Perform AST vulnerability analysis without internet access.',
    default_tools: ['execute_python_sandbox', 'generate_xlsx'],
    default_model_id: 'qwen-2.5-coder-14b',
    icon: 'Terminal',
    max_steps: 15
  }
];

const SEED_RUNS: AgentRunItem[] = [
  {
    id: 'run_seed_01',
    agent_id: 'agt_fin_01',
    agent_name: 'Financial Risk Auditor',
    goal: 'Analyze Q3 liquidity reserve adequacy and verify Tier 1 statutory compliance against 10.5% threshold.',
    status: 'COMPLETED',
    current_step: 3,
    max_steps: 10,
    started_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    completed_at: new Date(Date.now() - 3600000 * 1.95).toISOString(),
    final_output: 'Sovereign Audit Complete: Q3 Capital Adequacy confirmed at 15.20%, which safely exceeds the statutory requirement of 10.50%. Shock scenario test passed with 0 egress violations. Formal audit deliverable generated: Tier1_Capital_Reserve_Audit.docx.',
    steps: [
      {
        id: 'stp_01',
        step_number: 1,
        title: 'Query Sovereign Vector Store for Tier 1 Capital Reserves',
        action_name: 'search_knowledge_base',
        action_input: { query: 'Tier 1 statutory capital reserve liquidity ratio Q3', top_k: 3 },
        observation: 'Found 3 matching chunks in document "Q3_Financial_Reserve_Statute.pdf". Operational reserves recorded at 16.40% (Threshold: 10.50%).',
        safe_summary: 'Retrieved statutory capital reserve ratios from local vector database.',
        status: 'COMPLETED',
        requires_approval: false,
        duration_ms: 320
      },
      {
        id: 'stp_02',
        step_number: 2,
        title: 'Run FX Shock Simulation in Isolated Code Lab Sandbox',
        action_name: 'execute_python_sandbox',
        action_input: { code: 'reserves = 0.164\nshock = 0.25 * 0.048\nfinal_ratio = reserves - shock\nprint(f"Post-Shock Ratio: {final_ratio*100:.2f}%")\nprint(f"Compliant: {final_ratio > 0.105}")' },
        observation: 'STDOUT:\nPost-Shock Ratio: 15.20%\nCompliant: True\nExit Code: 0 (Execution Time: 28ms, Egress: BLOCKED)',
        safe_summary: 'Deterministic Python shock calculation verified capital adequacy remains 15.20% (Compliant).',
        status: 'COMPLETED',
        requires_approval: false,
        duration_ms: 810
      },
      {
        id: 'stp_03',
        step_number: 3,
        title: 'Generate Audited Executive Word Deliverable',
        action_name: 'generate_docx',
        action_input: { title: 'Q3 Tier 1 Capital Reserve Audit', findings: 'Compliant at 15.20%' },
        observation: 'Generated artifact: Tier1_Capital_Reserve_Audit.docx (SHA-256: 8f4e2b...6a0d, Size: 14.2 KB).',
        safe_summary: 'Executive Word document generated and signed with sovereign hash.',
        status: 'COMPLETED',
        requires_approval: false,
        duration_ms: 450
      }
    ]
  }
];

const SEED_MODELS: SovereignModel[] = [
  {
    id: 'deepseek-r1-14b',
    name: 'DeepSeek-R1 Distill 14B',
    provider_type: 'vllm_local',
    endpoint_url: 'http://127.0.0.1:8000/v1/models/deepseek-r1-14b',
    modality: 'text->text',
    capabilities: ['reasoning', 'mathematics', 'statutory_audit', 'code_verification'],
    context_window: 65536,
    vram_allocated_mb: 14336,
    is_active: true,
    health_status: 'HEALTHY',
    last_health_check: new Date().toISOString(),
    latency_ms: 22,
    is_default: true
  },
  {
    id: 'llama-3.1-8b',
    name: 'Llama-3.1 8B Instruct',
    provider_type: 'ollama_local',
    endpoint_url: 'http://127.0.0.1:11434/api/generate',
    modality: 'text->text',
    capabilities: ['chat', 'general_intelligence', 'summarization', 'threat_intel'],
    context_window: 131072,
    vram_allocated_mb: 8192,
    is_active: true,
    health_status: 'HEALTHY',
    last_health_check: new Date().toISOString(),
    latency_ms: 14,
    is_default: false
  },
  {
    id: 'qwen-2.5-coder-14b',
    name: 'Qwen-2.5-Coder 14B',
    provider_type: 'vllm_local',
    endpoint_url: 'http://127.0.0.1:8000/v1/models/qwen-2.5-coder',
    modality: 'text->code',
    capabilities: ['python', 'ast_analysis', 'vulnerability_scan', 'sandbox_scripts'],
    context_window: 32768,
    vram_allocated_mb: 14336,
    is_active: true,
    health_status: 'HEALTHY',
    last_health_check: new Date().toISOString(),
    latency_ms: 28,
    is_default: false
  },
  {
    id: 'mistral-nemo-12b',
    name: 'Mistral NeMo 12B Instruct',
    provider_type: 'vllm_local',
    endpoint_url: 'http://127.0.0.1:8000/v1/models/mistral-nemo',
    modality: 'text->text',
    capabilities: ['multilingual', 'enterprise_rag', 'governance'],
    context_window: 128000,
    vram_allocated_mb: 12288,
    is_active: true,
    health_status: 'HEALTHY',
    last_health_check: new Date().toISOString(),
    latency_ms: 19,
    is_default: false
  },
  {
    id: 'bge-m3-dense',
    name: 'BAAI BGE-M3 Dense & Sparse',
    provider_type: 'embedding_engine',
    endpoint_url: 'http://127.0.0.1:8000/v1/embeddings',
    modality: 'text->vector',
    capabilities: ['dense_retrieval', 'sparse_bm25', 'colbert_rerank'],
    context_window: 8192,
    vram_allocated_mb: 2048,
    is_active: true,
    health_status: 'HEALTHY',
    last_health_check: new Date().toISOString(),
    latency_ms: 6,
    is_default: false
  }
];

const SEED_DOCUMENTS: SovereignDocument[] = [
  {
    id: 'doc_q3_01',
    title: 'Q3 Sovereign Capital Adequacy & Reserve Statute',
    filename: 'Q3_Financial_Reserve_Statute.pdf',
    file_size_bytes: 482910,
    mime_type: 'application/pdf',
    sha256_hash: '3f786850e387550fdab836ed7e6dc881de23001b70e87038c013622150913e23',
    classification: 'RESTRICTED',
    status: 'COMPLETED',
    ocr_applied: true,
    total_pages: 8,
    total_chunks: 18,
    uploaded_by: 'Super Admin',
    owner_name: 'Chief Risk Officer',
    content_preview: 'Statutory capital reserves must exceed 10.50% at all times. In Q3 2026, operational capital stood at 16.40%.',
    asset_category: 'Finance',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: 'doc_scada_02',
    title: 'Air-Gap Perimeter Enforcement Protocol v4.2',
    filename: 'Air_Gap_Enforcement_v4.pdf',
    file_size_bytes: 312450,
    mime_type: 'application/pdf',
    sha256_hash: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    classification: 'CONFIDENTIAL',
    status: 'COMPLETED',
    ocr_applied: true,
    total_pages: 5,
    total_chunks: 14,
    uploaded_by: 'Super Admin',
    owner_name: 'Security Architect',
    content_preview: 'All external network adapters must be physically disconnected or disabled at firmware level during sensitive compute.',
    asset_category: 'Security',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString()
  }
];

const SEED_CONVERSATION: Conversation = {
  id: 'conv_seed_01',
  title: 'Capital Reserves & Statutory Audit Analysis',
  user_id: 'usr_super_admin',
  model_id: 'deepseek-r1-14b',
  created_at: new Date(Date.now() - 7200000).toISOString(),
  updated_at: new Date().toISOString(),
  messages: [
    {
      id: 'msg_01',
      conversation_id: 'conv_seed_01',
      sender_type: 'user',
      content: 'Audit Tier 1 Capital Reserves in Q3 and verify if we meet statutory requirements.',
      required_capabilities: ['reasoning', 'statutory_audit'],
      created_at: new Date(Date.now() - 7200000).toISOString()
    },
    {
      id: 'msg_02',
      conversation_id: 'conv_seed_01',
      sender_type: 'assistant',
      content: '### Sovereign Enclave Audit Assessment\n\nI have retrieved the Q3 Financial Reserve filings from the encrypted local vector store and verified Tier 1 capital ratios:\n\n1. **Statutory Minimum Requirement**: `10.50%`\n2. **Current Q3 Operational Capital Ratio**: `16.40%`\n3. **Safety Buffer**: `+5.90%` above statutory threshold\n4. **Stress Shock Simulation**: Even after applying an extreme 25% FX variance shock, the reserve ratio remains at `15.20%`.\n\n[DELIVERABLE_DOWNLOAD:id=deliv-101|type=DOCX|filename=Tier1_Capital_Reserve_Audit.docx|title=Tier 1 Capital Reserve Audit Report|size=14540|sha256=3f786850e387550fdab836ed7e6dc881de23001b70e87038c013622150913e23]\n\nAll computations were executed locally inside the hardware air-gap sandbox with zero outbound telemetry.',
      model_used: 'DeepSeek-R1 Distill 14B',
      detected_intent: 'FINANCIAL_AUDIT',
      routing_reasoning: 'Routed to DeepSeek-R1 for chain-of-thought mathematical reasoning and compliance verification.',
      required_capabilities: ['reasoning', 'statutory_audit'],
      tokens_prompt: 18,
      tokens_completion: 194,
      latency_ms: 310,
      created_at: new Date(Date.now() - 7198000).toISOString()
    }
  ]
};

// ==========================================
// 2. STATE STORAGE HELPERS
// ==========================================

function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

function setToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function getActiveTenantCode(): string {
  try {
    const rawUser = localStorage.getItem('kelvrin_user');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u && (u.companyCode || u.company_code)) return (u.companyCode || u.company_code).trim().toUpperCase();
    }
    const rawComp = localStorage.getItem('kelvrin_company');
    if (rawComp) {
      const c = JSON.parse(rawComp);
      if (c && (c.code || c.companyCode)) return (c.code || c.companyCode).trim().toUpperCase();
    }
  } catch {}
  return 'DEFAULT';
}


// ==========================================
// 3. SOVEREIGN AIR-GAP MOCK ROUTER
// ==========================================

export async function handleAirgapMockRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const url = new URL(`http://localhost${endpoint}`);
  const pathname = url.pathname;
  let body: any = null;

  if (options.body && typeof options.body === 'string') {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = options.body;
    }
  }

  // Artificial realistic on-premises latency (30ms - 80ms)
  await new Promise(r => setTimeout(r, 45));

  // ----------------------------------------------------
  // 0. AUTH & SESSIONS (SOVEREIGN GATEWAY)
  // ----------------------------------------------------
  if (pathname === '/auth/csrf') {
    return { csrf_token: `airgap_mock_csrf_${Date.now()}` } as unknown as T;
  }

  if (pathname === '/auth/local-login') {
    const userVal = (body?.username || '').trim().toLowerCase();
    const passVal = (body?.password || '').trim();

    // 1. Check in stored admins from local registration
    try {
      const rawAdmins = localStorage.getItem('kelvrin_registered_admins');
      const admins: any[] = rawAdmins ? JSON.parse(rawAdmins) : [];
      const found = admins.find(a => 
        a.username?.toLowerCase() === userVal || 
        a.email?.toLowerCase() === userVal
      );
      if (found) {
        if (passVal && found.password && found.password !== passVal) {
          throw new Error('Invalid credentials for Sovereign Enclave');
        }
        return {
          token: `mock_jwt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          expires_in: 86400,
          token_type: 'bearer',
          user: {
            id: found.id || `usr_${Date.now()}`,
            email: found.email,
            fullName: found.fullName || `${found.firstName} ${found.lastName}`.trim(),
            role: 'Super Admin',
            companyCode: found.companyCode,
            status: 'active',
            permissions: ['*']
          }
        } as unknown as T;
      }
    } catch (e: any) {
      if (e.message === 'Invalid credentials for Sovereign Enclave') throw e;
    }

    // 2. Check in team members
    try {
      const rawMembers = localStorage.getItem('kelvrin_team_members');
      const members: any[] = rawMembers ? JSON.parse(rawMembers) : [];
      const foundMember = members.find(m => 
        m.username?.toLowerCase() === userVal || 
        m.email?.toLowerCase() === userVal
      );
      if (foundMember) {
        if (passVal && foundMember.password && foundMember.password !== passVal) {
          throw new Error('Invalid credentials for Sovereign Enclave');
        }
        return {
          token: `mock_jwt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          expires_in: 86400,
          token_type: 'bearer',
          user: {
            id: foundMember.id,
            email: foundMember.email,
            fullName: foundMember.fullName,
            role: foundMember.role,
            companyCode: foundMember.companyCode,
            status: foundMember.status || 'active',
            permissions: ['*']
          }
        } as unknown as T;
      }
    } catch (e: any) {
      if (e.message === 'Invalid credentials for Sovereign Enclave') throw e;
    }

    // 3. Pre-seeded Sovereign Enclave Accounts
    const seededRoleMap: Record<string, { name: string; role: any }> = {
      's.alexander@sovereign.defense.internal': { name: 'Col. Sterling Alexander', role: 'Super Admin' },
      'm.chen@sovereign.defense.internal': { name: 'Dr. Marcus Chen', role: 'Admin' },
      'e.rostova@sovereign.defense.internal': { name: 'Elena Rostova', role: 'Analyst' },
      'j.vance@sovereign.defense.internal': { name: 'James Vance', role: 'Approver / Manager' },
      'd.reid@sovereign.defense.internal': { name: 'David Reid', role: 'Auditor' },
      'j.doe@sovereign.defense.internal': { name: 'John Doe', role: 'Employee' },
    };

    if (seededRoleMap[userVal]) {
      const info = seededRoleMap[userVal];
      return {
        token: `mock_jwt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        expires_in: 86400,
        token_type: 'bearer',
        user: {
          id: `usr_${userVal.split('@')[0]}`,
          email: userVal,
          fullName: info.name,
          role: info.role,
          status: 'active',
          permissions: ['*']
        }
      } as unknown as T;
    }

    // 4. Default Sovereign Session Fallback
    const resolvedName = (body?.username || 'Super Admin').split('@')[0];
    return {
      token: `mock_jwt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      expires_in: 86400,
      token_type: 'bearer',
      user: {
        id: `usr_${Date.now()}`,
        email: body?.username?.includes('@') ? body.username : `${userVal || 'admin'}@kelvrin.internal`,
        fullName: resolvedName.charAt(0).toUpperCase() + resolvedName.slice(1),
        role: 'Super Admin',
        status: 'active',
        permissions: ['*']
      }
    } as unknown as T;
  }

  if (pathname === '/auth/google-login') {
    return {
      token: `mock_jwt_google_${Date.now()}`,
      expires_in: 86400,
      token_type: 'bearer',
      user: {
        id: `usr_google_${Date.now()}`,
        email: 'operator@sovereign.defense.internal',
        fullName: 'Google Sovereign Operator',
        role: 'Employee',
        status: 'active',
        permissions: ['ai.chat', 'documents.read']
      }
    } as unknown as T;
  }

  if (pathname === '/auth/me') {
    let currentUser: any = null;
    try {
      const stored = localStorage.getItem('kelvrin_user');
      if (stored) currentUser = JSON.parse(stored);
    } catch {}
    if (currentUser && currentUser.email) {
      return currentUser as unknown as T;
    }
    return {
      id: 'usr_super_admin',
      email: 'admin@kelvrin.internal',
      fullName: 'Super Admin',
      role: 'Super Admin',
      status: 'active',
      permissions: ['*']
    } as unknown as T;
  }

  if (pathname === '/auth/refresh') {
    return {
      token: 'mock_jwt_refreshed_' + Date.now(),
      expires_in: 86400,
      token_type: 'bearer',
      user: {
        id: 'usr_super_admin',
        email: 'superadmin@kelvrin.internal',
        fullName: 'Super Admin',
        role: 'Super Admin',
        status: 'active',
        permissions: ['*']
      }
    } as unknown as T;
  }

  if (pathname === '/auth/logout') {
    return { success: true, message: 'Logged out successfully.' } as unknown as T;
  }

  // ----------------------------------------------------
  // 0.1 COMPANIES & ACCESS CONTROL
  // ----------------------------------------------------
  if (pathname === '/companies' || pathname === '/companies/') {
    if (method === 'GET') {
      try {
        const raw = localStorage.getItem('kelvrin_companies');
        return (raw ? JSON.parse(raw) : []) as unknown as T;
      } catch {
        return [] as unknown as T;
      }
    }
    if (method === 'POST') {
      try {
        const raw = localStorage.getItem('kelvrin_companies');
        const companies: any[] = raw ? JSON.parse(raw) : [];
        const codeKey = (body?.code || '').trim().toUpperCase();
        const existingIdx = companies.findIndex(c => (c.code || '').toUpperCase() === codeKey);
        const compRecord = { ...body, code: codeKey, updatedAt: new Date().toISOString() };
        if (existingIdx >= 0) {
          companies[existingIdx] = compRecord;
        } else {
          companies.push(compRecord);
        }
        localStorage.setItem('kelvrin_companies', JSON.stringify(companies));
        return { success: true, company: compRecord } as unknown as T;
      } catch {
        return { success: true, company: body } as unknown as T;
      }
    }
  }

  if (pathname.startsWith('/companies/verify/')) {
    const code = decodeURIComponent(pathname.split('/')[3] || '').trim().toUpperCase();
    try {
      const raw = localStorage.getItem('kelvrin_companies');
      const companies: any[] = raw ? JSON.parse(raw) : [];
      const found = companies.find(c => (c.code || c.companyCode)?.toUpperCase() === code);
      if (found) {
        return { verified: true, company: found } as unknown as T;
      }
    } catch {}
    return { verified: false, message: 'Company not found in local cache' } as unknown as T;
  }

  if (pathname.startsWith('/companies/access-requests')) {
    if (pathname.endsWith('/status')) {
      const parts = pathname.split('/');
      const reqId = decodeURIComponent(parts[3] || '');
      try {
        const raw = localStorage.getItem('kelvrin_access_requests');
        const reqs: any[] = raw ? JSON.parse(raw) : [];
        const found = reqs.find(r => r.id === reqId);
        if (found) {
          found.status = body?.status || 'approved';
          found.approvedBy = body?.approvedBy || 'Super Admin';
          found.approvedAt = new Date().toISOString();
          localStorage.setItem('kelvrin_access_requests', JSON.stringify(reqs));
          return { success: true, request: found } as unknown as T;
        }
      } catch {}
      return { success: true, request: { id: reqId, status: body?.status } } as unknown as T;
    }
    if (method === 'GET') {
      try {
        const raw = localStorage.getItem('kelvrin_access_requests');
        return (raw ? JSON.parse(raw) : []) as unknown as T;
      } catch {
        return [] as unknown as T;
      }
    }
    if (method === 'POST') {
      try {
        const raw = localStorage.getItem('kelvrin_access_requests');
        const reqs: any[] = raw ? JSON.parse(raw) : [];
        const newReq = {
          id: body?.id || `req_${Date.now()}`,
          ...body,
          status: 'pending_approval',
          requestedAt: new Date().toISOString()
        };
        reqs.unshift(newReq);
        localStorage.setItem('kelvrin_access_requests', JSON.stringify(reqs));
        return { success: true, request: newReq } as unknown as T;
      } catch {
        return { success: true, request: body } as unknown as T;
      }
    }
  }

  if (pathname === '/companies/admins') {
    if (method === 'POST') {
      try {
        const raw = localStorage.getItem('kelvrin_registered_admins');
        const admins: any[] = raw ? JSON.parse(raw) : [];
        const emailKey = (body?.email || '').trim().toLowerCase();
        const existingIdx = admins.findIndex(a => a.email?.toLowerCase() === emailKey);
        if (existingIdx >= 0) {
          admins[existingIdx] = { ...admins[existingIdx], ...body };
        } else {
          admins.push(body);
        }
        localStorage.setItem('kelvrin_registered_admins', JSON.stringify(admins));
      } catch {}
      return { success: true, admin: body } as unknown as T;
    }
  }

  if (pathname.startsWith('/companies/admins/')) {
    const ident = decodeURIComponent(pathname.split('/')[3] || '').trim().toLowerCase();
    try {
      const raw = localStorage.getItem('kelvrin_registered_admins');
      const admins: any[] = raw ? JSON.parse(raw) : [];
      const found = admins.find(a => 
        a.email?.toLowerCase() === ident || 
        a.username?.toLowerCase() === ident
      );
      if (found) return found as unknown as T;
    } catch {}
    return null as unknown as T;
  }

  if (pathname === '/companies/purge-company') {
    return { success: true, message: 'Company purged successfully' } as unknown as T;
  }

  if (pathname.startsWith('/companies/') && !pathname.includes('access-requests') && !pathname.includes('admins') && !pathname.includes('purge')) {
    const code = decodeURIComponent(pathname.split('/')[2] || '').trim().toUpperCase();
    try {
      const raw = localStorage.getItem('kelvrin_companies');
      const companies: any[] = raw ? JSON.parse(raw) : [];
      const found = companies.find(c => (c.code || c.companyCode)?.toUpperCase() === code);
      if (found) return found as unknown as T;
    } catch {}
    return null as unknown as T;
  }

  // ----------------------------------------------------
  // A. AGENTS & AGENT RUNS (AIR-GAP DISPATCH)
  // ----------------------------------------------------
  if (pathname === '/agents' || pathname === '/agents/') {
    if (method === 'GET') {
      const agents = getFromStorage<AgentItem[]>('kelvrin_airgap_agents', SEED_AGENTS);
      return agents as unknown as T;
    }
    if (method === 'POST') {
      const agents = getFromStorage<AgentItem[]>('kelvrin_airgap_agents', SEED_AGENTS);
      const newAgent: AgentItem = {
        id: `agt_${Date.now()}`,
        name: body?.name || 'Custom Sovereign Agent',
        description: body?.description || 'Custom autonomous agent for on-premises tasks.',
        category: body?.category || 'Custom',
        system_prompt: body?.system_prompt || 'Autonomous agent.',
        model_id: body?.model_id || 'deepseek-r1-14b',
        tool_allowlist: body?.tool_allowlist || ['read_document', 'calculate'],
        max_steps: body?.max_steps || 10,
        timeout_seconds: body?.timeout_seconds || 120,
        is_active: true,
        created_at: new Date().toISOString()
      };
      agents.unshift(newAgent);
      setToStorage('kelvrin_airgap_agents', agents);
      return newAgent as unknown as T;
    }
  }

  if (pathname === '/agents/templates') {
    return SEED_TEMPLATES as unknown as T;
  }

  if (pathname === '/agents/runs') {
    const runsKey = `kelvrin_airgap_runs_${getActiveTenantCode()}`;
    const runs = getFromStorage<AgentRunItem[]>(runsKey, SEED_RUNS);
    if (method === 'GET') {
      return runs as unknown as T;
    }
    if (method === 'POST') {
      // DYNAMIC AUTONOMOUS RUN DISPATCH!
      const goal = body?.goal || 'Execute sovereign security and compliance task';
      const agentId = body?.agent_id || 'agt_fin_01';
      const agentName = body?.agent_name || 'Financial Risk Auditor';

      const newRunId = `run_${Date.now()}`;
      const newRun: AgentRunItem = {
        id: newRunId,
        agent_id: agentId,
        agent_name: agentName,
        goal,
        status: 'RUNNING',
        current_step: 1,
        max_steps: body?.max_steps || 10,
        started_at: new Date().toISOString(),
        steps: [
          {
            id: `stp_${Date.now()}_1`,
            step_number: 1,
            title: `Analyze Goal Context & Scan Local Vector Documents`,
            action_name: 'search_knowledge_base',
            action_input: { query: goal, top_k: 3 },
            observation: `Retrieved 3 regulatory excerpts from on-premises enclave storage matching: "${goal}". Integrity verified via SHA-256 hash.`,
            safe_summary: `Scanned local knowledge vault and matched relevant operational statutes.`,
            status: 'COMPLETED',
            requires_approval: false,
            duration_ms: 310
          },
          {
            id: `stp_${Date.now()}_2`,
            step_number: 2,
            title: `Execute Isolated Algorithmic Verification in Sandbox`,
            action_name: 'execute_python_sandbox',
            action_input: { script: `verify_statutory_thresholds("${goal}")` },
            observation: `Python simulation returned 0 errors. Capital adequacy and egress isolation policies compliant.`,
            safe_summary: `Executed verified sandbox calculation against live data.`,
            status: 'COMPLETED',
            requires_approval: false,
            duration_ms: 480
          },
          {
            id: `stp_${Date.now()}_3`,
            step_number: 3,
            title: `Request Human-In-The-Loop Sign-Off for Record Mutation`,
            action_name: 'request_human_approval',
            action_input: { action: 'COMMIT_AUDIT_PASS', target: goal },
            observation: `Awaiting Super Admin or Approver authorization to finalize immutable ledger commit.`,
            safe_summary: `High-assurance action suspended pending Human-In-The-Loop approval.`,
            status: 'WAITING_APPROVAL',
            requires_approval: true,
            duration_ms: 120
          }
        ]
      };

      runs.unshift(newRun);
      setToStorage(runsKey, runs);
      return newRun as unknown as T;
    }
  }

  // Approve Step in Agent Run
  if (pathname.includes('/approve-step/')) {
    const parts = pathname.split('/');
    const runId = parts[3];
    const stepId = parts[5];

    const runsKey = `kelvrin_airgap_runs_${getActiveTenantCode()}`;
    const runs = getFromStorage<AgentRunItem[]>(runsKey, SEED_RUNS);
    const run = runs.find(r => r.id === runId);
    if (run) {
      const step = run.steps.find(s => s.id === stepId || s.requires_approval);
      if (step) {
        step.status = 'COMPLETED';
        step.requires_approval = false;
        step.approved_by = 'Super Admin';
      }
      run.status = 'COMPLETED';
      run.completed_at = new Date().toISOString();
      run.final_output = `Execution Finalized: Step approved by Super Admin. All parameters validated against air-gapped sovereign baseline. Final deliverable signed and archived.`;
      setToStorage(runsKey, runs);
      return run as unknown as T;
    }
  }

  // Cancel Run
  if (pathname.endsWith('/cancel')) {
    const parts = pathname.split('/');
    const runId = parts[3];
    const runsKey = `kelvrin_airgap_runs_${getActiveTenantCode()}`;
    const runs = getFromStorage<AgentRunItem[]>(runsKey, SEED_RUNS);
    const run = runs.find(r => r.id === runId);
    if (run) {
      run.status = 'CANCELLED';
      run.completed_at = new Date().toISOString();
      setToStorage(runsKey, runs);
      return run as unknown as T;
    }
  }

  // ----------------------------------------------------
  // B. AI ASSISTANT / CHAT
  // ----------------------------------------------------
  if (pathname === '/chat/conversations') {
    const convKey = `kelvrin_airgap_convs_${getActiveTenantCode()}`;
    const convs = getFromStorage<Conversation[]>(convKey, []);
    if (method === 'GET') {
      return convs as unknown as T;
    }
    if (method === 'POST') {
      const newConv: Conversation = {
        id: `conv_${Date.now()}`,
        title: body?.title || 'New Sovereign Session',
        user_id: 'usr_active',
        model_id: body?.model_id || 'deepseek-r1-14b',
        document_id: body?.document_id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: []
      };
      convs.unshift(newConv);
      setToStorage(convKey, convs);
      return newConv as unknown as T;
    }
  }

  // GET single conversation or DELETE conversation
  if (pathname.startsWith('/chat/conversations/') && !pathname.endsWith('/messages')) {
    const convId = pathname.split('/')[3];
    const convKey = `kelvrin_airgap_convs_${getActiveTenantCode()}`;
    const convs = getFromStorage<Conversation[]>(convKey, []);

    if (method === 'GET') {
      const conv = convs.find(c => c.id === convId);
      if (conv) {
        return conv as unknown as T;
      }
      return {
        id: convId,
        title: 'Sovereign Session',
        user_id: 'usr_active',
        model_id: 'deepseek-r1-14b',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: []
      } as unknown as T;
    }

    if (method === 'DELETE') {
      const remaining = convs.filter(c => c.id !== convId);
      setToStorage(convKey, remaining);
      return { success: true, message: 'Conversation permanently deleted from local system storage' } as unknown as T;
    }
  }

  if (pathname.startsWith('/chat/conversations/') && pathname.endsWith('/messages')) {
    const convId = pathname.split('/')[3];
    const convKey = `kelvrin_airgap_convs_${getActiveTenantCode()}`;
    const convs = getFromStorage<Conversation[]>(convKey, []);
    let conv = convs.find(c => c.id === convId);
    const userPrompt = body?.content || '';

    if (!conv) {
      conv = {
        id: convId,
        title: userPrompt ? (userPrompt.length > 36 ? userPrompt.slice(0, 36) + '...' : userPrompt) : 'Sovereign Session',
        user_id: 'usr_active',
        model_id: body?.model_id || 'deepseek-r1-14b',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: []
      };
      convs.unshift(conv);
    } else if (conv.title === 'New Sovereign Session' || conv.title === 'New Sovereign Conversation' || conv.title === 'Sovereign Session') {
      if (userPrompt) {
        conv.title = userPrompt.length > 36 ? userPrompt.slice(0, 36) + '...' : userPrompt;
      }
    }
    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      conversation_id: convId,
      sender_type: 'user',
      content: userPrompt,
      required_capabilities: ['reasoning'],
      attachment_name: body?.attachment_name || undefined,
      created_at: new Date().toISOString()
    };
    conv.messages.push(userMsg);

    // INTELLIGENT SOVEREIGN ASSISTANT RESPONSE
    let assistantReply = '';
    const lower = userPrompt.toLowerCase();

    const isGreeting = /^(?:hi|hello|hey|vanakkam|vanakam|good\s+(?:morning|afternoon|evening)|greetings|howdy|hoi)(?:[\s!.,]|$)/i.test(lower.trim());
    const isPpt = /\b(ppt|pptx|presentation|slides|deck)\b/i.test(lower);
    const isWord = /\b(doc|docx|word)\b/i.test(lower);
    const isExcel = /\b(excel|xlsx|xls|spreadsheet|sheet|table)\b/i.test(lower);
    const isPdf = /\b(pdf)\b/i.test(lower);

    const extractTopic = (prompt: string): string => {
      let cleaned = prompt.trim();
      const prefixes = [
        /^(?:please\s+)?(?:can\s+you\s+)?(?:could\s+you\s+)?(?:i\s+need\s+)?(?:give\s+me\s+)?(?:generate\s+)?(?:create\s+)?(?:make\s+)?(?:prepare\s+)?(?:format\s+as\s+)?(?:format\s+an\s+)?(?:provide\s+)?(?:produce\s+)?(?:export\s+)?(?:download\s+)?(?:send\s+me\s+)?(?:send\s+)?(?:write\s+)?(?:show\s+me\s+)?/i,
        /^(?:a|an|the)\s+/i,
        /^(?:powerpoint\s+presentation|presentation\s+deck|presentation|pptx?\s+deck|pptx?|slides|deck|word\s+document|word\s+doc|word|docx?|pdf\s+report|pdf\s+document|pdf|excel\s+spreadsheet|excel\s+table|excel\s+sheet|excel|xlsx?|spreadsheet|sheet|table)\s+(?:file|document|report|deck|presentation|table)?\s*(?:on|about|for|regarding|of|with|containing)?\s*/i,
        /^(?:on|about|for|regarding|of)\s+/i
      ];
      for (const p of prefixes) {
        cleaned = cleaned.replace(p, '').trim();
      }
      cleaned = cleaned.replace(/\s+(?:in|as|into)\s+(?:pptx?|docx?|word|pdf|excel|xlsx?|slides?|presentation|spreadsheet|sheet)(?:\s+format|\s+file)?[\.\?!]*$/i, '').trim();
      cleaned = cleaned.replace(/[\.\?!]+$/, '').trim();
      if (!cleaned || cleaned.length < 2) return 'Sovereign Technical Briefing';
      return cleaned.replace(/\b\w/g, c => c.toUpperCase());
    };

    const makeHash = () => Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    if (isGreeting) {
      assistantReply = `Hello! I am **KELVRIN Sovereign AI Assistant**, operating directly within your hardware-isolated on-premises enclave.\n\nHow can I assist your team today? Here are a few sovereign capabilities I can execute for you:\n\n- 📊 **Audited Excel Sheets (\`.xlsx\`)**: Financial variance modeling, stress test ratios, balance sheet comparisons.\n- 📑 **Official PDF Reports (\`.pdf\`)**: Hardware security audits, statutory compliance reports, executive certifications.\n- 📄 **Word Documents (\`.docx\`)**: Enterprise contracts, standard operating procedures, technical specifications.\n- 📽️ **Presentation Decks (\`.pptx\`)**: Executive summaries, technical briefings, and strategic roadmaps.\n- 🔒 **Grounded Document Analysis**: Ingest and audit local enterprise documents with 100% zero external telemetry or cloud egress.\n\nSimply ask a question or request any document or deliverable you need!`;
    } else if (isPpt) {
      const topic = extractTopic(userPrompt);
      const cleanBase = topic.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30).replace(/^_+|_+$/g, '') || 'Presentation';
      const deckTitle = `${topic}: Executive Briefing`;
      const delivId = `deliv_ppt_${Date.now()}`;
      const filename = `${cleanBase}_Deck.pptx`;
      const sha256 = makeHash();
      const fileSize = 24500 + Math.floor(Math.random() * 8000);

      let slides = [
        {
          title: `1. Executive Overview & Scope of ${topic}`,
          bullets: [
            `Core principles, strategic significance, and operational scope of ${topic}`,
            'Key mission requirements, baseline specifications, and stakeholder drivers',
            'Fundamental criteria governing sovereign on-premises deployment'
          ]
        },
        {
          title: `2. Technical Architecture & System Mechanisms`,
          bullets: [
            `Detailed system architecture, sub-module contracts, and operational interfaces`,
            'Hardware isolation boundaries, deterministic latencies, and fault tolerance',
            'Integration with local GPU inference runtimes and vector indices'
          ]
        },
        {
          title: `3. Operational Implementation & Best Practices`,
          bullets: [
            'Structured phased rollout roadmap with automated validation gates',
            'Standard operating procedures (SOPs), runtime controls, and health monitoring',
            'Active error prevention protocols ensuring continuous enclave availability'
          ]
        },
        {
          title: `4. Governance, Metrics & Long-Term Roadmap`,
          bullets: [
            'Quantitative key performance indicators (KPIs) and compliance thresholds',
            'Cryptographic SHA-256 tamper-evident audit logging and verification',
            'Scalability trajectory, model refinement, and sustained sovereign resilience'
          ]
        }
      ];

      if (lower.includes('solar') || lower.includes('energy') || lower.includes('renewable')) {
        slides = [
          {
            title: `Principles & Physics of Solar Energy Systems`,
            bullets: [
              'Photoelectric effect converting solar irradiance directly into DC electricity',
              'High-efficiency monocrystalline silicon cells achieving >23% conversion efficiency',
              'Bifacial panel technology capturing albedo reflection from ground surfaces'
            ]
          },
          {
            title: 'System Architecture, Inverters & Storage',
            bullets: [
              'Maximum Power Point Tracking (MPPT) string and central inverter configurations',
              'DC-to-AC conversion topologies with microgrid synchronization capabilities',
              'Lithium Iron Phosphate (LiFePO4) Battery Energy Storage Systems (BESS) integration'
            ]
          },
          {
            title: 'Grid Interconnection, Economics & LCOE',
            bullets: [
              'Levelized Cost of Electricity (LCOE) optimization over 25-year lifecycle',
              'Net metering compliance, smart export guarantees, and frequency regulation',
              'Automated single-axis tracking maximizing peak irradiance during daytime curves'
            ]
          },
          {
            title: 'Decarbonization Impact & Future Technology',
            bullets: [
              'Decarbonization metrics: Offset of ~1.2 tons CO2 equivalent per MWh generated',
              'Next-generation perovskite-on-silicon tandem cells targeting >30% efficiency',
              'Circular recycling protocols for decommissioned photovoltaic modules'
            ]
          }
        ];
      } else if (lower.includes('ai') || lower.includes('intelligence') || lower.includes('machine learning')) {
        slides = [
          {
            title: `Foundations & Evolution of ${topic}`,
            bullets: [
              'Transition from static heuristic rules to transformer deep neural models',
              'Multi-head self-attention mechanisms and local context representation',
              'Open-weight foundational models executing strictly on local GPU hardware'
            ]
          },
          {
            title: 'Autonomous Agentic AI Workflows',
            bullets: [
              'Iterative ReAct loop: Goal formulation -> Planning -> Tool execution -> Verification',
              'Integrated local sandboxes: OCR extraction, pgvector retrieval, and isolated code lab',
              'Human-In-The-Loop (HITL) checkpoints for privileged enclave authorizations'
            ]
          },
          {
            title: 'Sovereign Air-Gapped Enclave Security',
            bullets: [
              '100% on-premises model execution with zero commercial cloud data egress',
              'Grounded semantic search combining dense vector embeddings and BM25 reranking',
              'Deterministic prevention of hallucinations and ungrounded extrapolation'
            ]
          },
          {
            title: 'Compliance, Governance & Deliverables',
            bullets: [
              'Automated synthesis of verified DOCX, XLSX, and PPTX deliverables',
              'Cryptographic SHA-256 digest calculated for every generated artifact',
              'Tamper-evident append-only audit trail logging for all interactions'
            ]
          }
        ];
      }

      const newDeliv: DeliverableItem & { meta?: any } = {
        id: delivId,
        title: deckTitle,
        filename,
        file_type: 'PPTX',
        file_size_bytes: fileSize,
        sha256_hash: sha256,
        status: 'APPROVED',
        metadata_json: { generated_by_agent: 'Sovereign Deliverable Engine', meta: { slides } },
        created_at: new Date().toISOString(),
        meta: { slides }
      };
      const delivKey = `kelvrin_airgap_deliverables_${getActiveTenantCode()}`;
      const existingDelivs = getFromStorage<any[]>(delivKey, []);
      existingDelivs.unshift(newDeliv);
      setToStorage(delivKey, existingDelivs);

      const slidesMd = slides.map((s, idx) => `#### 🖥️ Slide ${idx + 1}: ${s.title}\n${s.bullets.map(b => `- ${b}`).join('\n')}`).join('\n\n');
      assistantReply = `### 📊 Sovereign Presentation Deck: ${deckTitle}\n\nI have synthesized the executive presentation on **${topic}**:\n\n${slidesMd}\n\n---\n### 📦 Deliverable Details\n- **Deliverable**: \`${filename}\`\n- **Format**: PowerPoint Presentation (\`.pptx\`)\n- **Slides**: ${slides.length + 1} slides (including Title Slide)\n- **File Size**: ${fileSize.toLocaleString()} bytes\n- **SHA-256 Digest**: \`${sha256}\`\n\nThe presentation deck is compiled and ready for immediate download below:\n\n[DELIVERABLE_DOWNLOAD:id=${delivId}|type=PPTX|filename=${filename}|title=${deckTitle}|size=${fileSize}|sha256=${sha256}]`;

    } else if (isExcel) {
      const topic = extractTopic(userPrompt);
      const cleanBase = topic.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30).replace(/^_+|_+$/g, '') || 'DataSheet';
      const sheetTitle = `${topic} Analysis`;
      const delivId = `deliv_xlsx_${Date.now()}`;
      const filename = `${cleanBase}_Data.xlsx`;
      const sha256 = makeHash();
      const fileSize = 18500 + Math.floor(Math.random() * 6000);

      let headers = ['Item ID', 'Specification Target', 'Measured Value', 'Threshold Limit', 'Compliance Status'];
      let rows: any[][] = [
        ['ITM-01', `${topic} Primary Throughput`, '450 ops/sec', '300 ops/sec', 'PASS'],
        ['ITM-02', `${topic} Operational Latency`, '18.4 ms', '50.0 ms', 'OPTIMAL'],
        ['ITM-03', `${topic} Memory Footprint`, '4.2 GB', '8.0 GB', 'PASS'],
        ['ITM-04', `${topic} Security Verification`, '100% Isolated', 'Air-Gapped', 'PASS'],
        ['ITM-05', `${topic} Reliability Index`, '99.99%', '99.90%', 'PASS']
      ];

      if (lower.includes('square') || lower.includes('numbers') || lower.includes('1 to 10') || lower.includes('math')) {
        headers = ['Number (n)', 'Square (n²)', 'Cube (n³)', 'Square Root (√n)', 'Reciprocal (1/n)'];
        rows = Array.from({ length: 10 }, (_, i) => {
          const n = i + 1;
          return [n, n * n, n * n * n, Math.sqrt(n).toFixed(3), (1 / n).toFixed(4)];
        });
      } else if (lower.includes('budget') || lower.includes('expense') || lower.includes('cost') || lower.includes('revenue') || lower.includes('financial') || lower.includes('salary')) {
        headers = ['Cost Center / Item', 'Category', 'Budget ($)', 'Actual ($)', 'Variance ($)', 'Status'];
        rows = [
          ['Hardware & Server Infrastructure', 'CapEx', '$50,000', '$46,200', '+$3,800', 'ON TRACK'],
          ['Software Tooling & Licensing', 'OpEx', '$25,000', '$23,800', '+$1,200', 'ON TRACK'],
          ['Engineering & Core Operations', 'Labor', '$140,000', '$137,500', '+$2,500', 'APPROVED'],
          ['Security Audits & Pen-Testing', 'Compliance', '$30,000', '$28,000', '+$2,000', 'COMPLETED'],
          ['Data Center Power & Cooling', 'Facilities', '$16,000', '$16,400', '-$400', 'REVIEW'],
          ['Contingency Reserve Fund', 'Reserve', '$45,000', '$10,000', '+$35,000', 'ALLOCATED']
        ];
      }

      const newDeliv: DeliverableItem & { meta?: any } = {
        id: delivId,
        title: sheetTitle,
        filename,
        file_type: 'XLSX',
        file_size_bytes: fileSize,
        sha256_hash: sha256,
        status: 'APPROVED',
        metadata_json: { generated_by_agent: 'Sovereign Deliverable Engine', meta: { headers, rows } },
        created_at: new Date().toISOString(),
        meta: { headers, rows }
      };
      const delivKey = `kelvrin_airgap_deliverables_${getActiveTenantCode()}`;
      const existingDelivs = getFromStorage<any[]>(delivKey, []);
      existingDelivs.unshift(newDeliv);
      setToStorage(delivKey, existingDelivs);

      const hdrLine = '| ' + headers.join(' | ') + ' |';
      const sepLine = '| ' + headers.map(() => '---').join(' | ') + ' |';
      const rowLines = rows.map(r => '| ' + r.join(' | ') + ' |').join('\n');
      const tableMd = `${hdrLine}\n${sepLine}\n${rowLines}`;

      assistantReply = `### 📈 Sovereign Tabular Analysis: ${sheetTitle}\n\nI have generated the spreadsheet dataset for **${topic}**:\n\n${tableMd}\n\n---\n### 📦 Deliverable Details\n- **Deliverable**: \`${filename}\`\n- **Format**: Microsoft Excel Spreadsheet (\`.xlsx\`)\n- **Records**: ${rows.length} structured rows\n- **File Size**: ${fileSize.toLocaleString()} bytes\n- **SHA-256 Digest**: \`${sha256}\`\n\nThe spreadsheet is stored and verified on-premises. Download below:\n\n[DELIVERABLE_DOWNLOAD:id=${delivId}|type=XLSX|filename=${filename}|title=${sheetTitle}|size=${fileSize}|sha256=${sha256}]`;

    } else if (isWord) {
      const topic = extractTopic(userPrompt);
      const cleanBase = topic.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30).replace(/^_+|_+$/g, '') || 'Guide';
      const docTitle = `${topic}: Technical Guide & Operational Specifications`;
      const delivId = `deliv_docx_${Date.now()}`;
      const filename = `${cleanBase}_Guide.docx`;
      const sha256 = makeHash();
      const fileSize = 22400 + Math.floor(Math.random() * 7000);

      let sections = [
        {
          heading: `1.0 Executive Summary: ${topic}`,
          body: `This document establishes the official technical specifications and operational standards for ${topic}. All parameters have been evaluated and approved under sovereign enclave guidelines.`
        },
        {
          heading: '2.0 Core Architecture & System Specifications',
          body: `The architecture for ${topic} provides deterministic low-latency execution with strict fault isolation. System contracts ensure high availability and zero unauthorized external data dependencies.`
        },
        {
          heading: '3.0 Implementation Guidelines & Operational Protocol',
          body: `Deployment protocols mandate staged rollouts, comprehensive pre-flight verification checks, and automated continuous telemetry inspection to preserve operational integrity.`
        },
        {
          heading: '4.0 Security, Compliance & Governance',
          body: 'All operations execute strictly within memory-isolated sandboxes under local RBAC enforcement. Zero telemetry packets exit the air-gapped hardware perimeter.'
        },
        {
          heading: '5.0 Verification, Audit & Strategic Trajectory',
          body: `Systematic verification confirms that all criteria for ${topic} are satisfied. The operational roadmap prioritizes continuous improvement and cryptographic assurance.`
        }
      ];

      if (lower.includes('sql')) {
        sections = [
          {
            heading: '1.0 Overview of Structured Query Language (SQL)',
            body: 'Structured Query Language (SQL) is the ANSI/ISO standardized domain-specific language used for managing, querying, and updating relational databases. It forms the computational foundation for enterprise data stores including PostgreSQL, SQLite, and MariaDB.'
          },
          {
            heading: '2.0 Data Query Language (DQL) & Core Syntax',
            body: 'The fundamental retrieval command is SELECT. Syntax: SELECT column1, column2 FROM table_name WHERE condition ORDER BY column1 ASC; Clauses filter records using logical operators (AND, OR, NOT, IN, BETWEEN, LIKE).'
          },
          {
            heading: '3.0 Data Aggregation & Grouping',
            body: 'Aggregate functions perform computations across sets of values: COUNT(*), SUM(col), AVG(col), MIN(col), MAX(col). Grouping records is achieved using GROUP BY, filtered post-aggregation via HAVING.'
          },
          {
            heading: '4.0 Relational Joins & Integrity',
            body: 'Relational entities are combined across foreign key relationships using JOIN operations:\n- INNER JOIN: Returns intersecting records from both tables.\n- LEFT JOIN: Preserves all left table rows while mapping matching right rows.\n- FULL JOIN: Retains rows from either table where conditions match.'
          },
          {
            heading: '5.0 Performance & Security Best Practices',
            body: 'In sovereign data systems, all database access must use parameterized queries to prevent SQL injection. Appropriate B-Tree and GIN indexes should be applied to primary lookup columns to guarantee high-throughput query execution.'
          }
        ];
      } else if (lower.includes('cyber') || lower.includes('security') || lower.includes('zero-trust')) {
        sections = [
          {
            heading: '1.0 Sovereign Cybersecurity Posture',
            body: `Defensive architecture for ${topic} is built upon Zero-Trust Architecture (ZTA) principles: verify explicitly, grant least-privilege access, and assume breach across all enclave domains.`
          },
          {
            heading: '2.0 Hardware Isolation & Network Air-Gap Controls',
            body: 'The perimeter relies on physical unidirectional data diodes and galvanic hardware bus isolation. External outbound packet routing is blocked at hardware level to prevent telemetry exfiltration.'
          },
          {
            heading: '3.0 Cryptographic Integrity & Access Control',
            body: 'Data at rest is secured via AES-256-GCM encryption with HSM-backed key orchestration. Access is managed strictly via Role-Based Access Control (RBAC) with short-lived asymmetric tokens.'
          },
          {
            heading: '4.0 Real-Time SIEM & Threat Containment',
            body: 'Automated security monitors inspect system calls, memory allocations, and file hash changes. Any integrity anomaly immediately triggers autonomous enclave lockouts and immutable audit alerts.'
          },
          {
            heading: '5.0 Compliance Alignment & Incident Resilience',
            body: 'Protocols align with NIST SP 800-53 Rev 5, ISO/IEC 27001, and SOC 2 criteria, guaranteeing continuous regulatory compliance and disaster recovery readiness.'
          }
        ];
      }

      const newDeliv: DeliverableItem & { meta?: any } = {
        id: delivId,
        title: docTitle,
        filename,
        file_type: 'DOCX',
        file_size_bytes: fileSize,
        sha256_hash: sha256,
        status: 'APPROVED',
        metadata_json: { generated_by_agent: 'Sovereign Deliverable Engine', meta: { sections } },
        created_at: new Date().toISOString(),
        meta: { sections }
      };
      const delivKey = `kelvrin_airgap_deliverables_${getActiveTenantCode()}`;
      const existingDelivs = getFromStorage<any[]>(delivKey, []);
      existingDelivs.unshift(newDeliv);
      setToStorage(delivKey, existingDelivs);

      const secMd = sections.map(s => `#### ${s.heading}\n${s.body}`).join('\n\n');
      assistantReply = `### 📄 Sovereign Word Deliverable: ${docTitle}\n\nI have synthesized the complete, verified document for **${topic}**:\n\n${secMd}\n\n---\n### 📦 Deliverable Details\n- **Deliverable**: \`${filename}\`\n- **Format**: Microsoft Word Document (\`.docx\`)\n- **Sections**: ${sections.length} structured sections\n- **File Size**: ${fileSize.toLocaleString()} bytes\n- **SHA-256 Digest**: \`${sha256}\`\n\nThe Word document has been registered in your encrypted vault. Download below:\n\n[DELIVERABLE_DOWNLOAD:id=${delivId}|type=DOCX|filename=${filename}|title=${docTitle}|size=${fileSize}|sha256=${sha256}]`;

    } else if (isPdf) {
      const topic = extractTopic(userPrompt);
      const cleanBase = topic.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30).replace(/^_+|_+$/g, '') || 'Report';
      const pdfTitle = `${topic}: Sovereign Executive Report`;
      const delivId = `deliv_pdf_${Date.now()}`;
      const filename = `${cleanBase}_Report.pdf`;
      const sha256 = makeHash();
      const fileSize = 29500 + Math.floor(Math.random() * 9000);

      const sections = [
        {
          heading: '1.0 Executive Audit Summary',
          body: `Autonomous technical evaluation compiled for ${topic}. All operations were executed within the hardware air-gapped sovereign enclave with zero external cloud telemetry.\n• Statutory Capital Adequacy: 16.40% (PASSED)\n• Extreme FX Stress Shock: 15.20% (COMPLIANT)\n• Telemetry Packet Exfiltration: 0 egress detected (ISOLATED)\n• Fiscal Deficit Margin: 0.8% (LOW RISK)\nImportant: Cryptographic verification seal intact and confirmed.`
        },
        {
          heading: '2.0 Technical Architecture & Verification',
          body: 'All system parameters and performance thresholds were evaluated against on-premises statutory standards.\n• Verification Status: APPROVED with zero compliance anomalies.\n• Memory Integrity: 100.00% isolated.\n• High Availability Benchmark: 99.99% uptime achieved (OPTIMAL).\n• Latency Under Stress: 18.4 ms (PASS).\nNote: All regulatory constraints satisfied.'
        },
        {
          heading: '3.0 Final Certification & Sign-off',
          body: 'This deliverable has been cryptographically signed and archived in the local immutable repository for regulatory governance.'
        }
      ];

      const newDeliv: DeliverableItem & { meta?: any } = {
        id: delivId,
        title: pdfTitle,
        filename,
        file_type: 'PDF',
        file_size_bytes: fileSize,
        sha256_hash: sha256,
        status: 'APPROVED',
        metadata_json: { generated_by_agent: 'Sovereign Deliverable Engine', meta: { sections } },
        created_at: new Date().toISOString(),
        meta: { sections }
      };
      const pdfDelivKey = `kelvrin_airgap_deliverables_${getActiveTenantCode()}`;
      const existingPdfDelivs = getFromStorage<any[]>(pdfDelivKey, []);
      existingPdfDelivs.unshift(newDeliv);
      setToStorage(pdfDelivKey, existingPdfDelivs);

      const secMd = sections.map(s => `#### ${s.heading}\n${s.body}`).join('\n\n');
      assistantReply = `### 📑 Sovereign PDF Deliverable: ${pdfTitle}\n\nI have generated the official PDF deliverable for **${topic}**:\n\n${secMd}\n\n---\n### 📦 Deliverable Details\n- **Deliverable**: \`${filename}\`\n- **Format**: Portable Document Format (\`.pdf\`)\n- **File Size**: ${fileSize.toLocaleString()} bytes\n- **SHA-256 Digest**: \`${sha256}\`\n\nThe report has been cryptographically signed. Download below:\n\n[DELIVERABLE_DOWNLOAD:id=${delivId}|type=PDF|filename=${filename}|title=${pdfTitle}|size=${fileSize}|sha256=${sha256}]`;

    } else if (lower.includes('audit') || lower.includes('reserve') || lower.includes('tier 1') || lower.includes('capital')) {
      assistantReply = `### Sovereign Risk & Reserve Assessment\n\nI have performed a live verification against the local air-gapped financial statutes:\n\n- **Current Q3 Capital Adequacy Ratio**: \`16.40%\` (Statutory Floor: \`10.50%\`)\n- **Stress Buffer**: \`+5.90%\`\n- **Foreign Exchange Variance Shock**: Passed with \`15.20%\` residual capital.\n\n[DELIVERABLE_DOWNLOAD:id=deliv-101|type=DOCX|filename=Tier1_Capital_Reserve_Audit.docx|title=Tier 1 Capital Reserve Audit Report|size=14540|sha256=3f786850e387550fdab836ed7e6dc881de23001b70e87038c013622150913e23]\n\nExecution completed with zero network transmission.`;
    } else if (lower.includes('python') || lower.includes('script') || lower.includes('code') || lower.includes('checksum')) {
      assistantReply = `### Sovereign Code Lab Execution\n\nHere is the verified Python checksum validator for local files:\n\n\`\`\`python\nimport hashlib\n\ndef verify_sovereign_checksum(filepath, expected_sha256):\n    sha256 = hashlib.sha256()\n    with open(filepath, 'rb') as f:\n        for block in iter(lambda: f.read(65536), b''):\n            sha256.update(block)\n    calculated = sha256.hexdigest()\n    return calculated.lower() == expected_sha256.lower()\n\n# Test execution\nprint("Sandbox Integrity: 100% Verified")\n\`\`\`\n\nThis script runs strictly inside the memory-isolated sandbox.`;
    } else if (lower.includes('scada') || lower.includes('air-gap') || lower.includes('security') || lower.includes('egress')) {
      assistantReply = `### Hardware Air-Gap Perimeter Status\n\n- **Physical Bus Isolation**: All external network interfaces disabled at hardware level.\n- **Egress Telemetry**: \`0 packets outbound\` (100% blocked).\n- **Enclave Tamper Seal**: Active (Hash chain intact).\n- **Hardware Temperature**: \`41.8°C\` (Nominal).`;
    } else {
      assistantReply = `### Sovereign Intelligence Workspace Response\n\nI have processed your query: *"**${userPrompt}**"*\n\n1. **Local Intent Classification**: Analysis and operational decision support.\n2. **Inference Engine**: \`DeepSeek-R1 Distill 14B\` running on local GPU tensor cores.\n3. **Data Protection**: Full air-gap guarantee — zero cloud transmission or third-party telemetry.\n\nHow would you like to proceed? I can generate a deliverable (Word DOCX, PowerPoint PPTX, Excel XLSX, PDF), run an agent task, or inspect document records.`;
    }

    const assistantMsg: ChatMessage = {
      id: `msg_a_${Date.now()}`,
      conversation_id: convId,
      sender_type: 'assistant',
      content: assistantReply,
      model_used: 'DeepSeek-R1 Distill 14B',
      detected_intent: 'AUTONOMOUS_ASSISTANCE',
      routing_reasoning: 'Routed to local DeepSeek-R1 model on hardware tensor cores.',
      required_capabilities: ['reasoning', 'enterprise_rag'],
      tokens_prompt: Math.round(userPrompt.length / 4) + 10,
      tokens_completion: Math.round(assistantReply.length / 4),
      latency_ms: 240,
      created_at: new Date(Date.now() + 200).toISOString()
    };
    conv.messages.push(assistantMsg);
    conv.updated_at = new Date().toISOString();

    setToStorage(`kelvrin_airgap_convs_${getActiveTenantCode()}`, convs);
    return assistantMsg as unknown as T;
  }

  // ----------------------------------------------------
  // C. DOCUMENTS
  // ----------------------------------------------------
  if (pathname === '/documents' || pathname === '/documents/') {
    const docsKey = `kelvrin_airgap_docs_${getActiveTenantCode()}`;
    const docs = getFromStorage<SovereignDocument[]>(docsKey, SEED_DOCUMENTS);
    if (method === 'GET') {
      return docs as unknown as T;
    }
  }

  if (pathname === '/documents/upload') {
    const docsKey = `kelvrin_airgap_docs_${getActiveTenantCode()}`;
    const docs = getFromStorage<SovereignDocument[]>(docsKey, SEED_DOCUMENTS);
    const newDoc: SovereignDocument = {
      id: `doc_${Date.now()}`,
      title: 'Uploaded Sovereign Document',
      filename: 'enclave_document.pdf',
      file_size_bytes: 354200,
      mime_type: 'application/pdf',
      sha256_hash: 'c8f421e6e0d37e6b8c9d1a2f3e4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      classification: 'CONFIDENTIAL',
      status: 'COMPLETED',
      ocr_applied: true,
      total_pages: 4,
      total_chunks: 12,
      uploaded_by: 'Super Admin',
      owner_name: 'Super Admin',
      content_preview: 'Document successfully ingested and indexed into sovereign local vector store.',
      asset_category: 'Operations',
      created_at: new Date().toISOString()
    };
    docs.unshift(newDoc);
    setToStorage(docsKey, docs);
    return newDoc as unknown as T;
  }

  if (pathname.includes('/documents/') && pathname.endsWith('/logs')) {
    const logs: DocumentProcessingLogItem[] = [
      { id: 'log_1', document_id: 'doc_1', stage: 'INGEST', level: 'INFO', message: 'Binary uploaded and validated against SHA-256 hash.', created_at: new Date().toISOString() },
      { id: 'log_2', document_id: 'doc_1', stage: 'OCR', level: 'INFO', message: 'Local Tesseract OCR engine processed text layers.', created_at: new Date().toISOString() },
      { id: 'log_3', document_id: 'doc_1', stage: 'CHUNKING', level: 'INFO', message: 'Structural semantic window chunking completed.', created_at: new Date().toISOString() },
      { id: 'log_4', document_id: 'doc_1', stage: 'EMBEDDING', level: 'INFO', message: 'Vectors generated via BGE-M3 model (1024 dims).', created_at: new Date().toISOString() }
    ];
    return logs as unknown as T;
  }

  if (pathname.includes('/documents/') && pathname.endsWith('/chunks')) {
    const chunks: DocumentChunkItem[] = [
      { id: 'chk_1', document_id: 'doc_1', chunk_index: 0, page_number: 1, content: 'Operational capital reserves must remain above Tier 1 statutory baseline of 10.50%.', token_count: 85, created_at: new Date().toISOString() },
      { id: 'chk_2', document_id: 'doc_1', chunk_index: 1, page_number: 2, content: 'All stress tests must evaluate Foreign Exchange volatility and counterparty liquidity shock scenarios.', token_count: 104, created_at: new Date().toISOString() }
    ];
    return chunks as unknown as T;
  }

  if (pathname.startsWith('/documents/') && !pathname.endsWith('/logs') && !pathname.endsWith('/chunks') && !pathname.endsWith('/upload')) {
    const parts = pathname.split('/');
    const docId = parts[2];
    const docsKey = `kelvrin_airgap_docs_${getActiveTenantCode()}`;
    const docs = getFromStorage<SovereignDocument[]>(docsKey, SEED_DOCUMENTS);

    if (pathname.endsWith('/chat')) {
      return {
        answer: 'Based on the analyzed document content, all structural clauses, regulatory compliance metrics, and operational requirements have been verified with 100% precision and zero cloud egress.',
        citations: ['Section 2.1: Operational Mandates', 'Section 4.3: Cryptographic Integrity Verification']
      } as unknown as T;
    }

    if (pathname.endsWith('/search')) {
      return {
        results: [
          { chunk_id: 'chk_1', text: 'Operational capital reserves must remain above Tier 1 statutory baseline of 10.50%.', score: 0.94 },
          { chunk_id: 'chk_2', text: 'All stress tests must evaluate Foreign Exchange volatility and liquidity shock scenarios.', score: 0.88 }
        ]
      } as unknown as T;
    }

    if (method === 'DELETE') {
      const remaining = docs.filter(d => d.id !== docId);
      setToStorage(docsKey, remaining);
      return { success: true, message: 'Document permanently purged from on-premises storage.' } as unknown as T;
    }

    if (method === 'GET') {
      const found = docs.find(d => d.id === docId) || docs[0] || SEED_DOCUMENTS[0];
      return found as unknown as T;
    }
  }

  // ----------------------------------------------------
  // D. KNOWLEDGE BASE & SEARCH
  // ----------------------------------------------------
  if (pathname === '/knowledge/summary') {
    const summary: KnowledgeSummary = {
      collection_name: 'sovereign_enclave_index',
      embedding_model: 'BAAI/bge-m3',
      vector_dimensions: 1024,
      total_documents: 4,
      total_vectors: 3420,
      indexing_engine: 'Milvus Local Air-Gap',
      last_reindexed_at: new Date().toISOString(),
      status: 'HEALTHY'
    };
    return summary as unknown as T;
  }

  if (pathname === '/knowledge/search') {
    const query = body?.query || 'liquidity reserve';
    const searchRes: KnowledgeSearchResponse = {
      query,
      answer: `Semantic search retrieved high-confidence evidence confirming: "Operational capital reserves remain safely at 16.40%, with Tier 1 baseline statutory minimum set at 10.50%."`,
      status: 'EVIDENCE_FOUND',
      evidence: [
        {
          chunk_id: 'ev_01',
          document_id: 'doc_q3_01',
          document_title: 'Q3 Sovereign Capital Adequacy & Reserve Statute',
          filename: 'Q3_Financial_Reserve_Statute.pdf',
          page_number: 1,
          chunk_index: 0,
          content: 'Operational capital reserves remain within Tier 1 statutory guidelines at 16.40%, exceeding regulatory minimum of 10.50%.',
          similarity_score: 0.94,
          classification: 'RESTRICTED'
        },
        {
          chunk_id: 'ev_02',
          document_id: 'doc_scada_02',
          document_title: 'Air-Gap Perimeter Enforcement Protocol v4.2',
          filename: 'Air_Gap_Enforcement_v4.pdf',
          page_number: 2,
          chunk_index: 1,
          content: 'Enclave computational operations must strictly prohibit external internet socket connections.',
          similarity_score: 0.88,
          classification: 'CONFIDENTIAL'
        }
      ],
      citations: [
        {
          document_id: 'doc_q3_01',
          document_title: 'Q3 Sovereign Capital Adequacy & Reserve Statute',
          filename: 'Q3_Financial_Reserve_Statute.pdf',
          page_number: 1,
          chunk_index: 0,
          similarity_score: 0.94,
          excerpt: '16.40% reserves vs 10.50% statutory minimum.'
        }
      ],
      model_used: 'DeepSeek-R1 Distill 14B',
      routing_reasoning: 'Hybrid semantic & BM25 local indexing verified.',
      latency_ms: 38,
      retrieval_params: { top_k: 3, similarity_threshold: 0.82 }
    };
    return searchRes as unknown as T;
  }

  if (pathname === '/knowledge/reindex') {
    return {
      success: true,
      message: 'Air-gap vector index refreshed across all documents.',
      reindexed_documents: 4,
      failed_documents: 0
    } as unknown as T;
  }

  // ----------------------------------------------------
  // E. MODELS
  // ----------------------------------------------------
  if (pathname === '/models') {
    return SEED_MODELS as unknown as T;
  }

  if (pathname.includes('/models/') && pathname.endsWith('/health')) {
    const modelId = pathname.split('/')[2];
    const health: ModelHealthResponse = {
      model_id: modelId,
      provider_type: 'vllm_local',
      health_status: 'HEALTHY',
      latency_ms: 18,
      checked_at: new Date().toISOString()
    };
    return health as unknown as T;
  }

  if (pathname === '/models/classify') {
    const classification: TaskClassificationResult = {
      prompt: body?.prompt || '',
      primary_capability: 'reasoning',
      required_capabilities: ['reasoning', 'mathematics'],
      confidence: 0.96,
      detected_intent: 'AUDIT_ANALYSIS',
      reasoning: 'High complexity statutory logic detected. Routed to DeepSeek-R1.'
    };
    return classification as unknown as T;
  }

  if (pathname === '/models/route') {
    const routeRes: RouteExecuteResult = {
      text: 'Execution succeeded locally via hardware tensor cores. Output verified.',
      model_id: 'deepseek-r1-14b',
      model_name: 'DeepSeek-R1 Distill 14B',
      provider_type: 'vllm_local',
      detected_intent: 'REASONING',
      required_capabilities: ['reasoning'],
      confidence: 0.98,
      routing_reasoning: 'Hardware tensor cores selected for maximum precision.',
      prompt_tokens: 24,
      completion_tokens: 88,
      execution_time_ms: 180
    };
    return routeRes as unknown as T;
  }

  // ----------------------------------------------------
  // F. CODE LAB
  // ----------------------------------------------------
  if (pathname === '/code/generate') {
    const genRes: CodeGenerateResponse = {
      prompt: body?.prompt || 'calculate variance',
      language: 'python',
      task_type: 'CODE_GENERATION',
      model_used: 'qwen-2.5-coder-14b',
      code: `def calculate_variance_matrix(values):\n    \"\"\"Calculates variance against statutory baseline.\"\"\"\n    baseline = 0.105\n    results = [v - baseline for v in values]\n    return results\n\n# Verified Air-Gap Execution\nprint("Variance Matrix:", calculate_variance_matrix([0.164, 0.152]))`
    };
    return genRes as unknown as T;
  }

  if (pathname === '/code/execute') {
    const execRes: CodeExecuteResponse = {
      success: true,
      stdout: `[SANDBOX OUTPUT]\nExecution successful.\nCode verification passed.\nAll memory operations contained inside hardware enclave.\nNetwork egress: BLOCKED (0 packets)`,
      stderr: '',
      exit_code: 0,
      duration_ms: 32,
      security_status: {
        sandbox_isolated: true,
        network_disabled: true,
        cpu_limit_enforced: true,
        memory_limit_enforced: true
      }
    };
    return execRes as unknown as T;
  }

  // ----------------------------------------------------
  // G. DELIVERABLES
  // ----------------------------------------------------
  if (pathname === '/deliverables') {
    const delivKey = `kelvrin_airgap_deliverables_${getActiveTenantCode()}`;
    const stored = getFromStorage<DeliverableItem[]>(delivKey, []);
    return stored as unknown as T;
  }

  // ----------------------------------------------------
  // H. SYSTEM TELEMETRY & MONITOR
  // ----------------------------------------------------
  if (pathname === '/system/health') {
    const health: SystemHealthOut = {
      overall_status: 'HEALTHY',
      timestamp: new Date().toISOString(),
      subsystems: {
        enclave_security: { component: 'Hardware Enclave', status: 'HEALTHY', latency_ms: 2 },
        vector_store: { component: 'Milvus Vector Store', status: 'HEALTHY', latency_ms: 12 },
        inference_engine: { component: 'vLLM Local Engine', status: 'HEALTHY', latency_ms: 18 },
        code_sandbox: { component: 'Air-Gap Sandbox', status: 'HEALTHY', latency_ms: 4 }
      }
    };
    return health as unknown as T;
  }

  if (pathname === '/system/metrics') {
    const metrics: SystemMetricsOut = {
      cpu: { utilization_pct: 34.2, core_count: 8 },
      memory: { total_mb: 32768, used_mb: 15360, free_mb: 17408, percent: 46.8 },
      disk: { total_gb: 512, used_gb: 124.5, free_gb: 387.5, percent: 24.3 },
      gpu: { gpu_available: true, message: 'Apple Silicon Metal Acceleration Active', gpu_count: 1, devices: [{ name: 'Apple M-Series GPU', vram_used_mb: 14336, vram_total_mb: 24576 }] },
      storage: { scratch_path: '/vault/scratch', deliverables_count: 4, deliverables_size_bytes: 98400 },
      timestamp: new Date().toISOString()
    };
    return metrics as unknown as T;
  }

  if (pathname.startsWith('/system/events')) {
    const events: SystemEventItem[] = [
      { id: 'ev_01', timestamp: new Date(Date.now() - 120000).toISOString(), subsystem: 'SANDBOX', event_type: 'CONTAINER_START', severity: 'INFO', message: 'Isolated Code Lab sandbox initialized with zero network access.' },
      { id: 'ev_02', timestamp: new Date(Date.now() - 600000).toISOString(), subsystem: 'ENCLAVE', event_type: 'INTEGRITY_CHECK', severity: 'INFO', message: 'Hardware SHA-256 seal verified intact.' }
    ];
    return events as unknown as T;
  }

  // ----------------------------------------------------
  // I. ANALYTICS
  // ----------------------------------------------------
  if (pathname === '/analytics/summary') {
    const tenant = getActiveTenantCode();
    const docs = getFromStorage<any[]>(`kelvrin_airgap_docs_${tenant}`, []);
    const runs = getFromStorage<any[]>(`kelvrin_airgap_runs_${tenant}`, []);
    const delivs = getFromStorage<any[]>(`kelvrin_airgap_deliverables_${tenant}`, []);
    const convs = getFromStorage<any[]>(`kelvrin_airgap_convs_${tenant}`, []);

    let totalQueries = 0;
    convs.forEach(c => {
      if (c.messages && Array.isArray(c.messages)) {
        totalQueries += c.messages.filter((m: any) => m.role === 'user').length;
      }
    });

    const succRuns = runs.filter(r => r.status === 'COMPLETED').length;
    const failRuns = runs.filter(r => r.status === 'FAILED').length;
    const totalRuns = runs.length;

    const summary: AnalyticsSummary = {
      total_queries: Math.max(totalQueries, 14),
      documents_processed: docs.length,
      average_response_time_ms: 28.5,
      successful_agent_runs: succRuns,
      failed_agent_runs: failRuns,
      total_agent_runs: totalRuns,
      agent_success_rate_pct: totalRuns > 0 ? Math.round((succRuns / totalRuns) * 100) : 100.0,
      knowledge_searches: Math.max(docs.length * 12, 14),
      code_executions: Math.max(runs.length * 2, 8),
      generated_deliverables: delivs.length,
      active_models: 5,
      zero_cloud_cost: '$0.00 (100% On-Premises)'
    };
    return summary as unknown as T;
  }

  if (pathname.startsWith('/analytics/timeseries')) {
    const tenant = getActiveTenantCode();
    const docs = getFromStorage<any[]>(`kelvrin_airgap_docs_${tenant}`, []);
    const runs = getFromStorage<any[]>(`kelvrin_airgap_runs_${tenant}`, []);
    const baseMult = Math.max(docs.length, 1);

    const points: TimeSeriesPoint[] = [
      { date: 'Mon', queries: 24 * baseMult, tokens: 42000 * baseMult, agent_tasks: Math.max(runs.length, 4) },
      { date: 'Tue', queries: 32 * baseMult, tokens: 68000 * baseMult, agent_tasks: Math.max(runs.length, 6) },
      { date: 'Wed', queries: 38 * baseMult, tokens: 81000 * baseMult, agent_tasks: Math.max(runs.length, 5) },
      { date: 'Thu', queries: 45 * baseMult, tokens: 74000 * baseMult, agent_tasks: Math.max(runs.length, 7) },
      { date: 'Fri', queries: 58 * baseMult, tokens: 99000 * baseMult, agent_tasks: Math.max(runs.length, 9) },
      { date: 'Sat', queries: 20 * baseMult, tokens: 36000 * baseMult, agent_tasks: Math.max(runs.length, 3) },
      { date: 'Sun', queries: 48 * baseMult, tokens: 89000 * baseMult, agent_tasks: Math.max(runs.length, 8) }
    ];
    return points as unknown as T;
  }

  if (pathname === '/analytics/models') {
    const models: ModelUsageItem[] = [
      { model_id: 'deepseek-r1-14b', name: 'DeepSeek-R1 Distill 14B', provider_type: 'vllm_local', vram_mb: 14336, latency_ms: 22, context_window: 65536, status: 'HEALTHY', is_default: true },
      { model_id: 'llama-3.1-8b', name: 'Llama-3.1 8B Instruct', provider_type: 'ollama_local', vram_mb: 8192, latency_ms: 14, context_window: 131072, status: 'HEALTHY', is_default: false },
      { model_id: 'qwen-2.5-coder-14b', name: 'Qwen-2.5-Coder 14B', provider_type: 'vllm_local', vram_mb: 14336, latency_ms: 28, context_window: 32768, status: 'HEALTHY', is_default: false }
    ];
    return models as unknown as T;
  }

  if (pathname === '/analytics/categories') {
    const categories: CategoryDistributionItem[] = [
      { name: 'Financial Audit', value: 45, color: '#06b6d4' },
      { name: 'Cybersecurity', value: 30, color: '#3b82f6' },
      { name: 'Compliance & Legal', value: 15, color: '#10b981' },
      { name: 'Code Lab', value: 10, color: '#8b5cf6' }
    ];
    return categories as unknown as T;
  }

  // ----------------------------------------------------
  // J. AUDIT LOGS
  // ----------------------------------------------------
  if (pathname.startsWith('/audit')) {
    const currentAuthUser = getFromStorage<any>('kelvrin_auth_user', null) || getFromStorage<any>('kelvrin_user', null);
    const activeAdminEmail = currentAuthUser?.email || 'admin@sovereign.defense';
    const auditRecords: PaginatedAuditRecords = {
      items: [
        {
          id: 'aud_01',
          event_id: 'evt_98231',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          actor_email: activeAdminEmail,
          action: 'AGENT_RUN_DISPATCHED',
          resource_type: 'Autonomous Agent',
          resource_id: 'agt_fin_01',
          status: 'SUCCESS',
          ip_address: '127.0.0.1',
          details: { goal: 'Verify Q3 statutory reserve ratios' }
        },
        {
          id: 'aud_02',
          event_id: 'evt_98232',
          timestamp: new Date(Date.now() - 1200000).toISOString(),
          actor_email: activeAdminEmail,
          action: 'SOVEREIGN_ENCLAVE_LOGIN',
          resource_type: 'Enclave Portal',
          resource_id: 'Root Enclave Command',
          status: 'SUCCESS',
          ip_address: '127.0.0.1',
          details: { auth_mode: 'Air-Gap Local Enclave' }
        },
        {
          id: 'aud_03',
          event_id: 'evt_98233',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          actor_email: 'system@kelvrin.internal',
          action: 'EGRESS_FIREWALL_AUDIT',
          resource_type: 'Network Egress Filter',
          resource_id: 'eth0',
          status: 'BLOCKED',
          ip_address: '127.0.0.1',
          details: { external_packets: 0, status: 'ISOLATED' }
        }
      ],
      total: 3,
      page: 1,
      page_size: 10,
      pages: 1
    };
    return auditRecords as unknown as T;
  }

  // ----------------------------------------------------
  // K. USERS (ADMIN RBAC)
  // ----------------------------------------------------
  if (pathname === '/users' || pathname.startsWith('/users?') || (pathname.startsWith('/users/') && !pathname.startsWith('/users/meta'))) {
    if (method === 'POST' && pathname === '/users') {
      const body = options.body ? JSON.parse(options.body as string) : {};
      const activeCompany = getFromStorage<any>('kelvrin_company', { code: 'KELV-HQ' });
      const compCode = (activeCompany.code || 'KELV-HQ').toUpperCase();
      const teamMembers = getFromStorage<any[]>('kelvrin_team_members', []);
      const newUser = {
        id: `usr_${Date.now()}`,
        username: body.email ? body.email.split('@')[0] : 'user',
        email: (body.email || '').toLowerCase(),
        fullName: body.full_name || 'Enclave Operator',
        role: body.role || 'Employee',
        companyCode: compCode,
        department: body.department || 'Operations',
        status: 'active',
        createdAt: new Date().toISOString(),
        authProvider: 'local'
      };
      teamMembers.unshift(newUser);
      setToStorage('kelvrin_team_members', teamMembers);
      return {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.fullName,
        role: newUser.role,
        auth_provider: newUser.authProvider,
        status: 'ACTIVE',
        department: newUser.department,
        created_at: newUser.createdAt,
        permissions: ['documents:read', 'chat:use']
      } as unknown as T;
    }

    if (method === 'PUT' && pathname.startsWith('/users/')) {
      const userId = pathname.replace('/users/', '').split('?')[0];
      const body = options.body ? JSON.parse(options.body as string) : {};
      const teamMembers = getFromStorage<any[]>('kelvrin_team_members', []);
      const idx = teamMembers.findIndex((m: any) => m.id === userId || m.email?.toLowerCase() === userId.toLowerCase());
      if (idx >= 0) {
        if (body.status) teamMembers[idx].status = body.status.toLowerCase();
        if (body.role) teamMembers[idx].role = body.role;
        if (body.full_name) teamMembers[idx].fullName = body.full_name;
        if (body.department) teamMembers[idx].department = body.department;
        setToStorage('kelvrin_team_members', teamMembers);
      }
      return { success: true } as unknown as T;
    }

    // GET /users - Dynamically scoped to current active company
    const activeCompany = getFromStorage<any>('kelvrin_company', null);
    const compCode = (activeCompany?.code || 'KELV-HQ').toUpperCase();
    const currentAuthUser = getFromStorage<any>('kelvrin_auth_user', null) || getFromStorage<any>('kelvrin_user', null);
    const storedAdmins = getFromStorage<any[]>('kelvrin_super_admins', []);
    const matchedAdmin = storedAdmins.find((a: any) => a.companyCode?.toUpperCase() === compCode) || currentAuthUser;

    const adminEmail = matchedAdmin?.email || currentAuthUser?.email || 'admin@sovereign.defense';
    const adminName = matchedAdmin?.fullName || currentAuthUser?.fullName || 'Super Admin';

    // 1. Root Super Admin for this company
    const rootAdminItem: AdminUserItem = {
      id: matchedAdmin?.id || currentAuthUser?.id || 'usr_sa_root',
      email: adminEmail,
      full_name: adminName,
      role: 'Super Admin',
      auth_provider: matchedAdmin?.authProvider || currentAuthUser?.authProvider || 'google',
      status: 'ACTIVE',
      department: 'Sovereign Executive Enclave',
      created_at: activeCompany?.createdAt || new Date(Date.now() - 86400000 * 2).toISOString(),
      permissions: ['*']
    };

    // 2. Members registered for THIS company
    const teamMembers = getFromStorage<any[]>('kelvrin_team_members', []);
    const companyMembers: AdminUserItem[] = teamMembers
      .filter((m: any) => {
        if (!m.companyCode) return false;
        return m.companyCode.toUpperCase() === compCode && m.email?.toLowerCase() !== adminEmail.toLowerCase();
      })
      .map((m: any) => ({
        id: m.id || `usr_${m.email}`,
        email: m.email,
        full_name: m.fullName || m.username || m.email.split('@')[0],
        role: m.role || 'Employee',
        auth_provider: m.authProvider || 'google',
        status: (m.status || 'ACTIVE').toUpperCase(),
        department: m.department || 'Operations',
        created_at: m.createdAt || new Date().toISOString(),
        permissions: ['documents:read', 'chat:use']
      }));

    // 3. Approved access requests for THIS company
    const accessRequests = getFromStorage<any[]>('kelvrin_access_requests', []);
    const approvedRequests: AdminUserItem[] = accessRequests
      .filter((r: any) => {
        if (!r.companyCode || r.status !== 'approved') return false;
        return (
          r.companyCode.toUpperCase() === compCode &&
          r.email?.toLowerCase() !== adminEmail.toLowerCase() &&
          !companyMembers.some(cm => cm.email.toLowerCase() === r.email.toLowerCase())
        );
      })
      .map((r: any) => ({
        id: r.id,
        email: r.email,
        full_name: r.fullName,
        role: r.role,
        auth_provider: r.authProvider || 'google',
        status: 'ACTIVE',
        department: 'Operations',
        created_at: r.requestedAt || new Date().toISOString(),
        permissions: ['documents:read', 'chat:use']
      }));

    let allItems: AdminUserItem[] = [rootAdminItem, ...companyMembers, ...approvedRequests];

    // Handle query parameter filters if present
    const qParams = new URLSearchParams(pathname.split('?')[1] || '');
    const searchFilter = qParams.get('search')?.toLowerCase();
    const roleFilter = qParams.get('role');
    const statusFilter = qParams.get('status');

    if (searchFilter) {
      allItems = allItems.filter(u => u.full_name.toLowerCase().includes(searchFilter) || u.email.toLowerCase().includes(searchFilter));
    }
    if (roleFilter && roleFilter !== 'ALL') {
      allItems = allItems.filter(u => u.role === roleFilter);
    }
    if (statusFilter && statusFilter !== 'ALL') {
      allItems = allItems.filter(u => u.status === statusFilter.toUpperCase());
    }

    const users: PaginatedAdminUsers = {
      items: allItems,
      total: allItems.length,
      page: 1,
      page_size: 10,
      pages: 1
    };
    return users as unknown as T;
  }

  if (pathname === '/users/meta/roles') {
    const roles: RoleMetaItem[] = [
      { role: 'Super Admin', description: 'Root enclave sovereign controller with zero-leakage hardware oversight.', tier: 1, default_permissions: ['*'] },
      { role: 'Admin', description: 'Operational administration, platform monitoring, and team management.', tier: 2, default_permissions: ['users:read', 'users:write', 'system:read'] },
      { role: 'AI Operator', description: 'Agent dispatch, model fine-tuning, inference control, and Code Lab.', tier: 3, default_permissions: ['agents:run', 'models:read', 'code:execute'] },
      { role: 'Analyst', description: 'Deep semantic retrieval, knowledge graph exploration, and reporting.', tier: 4, default_permissions: ['analytics:read', 'knowledge:read'] },
      { role: 'Employee', description: 'Standard enterprise operator with AI chat assistant and document access.', tier: 5, default_permissions: ['chat:use', 'documents:read'] },
      { role: 'Auditor', description: 'Read-only surveillance, tamper-evident audit logs, and compliance oversight.', tier: 6, default_permissions: ['audit:read'] }
    ];
    return roles as unknown as T;
  }

  // ----------------------------------------------------
  // K. TOOLS & CONNECTORS & SECURITY
  // ----------------------------------------------------
  if (pathname === '/tools' || pathname === '/tools/') {
    const defaultTools = [
      { name: 'read_document', description: 'Reads and extracts semantic text from on-premises documents', is_enabled: true, requires_approval: false, category: 'Documents' },
      { name: 'search_knowledge_base', description: 'Queries vector database for relevant statutory excerpts', is_enabled: true, requires_approval: false, category: 'Knowledge' },
      { name: 'calculate', description: 'High-precision financial and scientific deterministic calculator', is_enabled: true, requires_approval: false, category: 'Compute' },
      { name: 'execute_python_sandbox', description: 'Executes Python code in an isolated AST sandbox', is_enabled: true, requires_approval: true, category: 'Code' },
      { name: 'generate_docx', description: 'Synthesizes audited Word deliverable reports', is_enabled: true, requires_approval: false, category: 'Deliverables' },
      { name: 'generate_xlsx', description: 'Generates verified Excel spreadsheets and balance sheets', is_enabled: true, requires_approval: false, category: 'Deliverables' },
      { name: 'generate_pptx', description: 'Generates executive presentation decks', is_enabled: true, requires_approval: false, category: 'Deliverables' },
      { name: 'generate_pdf', description: 'Generates official tamper-proof PDF audit certificates', is_enabled: true, requires_approval: false, category: 'Deliverables' }
    ];
    return defaultTools as unknown as T;
  }

  if (pathname.startsWith('/tools/') && pathname.endsWith('/toggle')) {
    const toolName = pathname.split('/')[2];
    return { success: true, message: `Tool ${toolName} toggled`, tool: { name: toolName, is_enabled: body?.is_enabled } } as unknown as T;
  }

  if (pathname === '/connectors' || pathname === '/connectors/') {
    const connectors = [
      { id: 'conn_erp_01', name: 'Enterprise ERP System', connector_type: 'REST', base_url: 'https://erp.enclave.internal', is_enabled: true, health_status: 'HEALTHY', last_sync_at: new Date().toISOString() },
      { id: 'conn_scada_02', name: 'Industrial SCADA Node', connector_type: 'OPC_UA', base_url: 'opc.tcp://scada.defense.internal:4840', is_enabled: true, health_status: 'HEALTHY', last_sync_at: new Date().toISOString() },
      { id: 'conn_cmms_03', name: 'Asset Maintenance CMMS', connector_type: 'REST', base_url: 'https://cmms.enclave.internal', is_enabled: true, health_status: 'HEALTHY', last_sync_at: new Date().toISOString() }
    ];
    return connectors as unknown as T;
  }

  if (pathname.startsWith('/connectors/') && pathname.endsWith('/toggle')) {
    const connId = pathname.split('/')[2];
    return { id: connId, is_enabled: body?.is_enabled, health_status: 'HEALTHY' } as unknown as T;
  }

  if (pathname.startsWith('/connectors/') && pathname.endsWith('/execute')) {
    return { success: true, message: 'Connector executed successfully inside air-gap enclave', data: { status: 'OK', records_processed: 42 } } as unknown as T;
  }

  if (pathname.includes('/connectors/mock-erp/inspections/')) {
    const eqId = pathname.split('/').pop();
    return { equipment_id: eqId, last_inspection: '2026-08-15', status: 'COMPLIANT', thickness_mm: 12.4, variance_pct: 0.02 } as unknown as T;
  }

  if (pathname === '/security/dashboard') {
    return {
      egress_attempts_blocked: 0,
      external_network_disabled: true,
      dns_requests_blocked: 0,
      hardware_enclave_status: 'SECURE_AIR_GAP',
      firewall_rules_active: 48,
      last_audit_timestamp: new Date().toISOString(),
      active_security_profiles: 6,
      enclave_integrity: 'VERIFIED_100_PERCENT',
      isolation_mode: 'ON_PREMISE_HARDENED',
      egress_bytes_total: 0
    } as unknown as T;
  }

  if (pathname === '/security/airgap-test') {
    return {
      timestamp: new Date().toISOString(),
      airgap_confirmed: true,
      egress_bytes: 0,
      dns_queries: 0,
      icmp_packets: 0,
      status: 'PASSED',
      audit_signature: `SOV-AIRGAP-PASS-${Date.now()}`
    } as unknown as T;
  }

  // ----------------------------------------------------
  // L. DEMO SCENARIOS
  // ----------------------------------------------------
  if (pathname.startsWith('/demo')) {
    if (pathname === '/demo/scenarios') {
      const demoScenarios: DemoScenariosResponse = {
        status: 'READY',
        demo_mode: 'HACKATHON_GOLDEN_FLOW',
        notice: 'Sovereign on-premises air-gapped demo suite ready.',
        assets: [
          { id: 'asset_1', name: 'Q3 Balance Sheet.pdf', type: 'DOCUMENT', path: '/vault/q3.pdf', size_bytes: 482910, description: 'Balance sheet with Tier 1 capital ratios' },
          { id: 'asset_2', name: 'SCADA Valve Diagram.png', type: 'IMAGE', path: '/vault/scada.png', size_bytes: 842100, description: 'Technical piping drawing for vision inspection' }
        ]
      };
      return demoScenarios as unknown as T;
    }

    if (pathname === '/demo/run-golden-flow') {
      const golden: DemoGoldenFlowResponse = {
        status: 'COMPLETED',
        correlation_id: `gold_${Date.now()}`,
        timestamp: new Date().toISOString(),
        deliverable: {
          id: 'deliv-101',
          filename: 'Tier1_Capital_Reserve_Audit.docx',
          file_size_bytes: 14540,
          sha256: '3f786850e387550fdab836ed7e6dc881de23001b70e87038c013622150913e23',
          decision: 'APPROVED_BY_STATUTE'
        },
        findings: {
          reserve_ratio: '16.40%',
          statutory_limit: '10.50%',
          stress_shock_result: '15.20% (PASS)',
          network_egress: 'BLOCKED (0 KB)'
        },
        steps: [
          { step: 1, name: 'Ingest Sovereign Document', status: 'COMPLETED', detail: 'Ingested and indexed into local Milvus vector store.' },
          { step: 2, name: 'Local Model Intent Classification', status: 'COMPLETED', detail: 'Classified by router model as FINANCIAL_AUDIT (Confidence: 0.98).' },
          { step: 3, name: 'Isolated Code Lab Sandbox Execution', status: 'COMPLETED', detail: 'Executed Python AST simulation with 0 network leaks.' },
          { step: 4, name: 'Executive Deliverable Synthesis', status: 'COMPLETED', detail: 'Generated signed Word deliverable with cryptographic checksum.' }
        ]
      };
      return golden as unknown as T;
    }
  }

  // Fallback generic object
  return { success: true, status: 'HEALTHY' } as unknown as T;
}
