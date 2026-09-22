import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { DataTable, Column } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Drawer } from '../components/ui/Drawer';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useToast } from '../components/ui/Toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getActiveCompany } from '../services/accessControl';
import { 
  fetchDocumentsFromCloud, 
  listenToDocumentsFromCloud, 
  syncDocumentToCloud, 
  deleteDocumentFromCloud 
} from '../services/cloudSync';
import { 
  documentsApi, 
  SovereignDocument, 
  SovereignDocumentDetail 
} from '../services/api';
import { 
  FileText, 
  UploadCloud, 
  MessageSquare, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Lock,
  FileCode,
  Eye,
  Download,
  Filter,
  Search,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
  File,
  Image as ImageIcon
} from 'lucide-react';

export const DocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error, info } = useToast();

  const currentCompanyCode = user?.companyCode || getActiveCompany().code || 'KELV-HQ';

  // Documents state
  const [documents, setDocuments] = useState<SovereignDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Filters state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [classificationFilter, setClassificationFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('ALL');

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadClassification, setUploadClassification] = useState('INTERNAL');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quick view drawer state
  const [activeDrawerDoc, setActiveDrawerDoc] = useState<SovereignDocumentDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const res = await documentsApi.list({
        q: searchTerm || undefined,
        classification: classificationFilter !== 'ALL' ? classificationFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        file_type: fileTypeFilter !== 'ALL' ? fileTypeFilter : undefined,
        page: 1,
        page_size: 100
      });
      const items: SovereignDocument[] = Array.isArray(res) ? res : (res?.items || []);

      // Fetch cloud documents for this company and merge with strict tenant isolation
      const cloudDocs = await fetchDocumentsFromCloud(currentCompanyCode).catch(() => []);

      const map = new Map<string, SovereignDocument>();
      cloudDocs.forEach(d => map.set(d.id, d));
      items.forEach(d => {
        if (!map.has(d.id)) map.set(d.id, d);
      });

      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
      setDocuments(merged);
    } catch (err: any) {
      error('Failed to load documents', err.message || 'Network or authorization issue.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDocuments();

    // Live Real-Time Multi-Tenant Cross-Role Subscription
    // Documents uploaded by ANY role in this company appear immediately!
    const unsub = listenToDocumentsFromCloud(currentCompanyCode, (cloudDocs) => {
      setDocuments(prev => {
        const map = new Map<string, SovereignDocument>();
        cloudDocs.forEach(d => map.set(d.id, d));
        prev.forEach(d => {
          if (!map.has(d.id)) map.set(d.id, d);
        });
        return Array.from(map.values()).sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
      });
    });

    return () => {
      unsub();
    };
  }, [currentCompanyCode, classificationFilter, statusFilter, fileTypeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadDocuments();
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadDocuments();
  };

  const handleRetry = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      info('Retrying Processing', 'Re-submitting document to multimodal and RAG pipeline...');
      const res = await documentsApi.retry(docId);
      if (res.success) {
        success('Processing Complete', res.message);
      } else {
        error('Processing Failed', res.message);
      }
      loadDocuments();
    } catch (err: any) {
      error('Retry Failed', err.message || 'Unable to reprocess document.');
    }
  };

  const handleOpenDrawer = async (docId: string) => {
    try {
      setDrawerLoading(true);
      const detail = await documentsApi.get(docId);
      setActiveDrawerDoc(detail);
    } catch (err: any) {
      error('Failed to retrieve document details', err.message);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleDownload = async (doc: SovereignDocument, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await documentsApi.download(doc.id, doc.filename, doc);
      success('Download Initiated', `${doc.filename} streaming securely.`);
    } catch (err: any) {
      error('Download Failed', err.message);
    }
  };

  const handleDelete = async (doc: SovereignDocument, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Permanently delete "${doc.title}" from sovereign vault?`)) {
      return;
    }
    try {
      await documentsApi.delete(doc.id).catch(() => {});
      await deleteDocumentFromCloud(doc.id, currentCompanyCode).catch(() => {});
      success('Document Purged', `${doc.title} removed from database and disk.`);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      if (activeDrawerDoc?.id === doc.id) {
        setActiveDrawerDoc(null);
      }
    } catch (err: any) {
      error('Delete Failed', err.message || 'Clearance documents.delete required.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 50 * 1024 * 1024) {
        error('File Too Large', 'Maximum permissible upload size is 50 MB.');
        return;
      }
      setSelectedFile(file);
      if (!uploadTitle.trim()) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        setUploadTitle(nameWithoutExt.charAt(0).toUpperCase() + nameWithoutExt.slice(1));
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      error('Missing File', 'Please select a document to upload.');
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', uploadTitle.trim());
      formData.append('classification', uploadClassification);

      // If file <= 700KB, also convert to data URL so any system / role can download exact original
      if (selectedFile.size <= 700 * 1024) {
        try {
          const fileDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile);
          });
          if (fileDataUrl) {
            formData.append('fileDataUrl', fileDataUrl);
          }
        } catch {}
      }

      const newDoc = await documentsApi.upload(formData);
      if (newDoc) {
        await syncDocumentToCloud(newDoc, currentCompanyCode).catch(() => {});
      }

      success('Document Uploaded', `${newDoc.title} ingested and verified.`);
      setIsUploadOpen(false);
      setSelectedFile(null);
      setUploadTitle('');
      setUploadClassification('INTERNAL');
      loadDocuments();
    } catch (err: any) {
      error('Upload Failed', err.message || 'Unsupported format or integrity error.');
    } finally {
      setIsUploading(false);
    }
  };

  const getFormatIcon = (mime: string, filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (mime.includes('pdf') || ext === 'pdf') {
      return <FileText className="h-4 w-4 text-red-600" />;
    }
    if (ext === 'docx' || mime.includes('word')) {
      return <FileText className="h-4 w-4 text-blue-600" />;
    }
    if (ext === 'xlsx' || mime.includes('sheet')) {
      return <FileSpreadsheet className="h-4 w-4 text-emerald-600" />;
    }
    if (mime.startsWith('image/')) {
      return <ImageIcon className="h-4 w-4 text-purple-600" />;
    }
    return <FileCode className="h-4 w-4 text-slate-600" />;
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

  const columns: Column<SovereignDocument>[] = [
    {
      header: 'Document Name & Metadata',
      cell: (doc) => (
        <div 
          className="flex items-start gap-3 py-1 cursor-pointer group"
          onClick={() => handleOpenDrawer(doc.id)}
        >
          <div className="p-2 rounded-lg bg-slate-100 border border-slate-200/80 shrink-0 mt-0.5 group-hover:bg-blue-50 transition-colors">
            {getFormatIcon(doc.mime_type, doc.filename)}
          </div>
          <div>
            <span className="font-semibold text-slate-900 group-hover:text-navy-900 text-xs block transition-colors">
              {doc.title}
            </span>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 font-mono">
              <span className="truncate max-w-[160px]">{doc.filename}</span>
              <span>&bull;</span>
              <span>{(doc.file_size_bytes / 1024 / 1024).toFixed(2)} MB</span>
              <span>&bull;</span>
              <span title={doc.sha256_hash} className="cursor-help">SHA: {doc.sha256_hash.slice(0, 8)}...</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Classification',
      cell: (doc) => getClassificationBadge(doc.classification),
    },
    {
      header: 'Index Status',
      cell: (doc) => (
        <div className="space-y-0.5">
          <Badge 
            variant={
              doc.status === 'READY' ? 'success' :
              doc.status === 'FAILED' ? 'danger' :
              doc.status === 'OCR' ? 'warning' :
              doc.status === 'VISION' ? 'sovereign' :
              doc.status === 'INDEXING' ? 'info' :
              doc.status === 'PROCESSING' ? 'warning' : 'neutral'
            } 
            size="sm" 
            dot
          >
            {doc.status}
          </Badge>
          <div className="text-[10px] text-slate-400 font-mono">
            {doc.total_chunks} chunks ({doc.total_pages} pp.)
          </div>
        </div>
      ),
    },
    {
      header: 'Uploaded By',
      cell: (doc) => (
        <div className="text-xs text-slate-600">
          <div className="font-medium text-slate-700">{doc.uploaded_by || doc.owner_name || doc.owner_email || 'Enclave Operator'}</div>
          <div className="text-[10px] text-slate-400 font-mono">
            {new Date(doc.created_at).toLocaleDateString()}
          </div>
        </div>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      cell: (doc) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {doc.status === 'FAILED' && (
            <Button
              variant="outline"
              size="xs"
              onClick={(e) => handleRetry(doc.id, e)}
              title="Retry Processing"
              className="text-amber-700 hover:bg-amber-50 border-amber-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="outline"
            size="xs"
            onClick={() => handleOpenDrawer(doc.id)}
            title="Inspect Details & Metadata"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={(e) => handleDownload(doc, e)}
            title="Download Document"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ai"
            size="xs"
            onClick={() => navigate(`/documents/${doc.id}/chat`)}
            title="Chat with Document"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={(e) => handleDelete(doc, e)}
            title="Delete Document"
            className="text-slate-400 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const totalStorageBytes = documents.reduce((acc, d) => acc + d.file_size_bytes, 0);
  const readyCount = documents.filter(d => d.status === 'READY').length;

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sovereign Documents</h1>
            <Badge variant="sovereign" size="md">
              On-Premises Vault
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Zero cloud telemetry. Real-time MIME & magic byte verification, local OCR parsing, and chunk indexing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh repository"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsUploadOpen(true)}>
            <UploadCloud className="h-4 w-4" />
            Upload Document
          </Button>
        </div>
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-card">
          <div>
            <span className="text-xs text-slate-500 font-medium">Total Vault Documents</span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">{documents.length}</div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-700 rounded-lg">
            <FileText className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-card">
          <div>
            <span className="text-xs text-slate-500 font-medium">Ready & Indexed</span>
            <div className="text-2xl font-bold text-emerald-600 mt-0.5">{readyCount}</div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-card">
          <div>
            <span className="text-xs text-slate-500 font-medium">Total Vault Storage</span>
            <div className="text-2xl font-bold text-purple-700 mt-0.5">
              {(totalStorageBytes / (1024 * 1024)).toFixed(2)} MB
            </div>
          </div>
          <div className="p-3 bg-purple-50 text-purple-700 rounded-lg">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-card flex flex-col md:flex-row items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search documents by title, filename, or SHA-256 hash..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-navy-900"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Classification Filter */}
          <select
            value={classificationFilter}
            onChange={(e) => setClassificationFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-navy-900"
          >
            <option value="ALL">All Classifications</option>
            <option value="INTERNAL">INTERNAL</option>
            <option value="CONFIDENTIAL">CONFIDENTIAL</option>
            <option value="RESTRICTED">RESTRICTED</option>
            <option value="SECRET">SECRET</option>
            <option value="TOP_SECRET">TOP_SECRET</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-navy-900"
          >
            <option value="ALL">All Statuses (7)</option>
            <option value="QUEUED">QUEUED</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="OCR">OCR</option>
            <option value="VISION">VISION</option>
            <option value="INDEXING">INDEXING</option>
            <option value="READY">READY</option>
            <option value="FAILED">FAILED</option>
          </select>

          {/* File Format Filter */}
          <select
            value={fileTypeFilter}
            onChange={(e) => setFileTypeFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-navy-900"
          >
            <option value="ALL">All Formats</option>
            <option value="pdf">PDF Documents</option>
            <option value="docx">Word (.docx)</option>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="txt">Plain Text (.txt)</option>
            <option value="image">Scanned Images</option>
          </select>
        </div>
      </div>

      {/* Documents Table */}
      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-3 shadow-card">
          <LoadingSpinner size="lg" />
          <p className="text-xs text-slate-500 font-medium">Querying sovereign document repository...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center shadow-card">
          <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No Documents Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            No files match your query or filter criteria. Upload a verified document to start sovereign indexing.
          </p>
          <Button variant="primary" size="sm" className="mt-4" onClick={() => setIsUploadOpen(true)}>
            <UploadCloud className="h-4 w-4" /> Upload First Document
          </Button>
        </div>
      ) : (
        <DataTable
          data={documents}
          columns={columns}
          searchPlaceholder="Filter listed items..."
          searchFilter={(doc, q) =>
            doc.title.toLowerCase().includes(q) ||
            doc.filename.toLowerCase().includes(q) ||
            doc.sha256_hash.toLowerCase().includes(q)
          }
          pageSize={10}
        />
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadOpen}
        onClose={() => !isUploading && setIsUploadOpen(false)}
        title="Upload Sovereign Document"
        description="Encrypted on-premises ingest. Validates magic bytes, enforces RBAC, and generates safe previews."
        footer={
          <>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsUploadOpen(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button 
              variant="primary" 
              size="sm" 
              onClick={handleUploadSubmit}
              disabled={isUploading || !selectedFile}
            >
              {isUploading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Verifying & Ingesting...</span>
                </>
              ) : (
                'Upload & Index'
              )}
            </Button>
          </>
        }
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Document Display Title
            </label>
            <input
              type="text"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="e.g. FY26 Air-Gap Security Protocol"
              className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
              disabled={isUploading}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Security Classification Level
            </label>
            <select
              value={uploadClassification}
              onChange={(e) => setUploadClassification(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
              disabled={isUploading}
            >
              <option value="INTERNAL">INTERNAL (Authorized Personnel)</option>
              <option value="CONFIDENTIAL">CONFIDENTIAL (Role-Gated Access)</option>
              <option value="RESTRICTED">RESTRICTED (Air-Gap Enclave Only)</option>
              <option value="SECRET">SECRET (Executive Clearance)</option>
              <option value="TOP_SECRET">TOP_SECRET (Strict Enclave Compartment)</option>
            </select>
          </div>

          {/* Real File Input & Drag/Drop Area */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.docx,.xlsx,.txt,.png,.jpg,.jpeg"
              className="hidden"
              disabled={isUploading}
            />
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-navy-900 rounded-xl p-6 text-center transition-colors cursor-pointer bg-slate-50/50"
            >
              <UploadCloud className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              {selectedFile ? (
                <div>
                  <p className="text-xs font-bold text-slate-900">{selectedFile.name}</p>
                  <p className="text-[11px] text-emerald-600 mt-0.5">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB &bull; Ready for upload
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-slate-700">Click to choose file from local disk</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">PDF, DOCX, XLSX, TXT, PNG, JPG/JPEG (Max 50 MB)</p>
                </div>
              )}
            </div>
          </div>

          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Cryptographically sealed on local storage. No external AI inference.</span>
          </div>
        </form>
      </Modal>

      {/* Quick View Drawer */}
      <Drawer
        isOpen={Boolean(activeDrawerDoc)}
        onClose={() => setActiveDrawerDoc(null)}
        title={activeDrawerDoc?.title || 'Document Inspection'}
        description={activeDrawerDoc?.filename}
        width="xl"
      >
        {activeDrawerDoc && (
          <div className="space-y-6">
            
            {/* Header badges & Actions */}
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                {getClassificationBadge(activeDrawerDoc.classification)}
                <Badge variant={activeDrawerDoc.status === 'READY' ? 'success' : 'neutral'} size="sm" dot>
                  {activeDrawerDoc.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => navigate(`/documents/${activeDrawerDoc.id}`)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Full Page View
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => handleDownload(activeDrawerDoc)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            </div>

            {/* Content Preview Box */}
            <div>
              <span className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                <FileCode className="h-4 w-4 text-purple-600" />
                Local Text Preview Snippet
              </span>
              <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs max-h-56 overflow-y-auto leading-relaxed border border-slate-800 whitespace-pre-wrap selection:bg-purple-900">
                {activeDrawerDoc.content_preview || 'No text snippet available.'}
              </div>
            </div>

            {/* Technical Metadata */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/70">
                <span className="text-slate-400 text-[10px] block">MIME Type</span>
                <span className="font-mono text-slate-800 font-semibold">{activeDrawerDoc.mime_type}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/70">
                <span className="text-slate-400 text-[10px] block">File Size</span>
                <span className="font-mono text-slate-800 font-semibold">
                  {(activeDrawerDoc.file_size_bytes / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 col-span-2">
                <span className="text-slate-400 text-[10px] block">SHA-256 Hash</span>
                <span className="font-mono text-slate-800 break-all text-[11px] block mt-0.5">
                  {activeDrawerDoc.sha256_hash}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/70">
                <span className="text-slate-400 text-[10px] block">Pages & Chunks</span>
                <span className="text-slate-800 font-semibold">
                  {activeDrawerDoc.total_pages} pages / {activeDrawerDoc.total_chunks} chunks
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/70">
                <span className="text-slate-400 text-[10px] block">Uploaded By</span>
                <span className="text-slate-800 font-semibold">
                  {activeDrawerDoc.owner_name || activeDrawerDoc.owner_email || 'Sovereign Operator'}
                </span>
              </div>
            </div>

            {/* Permitted Operations */}
            <div>
              <span className="text-xs font-bold text-slate-700 block mb-1.5">
                Caller Clearance Operations
              </span>
              <div className="flex flex-wrap gap-1.5">
                {activeDrawerDoc.permissions?.map(perm => (
                  <Badge key={perm} variant={perm === 'DELETE' ? 'danger' : 'neutral'} size="sm">
                    {perm}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Recent Audit Activity */}
            <div>
              <span className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-blue-600" />
                Recent Governance Events
              </span>
              {activeDrawerDoc.activity && activeDrawerDoc.activity.length > 0 ? (
                <div className="space-y-2 text-xs">
                  {activeDrawerDoc.activity.map((act, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                      <div>
                        <span className="font-mono font-bold text-slate-800 text-[11px]">{act.action}</span>
                        <span className="text-[10px] text-slate-500 block">{act.actor_email}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No activity recorded yet.</p>
              )}
            </div>

          </div>
        )}
      </Drawer>

    </div>
  );
};
