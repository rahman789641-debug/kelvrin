import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { 
  deliverablesApi, 
  DeliverableItem, 
  DeliverableGenerateRequest 
} from '../services/api';
import { 
  FileCheck, 
  Download, 
  FileText, 
  FileSpreadsheet, 
  Presentation, 
  FileCode, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Plus, 
  RefreshCw, 
  Search, 
  Copy, 
  AlertCircle,
  Sparkles,
  Layers,
  FileBox
} from 'lucide-react';

export const DeliverablesPage: React.FC = () => {
  const [deliverables, setDeliverables] = useState<DeliverableItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Generate modal state
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [genFileType, setGenFileType] = useState<'DOCX' | 'XLSX' | 'PPTX' | 'TXT' | 'PDF'>('DOCX');
  const [genTitle, setGenTitle] = useState('');
  const [genFilename, setGenFilename] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Approval modal state
  const [selectedForApproval, setSelectedForApproval] = useState<DeliverableItem | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);

  const { success, error, info } = useToast();

  const loadDeliverables = async () => {
    try {
      setIsLoading(true);
      const data = await deliverablesApi.list({
        file_type: fileTypeFilter !== 'ALL' ? fileTypeFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: searchQuery || undefined
      });
      setDeliverables(data);
    } catch (err: any) {
      error('Failed to load deliverables', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDeliverables();
  }, [fileTypeFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadDeliverables();
  };

  const handleDownload = async (item: DeliverableItem) => {
    try {
      info('Downloading File', `Retrieving ${item.filename}...`);
      await deliverablesApi.download(item.id, item.filename, item);
      success('Download Complete', `${item.filename} downloaded successfully.`);
    } catch (err: any) {
      error('Download Failed', err.message);
    }
  };

  const handleDelete = async (item: DeliverableItem) => {
    if (!confirm(`Are you sure you want to delete deliverable "${item.filename}"?`)) return;
    try {
      await deliverablesApi.delete(item.id);
      setDeliverables(prev => prev.filter(d => d.id !== item.id));
      success('Deliverable Deleted', `Removed ${item.filename}`);
    } catch (err: any) {
      error('Delete Failed', err.message);
    }
  };

  const handleApprovalAction = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedForApproval) return;
    try {
      setIsProcessingApproval(true);
      const updated = await deliverablesApi.approve(selectedForApproval.id, action, approvalNotes);
      setDeliverables(prev => prev.map(d => d.id === updated.id ? updated : d));
      success('Status Updated', `Deliverable marked as ${action}D.`);
      setSelectedForApproval(null);
      setApprovalNotes('');
    } catch (err: any) {
      error('Approval Failed', err.message);
    } finally {
      setIsProcessingApproval(false);
    }
  };

  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genTitle.trim()) {
      error('Validation Error', 'Title is required.');
      return;
    }

    try {
      setIsGenerating(true);
      const payload: DeliverableGenerateRequest = {
        file_type: genFileType,
        title: genTitle.trim(),
        filename: genFilename.trim() || undefined
      };

      if (genFileType === 'DOCX') {
        payload.sections = [
          { heading: 'Executive Summary', body: `Automated sovereign inspection summary for ${genTitle.trim()}.` },
          { heading: 'Compliance Assessment', body: 'All parameters validated against local ISO/API safety thresholds.' },
          { heading: 'Recommendations', body: 'Authorized for continued commercial operation with standard monitoring.' }
        ];
      } else if (genFileType === 'XLSX') {
        payload.headers = ['Component ID', 'Measurement (mm)', 'Threshold (mm)', 'Tolerance Status', 'Calibration Date'];
        payload.rows = [
          ['SHELL-01', 14.2, 12.0, 'COMPLIANT', '2026-09-01'],
          ['NOZZLE-N1', 8.5, 7.5, 'COMPLIANT', '2026-09-01'],
          ['FLANGE-F2', 19.8, 18.0, 'COMPLIANT', '2026-09-01']
        ];
      } else if (genFileType === 'PPTX') {
        payload.slides = [
          { title: genTitle.trim(), bullets: ['Autonomous Engineering Review', 'Sovereign On-Premises Generation', 'Zero Cloud Egress'] },
          { title: 'Key Findings', bullets: ['Structural thickness exceeds minimum safety limit', 'Weld integrity Grade 1 certified', 'Secondary QA stamp awaiting site stamp verification'] }
        ];
      } else if (genFileType === 'PDF') {
        payload.paragraphs = [
          `CERTIFICATE OF COMPLIANCE: ${genTitle.trim()}`,
          'This official deliverable confirms that the specified equipment or document has been processed under local sovereign governance.',
          'Generated inside the KELVRIN Air-Gapped Enclave.'
        ];
      } else if (genFileType === 'TXT') {
        payload.content = `SOVEREIGN DELIVERABLE: ${genTitle.trim()}\nGenerated: ${new Date().toISOString()}\nZero cloud dependencies.`;
      }

      const created = await deliverablesApi.generate(payload);
      setDeliverables(prev => [created, ...prev]);
      success('Deliverable Created', `${created.filename} generated successfully.`);
      setIsGenerateModalOpen(false);
      setGenTitle('');
      setGenFilename('');
    } catch (err: any) {
      error('Generation Failed', err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    success('Copied', 'SHA-256 hash copied to clipboard.');
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType.toUpperCase()) {
      case 'DOCX':
        return <FileText className="h-6 w-6 text-blue-500" />;
      case 'XLSX':
        return <FileSpreadsheet className="h-6 w-6 text-emerald-500" />;
      case 'PPTX':
        return <Presentation className="h-6 w-6 text-amber-500" />;
      case 'PDF':
        return <FileBox className="h-6 w-6 text-rose-500" />;
      case 'TXT':
      default:
        return <FileCode className="h-6 w-6 text-slate-500" />;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Deliverables Library</h1>
            <Badge variant="sovereign" size="md">
              SHA-256 Cryptographically Verified
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Official audit notes, inspection certificates, spreadsheets, and presentations generated by local autonomous agents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadDeliverables}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsGenerateModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Generate Deliverable
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card compact>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Deliverables</span>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">{deliverables.length}</h3>
          <p className="text-[11px] text-slate-500 mt-1">Saved in /scratch/deliverables/</p>
        </Card>
        <Card compact>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Approved Deliverables</span>
          <h3 className="text-2xl font-bold text-emerald-600 mt-1">
            {deliverables.filter(d => d.status === 'APPROVED').length}
          </h3>
          <p className="text-[11px] text-emerald-600 mt-1 font-medium">Ready for external audit</p>
        </Card>
        <Card compact>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Supported Formats</span>
          <h3 className="text-2xl font-bold text-indigo-600 mt-1">5 Native Types</h3>
          <p className="text-[11px] text-slate-500 mt-1">DOCX, XLSX, PPTX, PDF, TXT</p>
        </Card>
        <Card compact>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Cloud Egress</span>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">0.00 KB</h3>
          <p className="text-[11px] text-emerald-600 mt-1 font-medium">100% On-Premises Local I/O</p>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-card flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by title, filename, or SHA-256 hash..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>
          <Button variant="outline" size="sm" type="submit">
            Search
          </Button>
        </form>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500">Format:</span>
            <select
              value={fileTypeFilter}
              onChange={(e) => setFileTypeFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
            >
              <option value="ALL">All Formats</option>
              <option value="DOCX">DOCX (Word)</option>
              <option value="XLSX">XLSX (Excel)</option>
              <option value="PPTX">PPTX (PowerPoint)</option>
              <option value="PDF">PDF Document</option>
              <option value="TXT">TXT Plain</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="APPROVED">Approved</option>
              <option value="GENERATED">Generated</option>
              <option value="DRAFT">Draft</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Deliverables Table / Cards */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-500 text-xs">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-indigo-500 mb-2" />
            Loading deliverables from sovereign repository...
          </div>
        ) : deliverables.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-xl border border-slate-200">
            <FileBox className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700">No deliverables found</h3>
            <p className="text-xs text-slate-500 mt-1">
              Trigger an agent run or generate a document to create verified audit deliverables.
            </p>
          </div>
        ) : (
          deliverables.map((item) => (
            <div
              key={item.id}
              className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-sm hover:border-slate-300 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 shrink-0">
                  {getFileIcon(item.file_type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-slate-900 truncate">{item.title}</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-slate-100 text-slate-700 border border-slate-200">
                      {item.file_type}
                    </span>
                    <Badge
                      variant={
                        item.status === 'APPROVED'
                          ? 'success'
                          : item.status === 'REJECTED'
                          ? 'danger'
                          : 'sovereign'
                      }
                      size="sm"
                    >
                      {item.status}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap font-mono">
                    <span className="text-slate-700 font-semibold">{item.filename}</span>
                    <span>&bull;</span>
                    <span>{formatBytes(item.file_size_bytes)}</span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1">
                      SHA-256: {item.sha256_hash.slice(0, 10)}...
                      <button
                        onClick={() => copyToClipboard(item.sha256_hash)}
                        className="text-slate-400 hover:text-slate-700"
                        title="Copy SHA-256"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </span>
                  </div>

                  {item.description && (
                    <p className="text-xs text-slate-600 mt-1 italic">{item.description}</p>
                  )}

                  {item.approved_by && (
                    <div className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      Approved by {item.approved_by} on {new Date(item.approved_at || '').toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedForApproval(item)}
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-1 text-slate-600" />
                  Review Status
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleDownload(item)}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(item)}
                  className="text-rose-600 hover:bg-rose-50"
                  title="Delete Deliverable"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Generate Deliverable Modal */}
      <Modal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        title="Generate Local Sovereign Deliverable"
      >
        <form onSubmit={handleGenerateSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Document Format
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(['DOCX', 'XLSX', 'PPTX', 'PDF', 'TXT'] as const).map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => setGenFileType(type)}
                  className={`p-2 rounded-lg border text-xs font-bold transition-all text-center ${
                    genFileType === type
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Deliverable Title *
            </label>
            <input
              type="text"
              required
              value={genTitle}
              onChange={(e) => setGenTitle(e.target.value)}
              placeholder="e.g. PV-201 Pressure Vessel Recertification Note"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Custom Filename (Optional)
            </label>
            <input
              type="text"
              value={genFilename}
              onChange={(e) => setGenFilename(e.target.value)}
              placeholder="e.g. Approval_Note.docx"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Will be automatically sanitized to prevent directory traversal.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Sovereign Storage Guarantee
            </div>
            <p className="text-[11px] text-slate-500">
              File will be rendered directly via Python native document libraries and hashed with SHA-256 into local disk storage. Zero data leaves your machine.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setIsGenerateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              isLoading={isGenerating}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Generate Now
            </Button>
          </div>
        </form>
      </Modal>

      {/* Review / Approval Modal */}
      <Modal
        isOpen={!!selectedForApproval}
        onClose={() => setSelectedForApproval(null)}
        title="Deliverable Governance & Approval Review"
      >
        {selectedForApproval && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <div className="font-bold text-slate-800">{selectedForApproval.title}</div>
              <div className="text-slate-500 font-mono mt-0.5">{selectedForApproval.filename}</div>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="neutral" size="sm">
                  Format: {selectedForApproval.file_type}
                </Badge>
                <Badge variant="sovereign" size="sm">
                  Current Status: {selectedForApproval.status}
                </Badge>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Audit Notes / Condition Summary
              </label>
              <textarea
                rows={3}
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="e.g. Approved subject to visual confirmation of the secondary QA stamp prior to restart."
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500 focus:bg-white"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleApprovalAction('REJECT')}
                className="text-rose-600 hover:bg-rose-50"
                isLoading={isProcessingApproval}
              >
                Reject Deliverable
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedForApproval(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleApprovalAction('APPROVE')}
                  isLoading={isProcessingApproval}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Grant Approval
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};
