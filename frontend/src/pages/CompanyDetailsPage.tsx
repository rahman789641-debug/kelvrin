import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  getActiveCompany, 
  saveActiveCompany, 
  getTeamMembers, 
  getAccessRequests,
  CompanyProfile 
} from '../services/accessControl';
import { companyApi } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { 
  Building2, 
  Globe, 
  ExternalLink, 
  MoreVertical, 
  Edit3, 
  Trash2, 
  Copy, 
  Check, 
  ShieldCheck, 
  Users, 
  Clock, 
  AlertCircle, 
  Plus, 
  Sparkles,
  Link as LinkIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const CompanyDetailsPage: React.FC = () => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const [company, setCompany] = useState<CompanyProfile | null>(getActiveCompany());
  const [websiteInputValue, setWebsiteInputValue] = useState('');
  const [isEditingWebsite, setIsEditingWebsite] = useState(false);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [isWebsiteMenuOpen, setIsWebsiteMenuOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [teamMembersCount, setTeamMembersCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  const websiteMenuRef = useRef<HTMLDivElement>(null);

  // Sync active company from localStorage and events
  const loadCompanyData = () => {
    const active = getActiveCompany();
    setCompany(active);
    if (active?.website) {
      setWebsiteInputValue(active.website);
    }
    const compCode = active?.code?.toUpperCase() || user?.companyCode?.toUpperCase() || 'KELV-HQ';
    const members = getTeamMembers().filter(m => m.companyCode?.toUpperCase() === compCode);
    setTeamMembersCount(members.length);

    const requests = getAccessRequests().filter(r => r.companyCode?.toUpperCase() === compCode && r.status === 'pending_approval');
    setPendingRequestsCount(requests.length);
  };

  useEffect(() => {
    loadCompanyData();

    const handleUpdate = () => loadCompanyData();
    window.addEventListener('kelvrin_company_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('kelvrin_company_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [user]);

  // Click outside listener for 3-dots dropdown menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (websiteMenuRef.current && !websiteMenuRef.current.contains(event.target as Node)) {
        setIsWebsiteMenuOpen(false);
      }
    };
    if (isWebsiteMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isWebsiteMenuOpen]);

  // Universal URL normalizer & validator supporting all domains (.com, .in, vercel.app, github.io, etc.)
  const normalizeWebsiteUrl = (rawUrl: string): string | null => {
    let trimmed = rawUrl.trim();
    if (!trimmed) return null;

    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    }

    try {
      const parsed = new URL(trimmed);
      if (!parsed.hostname || !parsed.hostname.includes('.')) {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  };

  // Save Company Website
  const handleSaveWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    setWebsiteError(null);

    const normalized = normalizeWebsiteUrl(websiteInputValue);
    if (!normalized) {
      setWebsiteError('Please enter a valid website URL (e.g. company.com, project.vercel.app, org.in, user.github.io).');
      return;
    }

    try {
      const current = getActiveCompany() || {
        id: `comp_${Date.now()}`,
        name: user?.companyName || 'Sovereign Enterprise',
        code: user?.companyCode || 'KELV-HQ',
        createdAt: new Date().toISOString()
      };

      const updated: CompanyProfile = {
        ...current,
        website: normalized
      };

      saveActiveCompany(updated);
      setCompany(updated);
      setIsEditingWebsite(false);

      // Persist to backend if available
      try {
        await companyApi.create({
          name: updated.name,
          code: updated.code,
          website: normalized,
          logoDataUrl: updated.logoDataUrl
        });
      } catch {}

      window.dispatchEvent(new CustomEvent('kelvrin_company_updated'));
      success('Website Saved', 'Company website has been permanently bound to your sovereign enclave.');
    } catch (err: any) {
      setWebsiteError(err.message || 'Failed to save website URL.');
    }
  };

  // Delete Company Website
  const handleDeleteWebsite = async () => {
    try {
      const current = getActiveCompany();
      if (current) {
        const updated: CompanyProfile = {
          ...current,
          website: null
        };
        saveActiveCompany(updated);
        setCompany(updated);

        try {
          await companyApi.create({
            name: updated.name,
            code: updated.code,
            website: undefined,
            logoDataUrl: updated.logoDataUrl
          });
        } catch {}
      }

      setWebsiteInputValue('');
      setIsWebsiteMenuOpen(false);
      setIsEditingWebsite(false);
      window.dispatchEvent(new CustomEvent('kelvrin_company_updated'));
      success('Website Removed', 'Company website URL has been removed.');
    } catch {
      error('Delete Failed', 'Could not remove website URL.');
    }
  };

  // Copy Company Code
  const handleCopyCode = () => {
    const code = company?.code || user?.companyCode || 'KELV-HQ';
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    success('Company Code Copied', `Company code "${code}" copied to clipboard.`);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const compName = company?.name || user?.companyName || 'Sovereign Enterprise';
  const compCode = company?.code || user?.companyCode || 'KELV-HQ';
  const compCreated = company?.createdAt ? new Date(company.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Established September 2026';

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white flex items-center justify-center font-black text-xl shadow-xs shrink-0">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{compName}</h1>
              <Badge variant="success" size="md">
                <ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                Sovereign Enclave Active
              </Badge>
              <Badge variant="navy" size="md">
                Super Admin Console
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Enclave Organization Identity, Company Code Management & Universal Web Presence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/users')}
          >
            <Users className="h-4 w-4 mr-1.5" />
            Manage Users
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Organization Details & Code */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Organization Card */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-card p-5 space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-500" />
              Organization Profile
            </h2>

            <div className="space-y-3 pt-1">
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Company Name</span>
                <span className="text-sm font-bold text-slate-900">{compName}</span>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Enclave Company Code</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-lg bg-cyan-50 border border-cyan-300 font-mono font-bold text-sm text-cyan-900 tracking-wider">
                    {compCode}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-cyan-700 hover:bg-slate-50 transition-colors"
                    title="Copy Company Code"
                  >
                    {copiedCode ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Primary Enclave Administrator</span>
                <span className="text-xs font-semibold text-slate-800">{user?.fullName || 'Super Admin'} ({user?.email || 'admin'})</span>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Enclave Created</span>
                <span className="text-xs text-slate-600 font-mono flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3 text-slate-400" />
                  {compCreated}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Enclave Metrics Card */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-card p-5 space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-slate-500" />
              Enclave Operators
            </h2>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 text-center">
                <span className="text-xl font-bold text-slate-900 block">{teamMembersCount + 1}</span>
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Registered Members</span>
              </div>
              <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200/80 text-center">
                <span className="text-xl font-bold text-amber-900 block">{pendingRequestsCount}</span>
                <span className="text-[10px] font-medium text-amber-700 uppercase tracking-wide">Pending Requests</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
              When operators from other roles register using Company Code <strong className="font-mono text-cyan-800">{compCode}</strong>, their access requests and member records appear under User Management.
            </p>
          </div>
        </div>

        {/* Right Column: Company Website Section */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-card overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-600 shadow-xs">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight">Company Website & Web Presence</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Permanent web address bound to your company enclave identity
                  </p>
                </div>
              </div>

              {company?.website && !isEditingWebsite && (
                <Badge variant="sovereign" size="sm">
                  <Sparkles className="h-3 w-3 mr-1 text-cyan-400" />
                  Live Binding
                </Badge>
              )}
            </div>

            <div className="p-5">
              {/* STATE 1: No website added yet -> Show "Add your company website" with styled ADD button */}
              {!company?.website && !isEditingWebsite && (
                <div className="py-10 px-6 rounded-xl border-2 border-dashed border-slate-200/90 bg-gradient-to-b from-slate-50/70 to-white flex flex-col items-center justify-center text-center">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-cyan-500/15 to-blue-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-600 mb-3 shadow-xs">
                    <Globe className="h-7 w-7" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 tracking-tight">Add your company website</h3>
                  <p className="text-xs text-slate-500 max-w-md mt-1 mb-5 leading-relaxed">
                    Connect your official website, portfolio, Vercel deployment, or GitHub repository to {compName}.
                  </p>

                  {/* Styled ADD Button matching design */}
                  <button
                    onClick={() => {
                      setWebsiteInputValue('');
                      setWebsiteError(null);
                      setIsEditingWebsite(true);
                    }}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-cyan-700 bg-gradient-to-r from-cyan-500/15 via-blue-500/15 to-cyan-500/15 border-2 border-cyan-500/50 hover:border-cyan-500 hover:bg-cyan-500/25 shadow-sm transition-all duration-150 active:scale-98"
                  >
                    <Plus className="h-4 w-4 text-cyan-600" />
                    ADD
                  </button>
                </div>
              )}

              {/* STATE 2: Input mode (Editing or Adding) */}
              {isEditingWebsite && (
                <form onSubmit={handleSaveWebsite} className="p-5 rounded-xl border border-cyan-300 bg-gradient-to-b from-cyan-50/40 via-white to-white shadow-xs space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <LinkIcon className="h-3.5 w-3.5 text-cyan-600" />
                      {company?.website ? 'Edit Company Website URL' : 'Enter Company Website URL'}
                    </h3>
                  </div>

                  <div>
                    <div className="relative">
                      <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={websiteInputValue}
                        onChange={(e) => {
                          setWebsiteInputValue(e.target.value);
                          if (websiteError) setWebsiteError(null);
                        }}
                        placeholder="https://adamgroups.com, adam.vercel.app, adam.github.io, company.in..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 text-xs text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 shadow-xs font-mono"
                        autoFocus
                      />
                    </div>
                    {websiteError && (
                      <p className="text-[11px] text-rose-600 font-medium mt-1.5 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {websiteError}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-500 mt-2">
                      Supports all URL formats: <code className="text-cyan-800 bg-cyan-50 px-1 py-0.5 rounded">.com</code>, <code className="text-cyan-800 bg-cyan-50 px-1 py-0.5 rounded">.in</code>, <code className="text-cyan-800 bg-cyan-50 px-1 py-0.5 rounded">*.vercel.app</code>, <code className="text-cyan-800 bg-cyan-50 px-1 py-0.5 rounded">*.github.io</code>, etc.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsEditingWebsite(false);
                        setWebsiteError(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" size="sm">
                      Save Website
                    </Button>
                  </div>
                </form>
              )}

              {/* STATE 3: Website Stored & Active -> Displays URL, domain chip, and 3-dots menu */}
              {company?.website && !isEditingWebsite && (
                <div className="relative p-5 rounded-xl border border-slate-200/90 bg-gradient-to-r from-slate-50/90 via-white to-cyan-50/40 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div className="h-11 w-11 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-700 shadow-xs shrink-0">
                      <Globe className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Official Organization Web Presence</span>
                        <Badge variant="success" size="sm">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Permanent Storage
                        </Badge>
                      </div>
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm sm:text-base font-bold text-cyan-700 hover:text-cyan-900 hover:underline mt-1 break-all font-mono group"
                      >
                        {company.website}
                        <ExternalLink className="h-3.5 w-3.5 text-cyan-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </a>
                    </div>
                  </div>

                  {/* Corner 3-dots Menu Button */}
                  <div className="relative shrink-0 self-end sm:self-center" ref={websiteMenuRef}>
                    <button
                      onClick={() => setIsWebsiteMenuOpen(!isWebsiteMenuOpen)}
                      className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors border border-slate-200 shadow-xs"
                      title="Website Options"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                    {isWebsiteMenuOpen && (
                      <div className="absolute right-0 mt-1 w-36 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-30 animate-in fade-in">
                        <button
                          onClick={() => {
                            setWebsiteInputValue(company.website || '');
                            setIsWebsiteMenuOpen(false);
                            setIsEditingWebsite(true);
                          }}
                          className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-cyan-700 flex items-center gap-2 transition-colors"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit URL
                        </button>
                        <button
                          onClick={handleDeleteWebsite}
                          className="w-full px-3 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Enclave Connection Guide Card */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-card p-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-cyan-600" />
              How Operators Connect to {compName}
            </h3>
            <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
              <p>
                1. Provide operators with your Enclave Company Code: <strong className="font-mono text-cyan-800 bg-cyan-50 px-1.5 py-0.5 rounded border border-cyan-200">{compCode}</strong>.
              </p>
              <p>
                2. On the login screen, operators select their role (<span className="font-semibold text-slate-800">AI Operator, Employee, Analyst, Auditor, Approver</span>), enter <strong className="font-mono text-cyan-800">{compCode}</strong>, and authenticate.
              </p>
              <p>
                3. You will receive an immediate authorization request in <strong className="text-slate-800">User Management</strong> to approve their access.
              </p>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};

export default CompanyDetailsPage;
