import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { DataTable, Column } from '../components/ui/DataTable';
import { Tabs } from '../components/ui/Tabs';
import { Modal } from '../components/ui/Modal';
import { 
  knowledgeApi, 
  documentsApi, 
  KnowledgeSummary, 
  KnowledgeSearchResponse, 
  DocumentChunkItem, 
  SovereignDocument,
  RetrievedEvidenceItem,
  CitationItem
} from '../services/api';
import { 
  Database, 
  RefreshCw, 
  Layers, 
  Search, 
  Sliders, 
  CheckCircle2, 
  Cpu, 
  Server,
  FileCode,
  ShieldCheck,
  AlertTriangle,
  BookOpen,
  Trash2,
  ExternalLink,
  Filter,
  HelpCircle,
  Check,
  Copy,
  ArrowRight,
  FileText,
  Sparkles,
  Zap,
  Info,
  Clock,
  ShieldAlert,
  SlidersHorizontal
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export const KnowledgeBasePage: React.FC = () => {
  // Navigation tab
  const [activeTab, setActiveTab] = useState<'search' | 'documents' | 'chunks'>('search');

  // Telemetry & Summary
  const [summary, setSummary] = useState<KnowledgeSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Re-indexing state
  const [isReindexingAll, setIsReindexingAll] = useState(false);
  const [reindexingDocId, setReindexingDocId] = useState<string | null>(null);

  // Documents list
  const [documents, setDocuments] = useState<SovereignDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // Chunks list
  const [chunks, setChunks] = useState<DocumentChunkItem[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [chunkPage, setChunkPage] = useState(1);
  const [chunkSearch, setChunkSearch] = useState('');
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [selectedChunk, setSelectedChunk] = useState<DocumentChunkItem | null>(null);

  // Grounded Search Sandbox state
  const [searchQuery, setSearchQuery] = useState('');
  const [topK, setTopK] = useState(3);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.20);
  const [hybridSearch, setHybridSearch] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<KnowledgeSearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [copiedCitationIdx, setCopiedCitationIdx] = useState<number | null>(null);

  const { success, error, info } = useToast();

  // 1. Fetch Summary
  const fetchSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const data = await knowledgeApi.getSummary();
      setSummary(data);
    } catch (err: any) {
      console.error('Failed to load knowledge summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  // 2. Fetch Ingested Documents
  const fetchDocuments = useCallback(async () => {
    try {
      setLoadingDocs(true);
      const docs = await documentsApi.list();
      setDocuments(Array.isArray(docs) ? docs : (docs?.items || []));
    } catch (err: any) {
      console.error('Failed to load documents for KB:', err);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  // 3. Fetch Chunks
  const fetchChunks = useCallback(async (page = 1, query = '') => {
    try {
      setLoadingChunks(true);
      const res = await knowledgeApi.listChunks({
        page,
        page_size: 10,
        q: query || undefined
      });
      setChunks(Array.isArray(res?.items) ? res.items : []);
      setTotalChunks(res?.total_records || 0);
      setChunkPage(res?.page || 1);
    } catch (err: any) {
      console.error('Failed to load vector chunks:', err);
    } finally {
      setLoadingChunks(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Tab switch effect
  useEffect(() => {
    if (activeTab === 'documents') {
      fetchDocuments();
    } else if (activeTab === 'chunks') {
      fetchChunks(chunkPage, chunkSearch);
    }
  }, [activeTab, fetchDocuments, fetchChunks, chunkPage, chunkSearch]);

  // Re-index all handler
  const handleReindexAll = async () => {
    setIsReindexingAll(true);
    info('Re-Index Triggered', 'Re-generating dense embeddings with local embedding engine...');
    try {
      const resp = await knowledgeApi.reindex();
      if (resp.success) {
        success('Re-Index Complete', resp.message || `Re-indexed ${resp.reindexed_documents} documents successfully.`);
        fetchSummary();
        if (activeTab === 'documents') fetchDocuments();
        if (activeTab === 'chunks') fetchChunks(1, chunkSearch);
      } else {
        error('Re-Index Incomplete', resp.message || 'Some documents could not be indexed.');
      }
    } catch (err: any) {
      error('Re-Index Failed', err.message || 'Error occurred while re-indexing knowledge base.');
    } finally {
      setIsReindexingAll(false);
    }
  };

  // Single document re-index
  const handleReindexDoc = async (docId: string, docTitle: string) => {
    setReindexingDocId(docId);
    info('Re-Indexing Document', `Refreshing vector representations for "${docTitle}"...`);
    try {
      const resp = await knowledgeApi.reindex([docId]);
      if (resp.success) {
        success('Document Re-Indexed', `"${docTitle}" re-indexed successfully.`);
        fetchSummary();
        fetchDocuments();
      } else {
        error('Re-Index Failed', resp.message);
      }
    } catch (err: any) {
      error('Re-Index Failed', err.message || 'Could not re-index document.');
    } finally {
      setReindexingDocId(null);
    }
  };

  // Delete document from KB
  const handleDeleteDoc = async (docId: string, docTitle: string) => {
    if (!window.confirm(`Are you sure you want to delete "${docTitle}" and all its vector embeddings from the sovereign knowledge base?`)) {
      return;
    }
    setDeletingDocId(docId);
    try {
      await knowledgeApi.delete(docId);
      success('Document Removed', `"${docTitle}" and associated vector chunks were deleted.`);
      fetchSummary();
      fetchDocuments();
    } catch (err: any) {
      error('Delete Failed', err.message || 'Could not delete document from knowledge base.');
    } finally {
      setDeletingDocId(null);
    }
  };

  // Execute Grounded Search
  const handleGroundedSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || isSearching) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const resp = await knowledgeApi.search({
        query: searchQuery.trim(),
        top_k: topK,
        similarity_threshold: similarityThreshold,
        hybrid_search: hybridSearch,
      });
      setSearchResult(resp);
    } catch (err: any) {
      console.error('Grounded search failed:', err);
      setSearchError(err.message || 'Grounded search query failed. Ensure backend vector store is initialized.');
    } finally {
      setIsSearching(false);
    }
  };

  // Copy answer text
  const handleCopyAnswer = () => {
    if (!searchResult?.answer) return;
    navigator.clipboard.writeText(searchResult.answer);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 2000);
  };

  // Copy citation excerpt
  const handleCopyCitation = (idx: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCitationIdx(idx);
    setTimeout(() => setCopiedCitationIdx(null), 2000);
  };

  // Chunk table columns
  const chunkColumns: Column<DocumentChunkItem>[] = [
    {
      header: 'Chunk ID & Position',
      cell: (chk) => (
        <div>
          <span className="font-mono text-xs font-semibold text-slate-800">{chk.id.slice(0, 12)}...</span>
          <div className="text-[10px] text-slate-400">
            Page {chk.page_number} &bull; Index #{chk.chunk_index}
          </div>
        </div>
      ),
    },
    {
      header: 'Extracted Chunk Content Excerpt',
      className: 'max-w-md',
      cell: (chk) => (
        <p className="text-xs text-slate-700 line-clamp-2 italic">
          "{chk.content}"
        </p>
      ),
    },
    {
      header: 'Tokens',
      cell: (chk) => (
        <span className="text-xs font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
          {chk.token_count}
        </span>
      ),
    },
    {
      header: 'Document ID',
      cell: (chk) => (
        <span className="text-[11px] font-mono text-slate-500">{chk.document_id.slice(0, 10)}...</span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      cell: (chk) => (
        <Button variant="ghost" size="xs" onClick={() => setSelectedChunk(chk)}>
          <FileText className="h-3 w-3 mr-1" /> View Full
        </Button>
      ),
    },
  ];

  // Document table columns
  const docColumns: Column<SovereignDocument>[] = [
    {
      header: 'Document Name',
      cell: (doc) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-600 shrink-0" />
          <div>
            <span className="font-medium text-xs text-slate-900 block truncate max-w-xs">{doc.title}</span>
            <span className="text-[10px] text-slate-400 font-mono">{(doc.file_size_bytes / 1024).toFixed(1)} KB &bull; {doc.mime_type}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Classification',
      cell: (doc) => (
        <Badge 
          variant={doc.classification === 'TOP_SECRET' ? 'danger' : doc.classification === 'SECRET' ? 'warning' : 'neutral'}
          size="sm"
        >
          {doc.classification}
        </Badge>
      ),
    },
    {
      header: 'Vector Status',
      cell: (doc) => (
        <Badge 
          variant={doc.status === 'READY' ? 'success' : doc.status === 'PROCESSING' || doc.status === 'INDEXING' ? 'warning' : 'danger'}
          size="sm"
        >
          {doc.status}
        </Badge>
      ),
    },
    {
      header: 'Last Updated',
      cell: (doc) => (
        <span className="text-xs text-slate-500 font-mono">
          {new Date(doc.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      cell: (doc) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button 
            variant="outline" 
            size="xs" 
            onClick={() => handleReindexDoc(doc.id, doc.title)}
            isLoading={reindexingDocId === doc.id}
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Re-index
          </Button>
          <Button 
            variant="danger" 
            size="xs" 
            onClick={() => handleDeleteDoc(doc.id, doc.title)}
            isLoading={deletingDocId === doc.id}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
  ];

  const totalVectors = summary?.total_vectors ?? 0;
  const embeddingModel = summary?.embedding_model ?? 'bge-m3:latest (Local)';
  const vectorDims = summary?.vector_dimensions ?? 384;
  const totalDocs = summary?.total_documents ?? 0;
  const lastReindexed = summary?.last_reindexed_at 
    ? new Date(summary.last_reindexed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Never';

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-card">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sovereign Knowledge Base &amp; RAG</h1>
            <Badge variant="sovereign" size="md" dot>
              {summary?.status || 'ONLINE'}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Air-gapped semantic vector retrieval with strictly grounded local synthesis. Zero cloud AI leaks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchSummary}
            isLoading={loadingSummary}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh Status
          </Button>
          <Button 
            variant="primary" 
            size="sm" 
            onClick={handleReindexAll} 
            isLoading={isReindexingAll}
          >
            <Database className="h-3.5 w-3.5 mr-1" />
            Re-Index Knowledge Base
          </Button>
        </div>
      </div>

      {/* Vector DB Telemetry Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card compact>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Dense Vector Chunks</span>
          <h3 className="text-xl font-bold text-slate-900 mt-1">{totalVectors.toLocaleString()}</h3>
          <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1 font-medium">
            <CheckCircle2 className="h-3 w-3" /> Cosine Normalized
          </p>
        </Card>

        <Card compact>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Embedding Model</span>
          <h3 className="text-xl font-bold text-slate-900 mt-1 truncate">{embeddingModel}</h3>
          <p className="text-[11px] text-slate-500 mt-1">{vectorDims}-dimensional (Air-Gapped)</p>
        </Card>

        <Card compact>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Indexing Protocol</span>
          <h3 className="text-xl font-bold text-slate-900 mt-1 truncate">{summary?.indexing_engine || 'Sovereign Cosine / HNSW'}</h3>
          <p className="text-[11px] text-slate-500 mt-1">Synced {lastReindexed}</p>
        </Card>

        <Card compact>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ingested Documents</span>
          <h3 className="text-xl font-bold text-indigo-600 mt-1">{totalDocs}</h3>
          <p className="text-[11px] text-slate-500 mt-1">Active Sovereign Sources</p>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <Tabs
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as any)}
          variant="pill"
          tabs={[
            { id: 'search', label: 'Grounded RAG Search', icon: <Search className="h-3.5 w-3.5 mr-1" /> },
            { id: 'documents', label: 'Ingested Data Sources', badge: totalDocs, icon: <FileText className="h-3.5 w-3.5 mr-1" /> },
            { id: 'chunks', label: 'Vector Chunk Inspector', badge: totalVectors, icon: <Layers className="h-3.5 w-3.5 mr-1" /> },
          ]}
        />
      </div>

      {/* TAB 1: Grounded RAG Search Sandbox */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Search Query Form & Controls */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Sovereign Grounded Search Sandbox</CardTitle>
                <CardDescription>
                  Query local vector representations. Distinguishes retrieved evidence, grounded local synthesis, and strictly declares insufficient evidence.
                </CardDescription>
              </div>
              <Badge variant="sovereign" size="sm">
                Zero Cloud Leakage Guarantee
              </Badge>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleGroundedSearch} className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Enter natural language query to retrieve grounded evidence..."
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                    />
                  </div>
                  <Button type="submit" variant="primary" size="md" isLoading={isSearching} disabled={!searchQuery.trim()}>
                    <Zap className="h-3.5 w-3.5 mr-1.5" /> Run Grounded Search
                  </Button>
                </div>

                {/* Advanced Retrieval Controls */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 flex flex-wrap items-center gap-6 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600" />
                    <span className="font-semibold text-slate-700">Retrieval Parameters:</span>
                  </div>

                  {/* Top-K */}
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-slate-500">Top-K Passages:</label>
                    <select
                      value={topK}
                      onChange={(e) => setTopK(Number(e.target.value))}
                      className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 font-mono text-slate-800 focus:outline-none"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                      <option value={8}>8</option>
                    </select>
                  </div>

                  {/* Similarity Threshold */}
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-slate-500">Similarity Cutoff:</label>
                    <input 
                      type="range" 
                      min="0.0" 
                      max="0.9" 
                      step="0.05"
                      value={similarityThreshold}
                      onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                      className="w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <span className="font-mono text-[11px] text-slate-700 font-semibold">
                      {(similarityThreshold * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Hybrid Search Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hybridSearch}
                      onChange={(e) => setHybridSearch(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                    />
                    <span className="text-[11px] text-slate-700 font-medium">Hybrid Dense + Lexical Keyword</span>
                  </label>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Search Error Notice */}
          {searchError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-red-900 uppercase tracking-wide">Retrieval Execution Error</h4>
                <p className="text-xs text-red-800 mt-1">{searchError}</p>
              </div>
            </div>
          )}

          {/* Search Results Display */}
          {searchResult && (
            <div className="space-y-6">

              {/* 1. Insufficient Evidence Notice (Strict Grounding Invariant) */}
              {searchResult.status === 'INSUFFICIENT_EVIDENCE' && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 shadow-xs">
                  <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                        Notice: Insufficient Grounded Evidence
                      </h4>
                      <Badge variant="warning" size="sm">
                        Zero Hallucination Policy Enforced
                      </Badge>
                    </div>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      The sovereign retriever evaluated indexed vector embeddings against the threshold of <strong>{(similarityThreshold * 100).toFixed(0)}%</strong>. No relevant document passages satisfied the confidence criteria. In accordance with KELVRIN sovereign AI governance, speculative or hallucinated answers are strictly prohibited.
                    </p>
                  </div>
                </div>
              )}

              {/* 2. Model-Generated Answer */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    <CardTitle>Locally Synthesized Grounded Answer</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={searchResult.status === 'EVIDENCE_FOUND' ? 'success' : 'warning'} 
                      size="sm"
                    >
                      {searchResult.status}
                    </Badge>
                    <Badge variant="neutral" size="sm">
                      <Cpu className="h-3 w-3 mr-1" />
                      {searchResult.model_used}
                    </Badge>
                    <Badge variant="neutral" size="sm">
                      <Clock className="h-3 w-3 mr-1" />
                      {searchResult.latency_ms} ms
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 text-xs text-slate-800 leading-relaxed font-sans select-text whitespace-pre-wrap">
                    {searchResult.answer}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>
                      Routing reasoning: <code className="text-slate-700 bg-slate-100 px-1 py-0.5 rounded font-mono">{searchResult.routing_reasoning}</code>
                    </span>
                    <Button variant="ghost" size="xs" onClick={handleCopyAnswer}>
                      {copiedAnswer ? <Check className="h-3 w-3 text-emerald-600 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                      {copiedAnswer ? 'Copied' : 'Copy Answer'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* 3. Verifiable Citations List */}
              {searchResult.citations && searchResult.citations.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-blue-600" />
                      <CardTitle>Verifiable Citations ({searchResult.citations.length})</CardTitle>
                    </div>
                    <CardDescription>
                      Exact excerpts and page references backing the synthesized answer above
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {searchResult.citations.map((cit, idx) => (
                        <div key={idx} className="p-3 bg-white rounded-lg border border-slate-200 shadow-xs space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-indigo-700 font-mono">[{idx + 1}]</span>
                              <span className="font-semibold text-xs text-slate-900">{cit.document_title}</span>
                              <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                                {cit.filename} &bull; Page {cit.page_number} &bull; Chunk #{cit.chunk_index}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="success" size="sm">
                                {(cit.similarity_score * 100).toFixed(1)}% Match
                              </Badge>
                              <Button 
                                variant="ghost" 
                                size="xs" 
                                onClick={() => handleCopyCitation(idx, cit.excerpt)}
                              >
                                {copiedCitationIdx === idx ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                              </Button>
                            </div>
                          </div>
                          <blockquote className="italic text-xs text-slate-700 bg-slate-50/80 p-2.5 rounded border border-slate-100 font-serif leading-relaxed">
                            "{cit.excerpt}"
                          </blockquote>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 4. Retrieved Raw Evidence Passages */}
              {searchResult.evidence && searchResult.evidence.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-emerald-600" />
                      <CardTitle>Retrieved Evidence Passages ({searchResult.evidence.length})</CardTitle>
                    </div>
                    <CardDescription>
                      Dense vector similarity ranked segments extracted from the sovereign vector store
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-3">
                      {searchResult.evidence.map((ev, eIdx) => (
                        <div key={eIdx} className="p-3 rounded-lg border border-slate-200/90 bg-white space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <FileText className="h-3.5 w-3.5 text-slate-400" />
                              <span className="font-semibold text-slate-800">{ev.document_title}</span>
                              <Badge variant="neutral" size="sm">
                                {ev.classification}
                              </Badge>
                              <span className="text-[10px] text-slate-400 font-mono">
                                Page {ev.page_number} &bull; Chunk #{ev.chunk_index}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-400 font-mono">Cosine Similarity:</span>
                              <Badge variant="success" size="sm">
                                {(ev.similarity_score * 100).toFixed(1)}%
                              </Badge>
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 font-mono line-clamp-3">
                            {ev.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

            </div>
          )}
        </div>
      )}

      {/* TAB 2: Ingested Data Sources & Documents */}
      {activeTab === 'documents' && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Ingested Data Sources &amp; Enclave Documents</CardTitle>
              <CardDescription>
                All documents cataloged and indexed within the sovereign knowledge base
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchDocuments} isLoading={loadingDocs}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {documents.length === 0 && !loadingDocs ? (
              <div className="text-center py-10">
                <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No documents ingested in the sovereign knowledge base yet.</p>
              </div>
            ) : (
              <DataTable
                data={documents}
                columns={docColumns}
                searchPlaceholder="Search ingested documents..."
                searchFilter={(d, q) => d.title.toLowerCase().includes(q) || d.mime_type.toLowerCase().includes(q)}
                pageSize={10}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: Vector Chunk Inspector */}
      {activeTab === 'chunks' && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Vector Chunk Inspector</CardTitle>
              <CardDescription>
                Direct view into chunked text passages, token allocations, and sovereign vector metadata
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchChunks(1, chunkSearch)} isLoading={loadingChunks}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Refresh Chunks
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                placeholder="Filter vector chunks by text or document ID..."
                value={chunkSearch}
                onChange={(e) => setChunkSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchChunks(1, chunkSearch)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <Button variant="outline" size="xs" onClick={() => fetchChunks(1, chunkSearch)}>
                <Search className="h-3 w-3 mr-1" /> Search Chunks
              </Button>
            </div>

            {chunks.length === 0 && !loadingChunks ? (
              <div className="text-center py-10">
                <Layers className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No vector chunks found. Ingest and index documents to populate.</p>
              </div>
            ) : (
              <DataTable
                data={chunks}
                columns={chunkColumns}
                pageSize={10}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Chunk Detail Modal */}
      {selectedChunk && (
        <Modal
          isOpen={!!selectedChunk}
          onClose={() => setSelectedChunk(null)}
          title="Vector Chunk Details"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Chunk ID</span>
                <span className="font-mono text-slate-700 break-all">{selectedChunk.id}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Document ID</span>
                <span className="font-mono text-slate-700 break-all">{selectedChunk.document_id}</span>
              </div>
              <div className="mt-2">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Page &amp; Index</span>
                <span className="font-mono text-slate-700">Page {selectedChunk.page_number} &bull; Chunk #{selectedChunk.chunk_index}</span>
              </div>
              <div className="mt-2">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Token Count</span>
                <span className="font-mono text-slate-700">{selectedChunk.token_count} tokens</span>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-700 block mb-1">Passage Content:</span>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-xs text-slate-800 whitespace-pre-wrap max-h-60 overflow-y-auto select-text">
                {selectedChunk.content}
              </div>
            </div>

            {selectedChunk.chunk_metadata && (
              <div>
                <span className="text-xs font-semibold text-slate-700 block mb-1">Metadata Attributes:</span>
                <pre className="p-2 bg-slate-100 rounded text-[10px] font-mono text-slate-600 overflow-x-auto">
                  {JSON.stringify(selectedChunk.chunk_metadata, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedChunk(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
};
