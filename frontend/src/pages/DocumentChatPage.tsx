import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { 
  FileText, 
  ArrowLeft, 
  Send, 
  Bot, 
  ShieldCheck, 
  Bookmark,
  CheckCircle2, 
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Cpu,
  Layers,
  Sparkles,
  RefreshCw,
  Lock,
  BookOpen
} from 'lucide-react';
import { 
  documentsApi, 
  chatApi, 
  modelsApi, 
  SovereignDocumentDetail, 
  SovereignModel,
  DocumentChatQueryResponse,
  CitationItem,
  RetrievedEvidenceItem
} from '../services/api';

interface QnAItem {
  id: string;
  query: string;
  answer: string;
  model_used: string;
  detected_intent: string;
  routing_reasoning: string;
  citation_snippet?: string | null;
  citations?: CitationItem[];
  evidence?: RetrievedEvidenceItem[];
  latency_ms: number;
  timestamp: string;
}

export const DocumentChatPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<SovereignDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [models, setModels] = useState<SovereignModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('auto');

  const [query, setQuery] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [history, setHistory] = useState<QnAItem[]>(() => {
    if (!id) return [];
    try {
      const saved = localStorage.getItem(`kelvrin_doc_chat_${id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync and persist chat history to local system storage
  useEffect(() => {
    if (id) {
      try {
        localStorage.setItem(`kelvrin_doc_chat_${id}`, JSON.stringify(history));
      } catch {}
    }
  }, [id, history]);

  // Load Document and Models
  useEffect(() => {
    if (!id) return;
    try {
      const saved = localStorage.getItem(`kelvrin_doc_chat_${id}`);
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch {}

    const loadDocAndModels = async () => {
      setLoading(true);
      setError(null);
      try {
        const [docRes, modelsRes] = await Promise.allSettled([
          documentsApi.get(id),
          modelsApi.list()
        ]);

        if (docRes.status === 'fulfilled') {
          setDoc(docRes.value);
        } else {
          setError('Sovereign document not found or access denied.');
        }

        if (modelsRes.status === 'fulfilled') {
          setModels(modelsRes.value.filter(m => m.is_active));
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

    loadDocAndModels();
  }, [id]);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !doc || isQuerying) return;

    // Hard gate: check if document is ready
    if (doc.status !== 'READY') {
      return;
    }

    const currentQuery = query.trim();
    setQuery('');
    setIsQuerying(true);

    try {
      const resp: DocumentChatQueryResponse = await chatApi.queryDocument(
        doc.id,
        currentQuery,
        selectedModelId
      );

      const newItem: QnAItem = {
        id: `qna-${Date.now()}`,
        query: currentQuery,
        answer: resp.answer,
        model_used: resp.model_used,
        detected_intent: resp.detected_intent,
        routing_reasoning: resp.routing_reasoning,
        citation_snippet: resp.citation_snippet,
        citations: resp.citations || [],
        evidence: resp.evidence || [],
        latency_ms: resp.latency_ms,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setHistory(prev => [newItem, ...prev]);
    } catch (err: any) {
      console.error('Document query error:', err);
      alert(`Query failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-6.5rem)] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-7 w-7 animate-spin text-indigo-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-medium">Loading document enclave...</p>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="h-[calc(100vh-6.5rem)] flex flex-col items-center justify-center gap-3">
        <AlertTriangle className="h-9 w-9 text-amber-500" />
        <h2 className="text-sm font-bold text-slate-800">{error || 'Document Unavailable'}</h2>
        <Button variant="outline" size="sm" onClick={() => navigate('/documents')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Documents
        </Button>
      </div>
    );
  }

  const isReady = doc.status === 'READY';

  return (
    <div className="h-[calc(100vh-6.5rem)] flex flex-col gap-3">
      
      {/* Top Header */}
      <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200/90 shadow-card flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="xs" onClick={() => navigate('/documents')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="h-4 w-[1px] bg-slate-200" />
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-blue-600 shrink-0" />
            <h2 className="text-xs font-bold text-slate-900 truncate max-w-md">
              {doc.title}
            </h2>
            <Badge variant="warning" size="sm">
              {doc.classification}
            </Badge>
            <Badge 
              variant={isReady ? 'success' : doc.status === 'PROCESSING' ? 'warning' : 'danger'} 
              size="sm"
            >
              {doc.status}
            </Badge>
          </div>
        </div>

        {/* Model Selector & Air-Gap Badge */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
            <Cpu className="h-3.5 w-3.5 text-indigo-600" />
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="text-xs bg-transparent border-none text-slate-800 focus:outline-none cursor-pointer font-medium"
            >
              <option value="auto">⚡ Auto Select (Grounded Router)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider_type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <Badge variant="sovereign" size="sm" dot>
            Zero Cloud Leakage
          </Badge>
        </div>
      </div>

      {/* Main Split Pane: Left Document Preview (45%) | Right Grounded Q&A (55%) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
        
        {/* Left Pane: Document Text Preview */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-card flex flex-col overflow-hidden">
          
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              <span className="font-semibold text-slate-800">Extracted Document Text</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {(doc.file_size_bytes / 1024).toFixed(1)} KB • {doc.mime_type}
            </span>
          </div>

          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs leading-relaxed text-slate-700 bg-slate-50/50 whitespace-pre-wrap select-text">
            {doc.content_preview ? (
              doc.content_preview
            ) : (
              <div className="text-center text-slate-400 p-8">
                No text preview extracted for this file.
              </div>
            )}
          </div>

          <div className="p-2.5 border-t border-slate-200 bg-white text-[11px] text-slate-500 flex items-center justify-between">
            <span className="truncate">SHA-256: <code className="text-[10px] text-slate-600">{doc.sha256_hash.slice(0, 16)}...</code></span>
            <span className="text-emerald-700 font-medium flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified
            </span>
          </div>
        </div>

        {/* Right Pane: Grounded Chat */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-card flex flex-col overflow-hidden">
          
          {/* Status Alert Banner if not READY */}
          {!isReady && (
            <div className="p-4 bg-amber-50 border-b border-amber-200 flex items-start gap-3">
              <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                  Grounded Q&amp;A Locked — Zero Hallucination Policy
                </h4>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  Document status is currently <strong>{doc.status}</strong>. KELVRIN strictly enforces zero-hallucination guarantees: conversational synthesis is locked until the document ingestion and parsing reaches <strong>READY</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Q&A Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {history.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 max-w-md mx-auto">
                <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100 text-blue-600 mb-3 shadow-sm">
                  <Bookmark className="h-7 w-7" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">
                  Grounded Document Chat
                </h3>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Ask targeted questions regarding <strong>{doc.title}</strong>. Local models synthesize responses strictly grounded in the document text above.
                </p>
                {isReady && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    <button
                      onClick={() => setQuery('What are the primary operational rules outlined here?')}
                      className="text-[11px] bg-slate-50 hover:bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-200 transition-colors text-left"
                    >
                      "What are the primary operational rules?"
                    </button>
                    <button
                      onClick={() => setQuery('Summarize key obligations and compliance guidelines.')}
                      className="text-[11px] bg-slate-50 hover:bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-200 transition-colors text-left"
                    >
                      "Summarize key compliance guidelines"
                    </button>
                  </div>
                )}
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="space-y-2 border-b border-slate-100 pb-4">
                  {/* Operator Query */}
                  <div className="flex gap-2.5 items-start justify-end">
                    <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl rounded-tr-none px-3.5 py-2 text-xs max-w-lg shadow-sm">
                      {item.query}
                    </div>
                  </div>

                  {/* Grounded Assistant Response */}
                  <div className="flex gap-2.5 items-start">
                    <img
                      src="/ai-agent-logo.png"
                      alt="KELVRIN AI"
                      className="h-6 w-6 rounded-lg object-cover shadow-sm ring-1 ring-slate-200/60 shrink-0 mt-1"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/favicon.svg";
                      }}
                    />
                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-none p-3.5 text-xs text-slate-800 shadow-sm space-y-2.5">
                      <div className="whitespace-pre-wrap leading-relaxed">{item.answer}</div>

                      {/* Grounded Citations & Page References */}
                      {item.citations && item.citations.length > 0 ? (
                        <div className="space-y-1.5 mt-2">
                          <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                            <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
                            <span>Grounded Citations ({item.citations.length})</span>
                          </div>
                          <div className="space-y-1.5">
                            {item.citations.map((cit, cIdx) => (
                              <div key={cIdx} className="p-2 bg-white rounded-lg border border-slate-200 text-[11px] space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-indigo-700 font-mono">[{cIdx + 1}]</span>
                                    <span className="font-medium text-slate-800">{cit.document_title}</span>
                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                                      Page {cit.page_number} &bull; #{cit.chunk_index}
                                    </span>
                                  </div>
                                  <Badge variant="success" size="sm">
                                    {(cit.similarity_score * 100).toFixed(1)}% match
                                  </Badge>
                                </div>
                                <p className="italic text-slate-600 bg-slate-50/70 p-1.5 rounded border border-slate-100 text-[11px] line-clamp-3">
                                  "{cit.excerpt}"
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : item.citation_snippet ? (
                        <div className="p-2 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-600">
                          <span className="font-semibold text-blue-700 block mb-0.5">Grounded Passage Excerpt:</span>
                          <span className="italic">"{item.citation_snippet}"</span>
                        </div>
                      ) : null}

                      {/* Model Routing Transparency Bar */}
                      <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-700 flex items-center gap-1">
                            <Cpu className="h-3 w-3 text-indigo-600" />
                            {item.model_used}
                          </span>
                          <span className="bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-mono">
                            {item.detected_intent}
                          </span>
                          <span>{item.latency_ms}ms</span>
                        </div>
                        <button
                          onClick={() => handleCopy(item.id, item.answer)}
                          className="hover:text-slate-800 flex items-center gap-1 transition-colors"
                        >
                          {copiedId === item.id ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          <span>Copy</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}

            {isQuerying && (
              <div className="flex gap-2.5 items-center text-xs text-indigo-700 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" />
                <span>Locally synthesizing grounded answer from document text...</span>
              </div>
            )}
          </div>

          {/* Bottom Query Input */}
          <form onSubmit={handleAsk} className="p-3 border-t border-slate-200 bg-white">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={!isReady || isQuerying}
                placeholder={
                  isReady 
                    ? "Ask question strictly grounded in this document..." 
                    : `Q&A locked (Document state is ${doc.status})`
                }
                className="flex-1 bg-transparent border-none text-xs text-slate-800 placeholder-slate-400 focus:outline-none disabled:cursor-not-allowed"
              />
              <Button
                type="submit"
                variant="primary"
                size="xs"
                disabled={!query.trim() || !isReady || isQuerying}
                className="px-3 py-1.5 rounded-lg"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 px-1">
              <span>Local Air-Gap Guarantee: Strictly grounded synthesis. Zero external cloud APIs.</span>
              <span>Doc ID: {doc.id.slice(0, 8)}...</span>
            </div>
          </form>

        </div>

      </div>

    </div>
  );
};
