import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useToast } from '../components/ui/Toast';
import { 
  documentsApi, 
  SovereignDocumentDetail, 
  DocumentProcessingLogItem, 
  DocumentChunkItem 
} from '../services/api';
import { 
  FileText, 
  Download, 
  MessageSquare, 
  Trash2, 
  ArrowLeft, 
  ShieldCheck, 
  Lock, 
  Clock, 
  FileCode, 
  CheckCircle2, 
  AlertTriangle,
  Copy,
  Layers,
  Database,
  UserCheck,
  RefreshCw,
  Eye,
  Cpu,
  ScanText
} from 'lucide-react';

const LIFECYCLE_STAGES = [
  { key: 'QUEUED', label: 'Queued' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'OCR', label: 'OCR' },
  { key: 'VISION', label: 'Vision' },
  { key: 'INDEXING', label: 'Indexing' },
  { key: 'READY', label: 'Ready' }
];

export const DocumentDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error, info } = useToast();

  const [document, setDocument] = useState<SovereignDocumentDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [retrying, setRetrying] = useState<boolean>(false);

  // Tabs: 'preview' | 'logs' | 'chunks'
  const [activeTab, setActiveTab] = useState<'preview' | 'logs' | 'chunks'>('preview');
  const [logs, setLogs] = useState<DocumentProcessingLogItem[]>([]);
  const [chunks, setChunks] = useState<DocumentChunkItem[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [chunksLoading, setChunksLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;
    loadDocument(id);
  }, [id]);

  const loadDocument = async (docId: string) => {
    try {
      setLoading(true);
      const data = await documentsApi.get(docId);
      setDocument(data);
      if (data.recent_logs) {
        setLogs(data.recent_logs);
      }
    } catch (err: any) {
      error('Failed to load document', err.message || 'Resource may not exist or access is restricted.');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = async (tab: 'preview' | 'logs' | 'chunks') => {
    setActiveTab(tab);
    if (!id) return;

    if (tab === 'logs' && logs.length === 0) {
      try {
        setLogsLoading(true);
        const logData = await documentsApi.getLogs(id);
        setLogs(logData);
      } catch (err: any) {
        error('Failed to load logs', err.message);
      } finally {
        setLogsLoading(false);
      }
    } else if (tab === 'chunks' && chunks.length === 0) {
      try {
        setChunksLoading(true);
        const chunkData = await documentsApi.getChunks(id);
        setChunks(chunkData);
      } catch (err: any) {
        error('Failed to load chunks', err.message);
      } finally {
        setChunksLoading(false);
      }
    }
  };

  const handleRetry = async () => {
    if (!document) return;
    try {
      setRetrying(true);
      info('Retrying Processing', 'Re-executing sovereign multimodal and RAG pipeline...');
      const res = await documentsApi.retry(document.id);
      if (res.success) {
        success('Processing Complete', res.message);
      } else {
        error('Reprocessing Failed', res.message);
      }
      await loadDocument(document.id);
      if (activeTab === 'logs') {
        const freshLogs = await documentsApi.getLogs(document.id);
        setLogs(freshLogs);
      }
    } catch (err: any) {
      error('Retry Failed', err.message || 'Unable to reprocess document.');
    } finally {
      setRetrying(false);
    }
  };

  const handleDownload = async () => {
    if (!document) return;
    try {
      setDownloading(true);
      await documentsApi.download(document.id, document.filename, document);
      success('Download Initiated', `${document.filename} is streaming from sovereign vault.`);
    } catch (err: any) {
      error('Download Failed', err.message || 'Unable to stream file.');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!document) return;
    if (!window.confirm(`Are you sure you want to permanently purge "${document.title}" from sovereign disk?`)) {
      return;
    }
    try {
      setDeleting(true);
      await documentsApi.delete(document.id);
      success('Document Purged', 'Database record and sovereign storage file purged.');
      navigate('/documents');
    } catch (err: any) {
      error('Purge Failed', err.message || 'Permission denied or file locked.');
      setDeleting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    success('Copied to Clipboard', `${label} copied.`);
  };

  const getClassificationBadge = (cls: string) => {
    switch (cls?.toUpperCase()) {
      case 'RESTRICTED':
      case 'TOP_SECRET':
        return <Badge variant="danger" size="sm"><Lock className="h-3 w-3" /> {cls}</Badge>;
      case 'CONFIDENTIAL':
      case 'SECRET':
        return <Badge variant="warning" size="sm">{cls}</Badge>;
      case 'INTERNAL':
        return <Badge variant="info" size="sm">INTERNAL</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{cls || 'UNCLASSIFIED'}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-xs font-medium text-slate-500">Retrieving sovereign document metadata & audit trail...</p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 text-center max-w-lg mx-auto mt-12 shadow-sm">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Document Not Found</h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          The requested sovereign document identifier does not exist or your role lacks reading clearance.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate('/documents')}>
          <ArrowLeft className="h-4 w-4" /> Return to Documents
        </Button>
      </div>
    );
  }

  const canDelete = document.permissions?.includes('DELETE');
  const isFailed = document.status === 'FAILED';
  const isReady = document.status === 'READY';

  // Determine stage position in stepper
  const currentStageIndex = isFailed 
    ? -1 
    : LIFECYCLE_STAGES.findIndex(s => s.key === document.status);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-card">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="xs" onClick={() => navigate('/documents')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">{document.title}</h1>
              {getClassificationBadge(document.classification)}
              <Badge 
                variant={
                  isReady ? 'success' :
                  isFailed ? 'danger' :
                  document.status === 'OCR' ? 'warning' :
                  document.status === 'VISION' ? 'sovereign' :
                  document.status === 'INDEXING' ? 'info' : 'neutral'
                } 
                size="sm" 
                dot
              >
                {document.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              ID: {document.id} &bull; Filename: {document.filename} &bull; {(document.file_size_bytes / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isFailed && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              isLoading={retrying}
              className="text-amber-700 hover:bg-amber-50 border-amber-300 font-semibold"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Retry Processing
            </Button>
          )}
          <Button
            variant="ai"
            size="sm"
            onClick={() => navigate(`/documents/${document.id}/chat`)}
            disabled={!isReady}
          >
            <MessageSquare className="h-4 w-4 mr-1.5" />
            Chat with Document
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={downloading}
          >
            <Download className="h-4 w-4 mr-1.5" />
            {downloading ? 'Downloading...' : 'Download File'}
          </Button>
          {canDelete && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {deleting ? 'Purging...' : 'Delete'}
            </Button>
          )}
        </div>
      </div>

      {/* 7-Stage Lifecycle Stepper */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
            Multimodal Processing Lifecycle
          </span>
          <span className="text-xs font-mono font-medium text-slate-500">
            Current Status: <strong className={isReady ? 'text-emerald-600' : isFailed ? 'text-red-600' : 'text-blue-600'}>{document.status}</strong>
          </span>
        </div>

        {isFailed ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-red-800 font-medium">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <span>Pipeline halted: {document.processing_error || 'Internal extraction fault.'}</span>
            </div>
            <Button variant="outline" size="xs" onClick={handleRetry} isLoading={retrying} className="border-red-300 text-red-700 bg-white">
              <RefreshCw className="h-3 w-3 mr-1" /> Retry
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-2">
            {LIFECYCLE_STAGES.map((stg, idx) => {
              const isPast = isReady || idx < currentStageIndex;
              const isCurrent = idx === currentStageIndex;
              return (
                <div 
                  key={stg.key}
                  className={`p-2.5 rounded-lg border text-center transition-all ${
                    isPast 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                      : isCurrent 
                        ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-sm ring-2 ring-blue-500/20 font-bold' 
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="text-[10px] font-mono uppercase tracking-wider mb-0.5">Stage 0{idx + 1}</div>
                  <div className="text-xs font-semibold flex items-center justify-center gap-1">
                    {isPast && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                    {isCurrent && <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />}
                    {stg.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Metadata, Tabs (Preview | Logs | Chunks), Telemetry */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Metadata Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-navy-900" />
                Sovereign Storage Metadata
              </CardTitle>
              <CardDescription>Cryptographic verification and storage specs</CardDescription>
            </CardHeader>
            <div className="p-5 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[11px]">MIME Content Type</span>
                <span className="font-mono text-slate-800 font-semibold">{document.mime_type}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[11px]">Storage File Size</span>
                <span className="font-mono text-slate-800 font-semibold">{document.file_size_bytes.toLocaleString()} bytes ({(document.file_size_bytes / 1024 / 1024).toFixed(2)} MB)</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">SHA-256 Integrity Checksum</span>
                  <button 
                    onClick={() => copyToClipboard(document.sha256_hash, 'SHA-256')}
                    className="text-[10px] text-navy-900 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
                <span className="font-mono text-slate-800 break-all text-[11px] block mt-1">
                  {document.sha256_hash}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[11px]">Uploaded By</span>
                <span className="text-slate-800 font-semibold">
                  {document.owner_name || document.owner_email || document.uploaded_by || 'Sovereign Operator'}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[11px]">Asset Classification &amp; Category</span>
                <span className="text-slate-800 font-semibold">
                  {document.classification} &bull; {document.asset_category || 'DOCUMENT'}
                </span>
              </div>
            </div>
          </Card>

          {/* Tabbed Inspector: Content Preview | Processing Logs | Vector Chunks */}
          <Card>
            <div className="border-b border-slate-200 px-5 pt-3 flex items-center gap-4 text-xs font-semibold">
              <button
                onClick={() => handleTabChange('preview')}
                className={`pb-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeTab === 'preview' 
                    ? 'border-indigo-600 text-indigo-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileCode className="h-3.5 w-3.5" />
                Content Preview
              </button>
              <button
                onClick={() => handleTabChange('logs')}
                className={`pb-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeTab === 'logs' 
                    ? 'border-indigo-600 text-indigo-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                Processing Logs ({logs.length})
              </button>
              <button
                onClick={() => handleTabChange('chunks')}
                className={`pb-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeTab === 'chunks' 
                    ? 'border-indigo-600 text-indigo-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Database className="h-3.5 w-3.5" />
                Vector Chunks ({document.total_chunks})
              </button>
            </div>

            <div className="p-5">
              {/* Tab 1: Preview */}
              {activeTab === 'preview' && (
                <div className="space-y-3">
                  {document.visual_summary && (
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-900 space-y-1">
                      <span className="font-bold flex items-center gap-1.5 text-purple-800">
                        <ScanText className="h-4 w-4" /> Visual Analysis Synthesis:
                      </span>
                      <p className="whitespace-pre-wrap leading-relaxed text-[11px]">{document.visual_summary}</p>
                    </div>
                  )}
                  <div className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-xs max-h-80 overflow-y-auto leading-relaxed border border-slate-800 whitespace-pre-wrap selection:bg-purple-900">
                    {document.content_preview || 'No text excerpt available for this asset.'}
                  </div>
                </div>
              )}

              {/* Tab 2: Processing Logs */}
              {activeTab === 'logs' && (
                <div>
                  {logsLoading ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2 text-indigo-600" />
                      Loading execution logs...
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 italic">
                      No processing logs recorded.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {logs.map((log) => (
                        <div 
                          key={log.id} 
                          className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-start gap-3"
                        >
                          <Badge 
                            variant={log.level === 'ERROR' ? 'danger' : log.level === 'WARNING' ? 'warning' : 'neutral'} 
                            size="sm"
                          >
                            {log.stage}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-slate-800">{log.message}</span>
                              <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                                {new Date(log.created_at).toLocaleTimeString()}
                              </span>
                            </div>
                            {log.details && Object.keys(log.details).length > 0 && (
                              <div className="mt-1 text-[10px] text-slate-500 font-mono bg-white p-1.5 rounded border border-slate-100">
                                {JSON.stringify(log.details)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Vector Chunks */}
              {activeTab === 'chunks' && (
                <div>
                  {chunksLoading ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2 text-indigo-600" />
                      Loading vector chunks...
                    </div>
                  ) : chunks.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 italic">
                      No indexed chunks stored for this document.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {chunks.map((chk) => (
                        <div key={chk.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-slate-800 font-mono">
                              Chunk #{chk.chunk_index} &bull; Page {chk.page_number}
                            </span>
                            <span className="text-slate-400 font-mono">{chk.token_count} tokens</span>
                          </div>
                          <p className="text-slate-700 italic bg-white p-2.5 rounded border border-slate-100 leading-relaxed font-serif">
                            "{chk.content}"
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Local Parser & OCR Metrics */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-card">
              <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">Pages</span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">{document.total_pages}</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-card">
              <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">Vectors</span>
              <span className="text-xl font-bold text-purple-700 mt-1 block">{document.total_chunks}</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-card">
              <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">OCR</span>
              <span className="text-xs font-bold text-emerald-600 mt-1 flex items-center justify-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {document.ocr_applied ? 'Applied' : 'Extracted'}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-card">
              <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">Vision</span>
              <span className="text-xs font-bold text-blue-600 mt-1 flex items-center justify-center gap-1">
                <Cpu className="h-3.5 w-3.5" />
                {document.vision_applied ? 'Analyzed' : 'Standard'}
              </span>
            </div>
          </div>

        </div>

        {/* Right 1 Column: Permissions, Audit Trail, Enclave Info */}
        <div className="space-y-6">

          {/* User Clearances & Permissions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-emerald-600" />
                Active Operator Clearance
              </CardTitle>
              <CardDescription>Enforced backend RBAC permissions</CardDescription>
            </CardHeader>
            <div className="p-5 pt-0 space-y-2">
              <div className="flex flex-wrap gap-2">
                {document.permissions?.map((p) => (
                  <Badge key={p} variant={p === 'DELETE' ? 'danger' : 'neutral'} size="sm">
                    {p}
                  </Badge>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Permissions evaluated dynamically using sovereign role definitions and resource ownership.
              </p>
            </div>
          </Card>

          {/* Immutable Audit Activity Trail */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                Audit Trail (Immutable)
              </CardTitle>
              <CardDescription>Recent governance events for this resource</CardDescription>
            </CardHeader>
            <div className="p-5 pt-0">
              {document.activity && document.activity.length > 0 ? (
                <div className="space-y-3">
                  {document.activity.map((act, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-xs border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 font-mono text-[11px]">{act.action}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 block truncate">{act.actor_email}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No historical audit logs recorded yet.</p>
              )}
            </div>
          </Card>

          {/* Air-Gap Guarantee Card */}
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-800">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              Zero Outbound Data Leakage
            </div>
            <p className="text-[11px] leading-relaxed text-emerald-800/90">
              This document is stored strictly in the organization's on-premises vault. Embeddings and previews are computed locally without third-party cloud APIs.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};
