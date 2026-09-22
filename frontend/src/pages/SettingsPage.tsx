import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import { 
  Settings, 
  ShieldCheck, 
  Lock, 
  Server, 
  Database, 
  HardDrive, 
  Save, 
  CheckCircle2, 
  AlertTriangle,
  Building2,
  Upload,
  Crop,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  MapPin,
  Globe,
  ExternalLink,
  MoreVertical,
  Edit2,
  Plus
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { 
  getActiveCompany, 
  saveActiveCompany, 
  purgeEntireOrganization, 
  CompanyProfile 
} from '../services/accessControl';
import { syncCompanyToCloud } from '../services/cloudSync';
import { companyApi } from '../services/api';
import { meshSync } from '../services/meshSync';
import { COUNTRIES, getStates, getDistricts } from '../services/locationData';
import { ImageCropModal } from '../components/auth/ImageCropModal';
import { useNavigate, Navigate } from 'react-router-dom';

export const SettingsPage: React.FC = () => {
  const { user, sovereignMode, setSovereignMode, logout } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const normRole = user?.role ? user.role.toUpperCase().replace(/[\s-]/g, '_') : '';
  if (normRole !== 'SUPER_ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  // Company Profile States
  const [company, setCompany] = useState<CompanyProfile>(getActiveCompany());
  const [compName, setCompName] = useState(company?.name || 'Kelvrin Sovereign Enclave');
  const [compCode] = useState(company?.code || 'KELV-HQ');
  const [compCountry, setCompCountry] = useState(company?.country || 'IN');
  const [compState, setCompState] = useState(company?.state || 'TN');
  const [compDistrict, setCompDistrict] = useState(company?.district || 'Chennai');
  const [compLogo, setCompLogo] = useState<string | null>(company?.logoDataUrl || null);
  const [compWebsite, setCompWebsite] = useState<string | null>(company?.website || null);

  // Company Website edit & menu states
  const [isEditingWebsite, setIsEditingWebsite] = useState(false);
  const [websiteInputValue, setWebsiteInputValue] = useState('');
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [isWebsiteMenuOpen, setIsWebsiteMenuOpen] = useState(false);
  const websiteMenuRef = useRef<HTMLDivElement>(null);

  // Logo cropping modal states
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [rawImageForCrop, setRawImageForCrop] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCopiedCode, setIsCopiedCode] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // System Parameter States
  const [inferenceUrl, setInferenceUrl] = useState('http://127.0.0.1:8000/v1');
  const [storageDir, setStorageDir] = useState('/var/lib/kelvrin/documents');
  const [vectorDim, setVectorDim] = useState('1024');
  const [maxUploadMb, setMaxUploadMb] = useState('50');

  // Danger Zone / Factory Reset States
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);

  // Click outside for 3-dots website menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (websiteMenuRef.current && !websiteMenuRef.current.contains(e.target as Node)) {
        setIsWebsiteMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync state if company changes elsewhere
  useEffect(() => {
    const handleUpdate = () => {
      const fresh = getActiveCompany();
      setCompany(fresh);
      setCompName(fresh?.name || 'Kelvrin Sovereign Enclave');
      setCompCountry(fresh?.country || 'IN');
      setCompState(fresh?.state || 'TN');
      setCompDistrict(fresh?.district || 'Chennai');
      setCompLogo(fresh?.logoDataUrl || null);
      setCompWebsite(fresh?.website || null);
    };
    window.addEventListener('kelvrin_company_updated', handleUpdate);
    return () => window.removeEventListener('kelvrin_company_updated', handleUpdate);
  }, []);

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setCompCountry(val);
    const states = getStates(val);
    const firstState = states[0]?.code || '';
    setCompState(firstState);
    const districts = getDistricts(firstState);
    setCompDistrict(districts[0] || '');
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setCompState(val);
    const districts = getDistricts(val);
    setCompDistrict(districts[0] || '');
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setRawImageForCrop(url);
      setIsCropModalOpen(true);
    }
  };

  const handleApplyCrop = (croppedDataUrl: string) => {
    setCompLogo(croppedDataUrl);
    setIsCropModalOpen(false);
    setRawImageForCrop(null);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(compCode);
    setIsCopiedCode(true);
    setTimeout(() => setIsCopiedCode(false), 2000);
  };

  const normalizeWebsiteUrl = (urlStr: string): string => {
    let clean = urlStr.trim();
    if (!clean) return '';
    // Auto prepend https:// if no protocol is given
    if (!/^https?:\/\//i.test(clean)) {
      clean = 'https://' + clean;
    }
    return clean;
  };

  const handleSaveWebsite = () => {
    setWebsiteError(null);
    const raw = websiteInputValue.trim();
    if (!raw) {
      setWebsiteError('Please enter a website URL.');
      return;
    }

    const normalized = normalizeWebsiteUrl(raw);
    try {
      new URL(normalized);
    } catch {
      setWebsiteError('Please enter a valid website address (e.g., acme.com, vercel.app, github.io, or .in).');
      return;
    }

    setCompWebsite(normalized);
    saveActiveCompany({ website: normalized });
    setIsEditingWebsite(false);
    setWebsiteInputValue('');
    setIsWebsiteMenuOpen(false);
    success('Website Saved', `Company website linked successfully: ${normalized}`);
  };

  const handleDeleteWebsite = () => {
    setCompWebsite(null);
    saveActiveCompany({ website: null });
    setIsWebsiteMenuOpen(false);
    setIsEditingWebsite(false);
    setWebsiteInputValue('');
    success('Website Removed', 'Company website has been deleted.');
  };

  const handleSaveCompanyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compName.trim()) {
      error('Validation Error', 'Organization Name cannot be empty.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const updated: CompanyProfile = {
        name: compName.trim(),
        code: compCode.trim().toUpperCase(),
        country: compCountry,
        state: compState,
        district: compDistrict,
        logoDataUrl: compLogo,
        website: compWebsite,
        updatedAt: new Date().toISOString()
      };

      saveActiveCompany(updated);
      await syncCompanyToCloud(updated).catch(err => console.warn(err));

      success('Organization Profile Saved', `${updated.name} branding & details updated across all dashboards.`);
    } catch (err: any) {
      error('Save Failed', err.message || 'Could not update organization profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveSystemSettings = (e: React.FormEvent) => {
    e.preventDefault();
    success('Settings Persisted', 'Sovereign configuration parameters saved to local registry.');
  };

  // Danger Zone: Execute Organization Purge & Factory Reset
  const handleExecutePurge = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (!resetPassword.trim()) {
      setResetError('Please enter your Super Admin password to confirm purge.');
      return;
    }

    setIsPurging(true);
    try {
      // 1. Purge via accessControl
      const result = purgeEntireOrganization(resetPassword.trim());
      if (!result.success) {
        setResetError(result.error || 'Password verification failed. Purge aborted.');
        setIsPurging(false);
        return;
      }

      // 2. Broadcast via Mesh
      try {
        meshSync.broadcast('COMPANY_REGISTERED', null);
      } catch {}

      // 3. Purge backend store
      try {
        await companyApi.purgeCompany(compCode).catch(() => {});
      } catch {}

      success('Organization Purged', 'All company data and accounts wiped. Redirecting to login...');
      setIsResetModalOpen(false);

      setTimeout(() => {
        logout();
        navigate('/login', { replace: true });
      }, 1000);
    } catch (err: any) {
      setResetError(err.message || 'Purge failed.');
      setIsPurging(false);
    }
  };

  const statesList = getStates(compCountry);
  const districtsList = getDistricts(compState);

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Super Admin Control Center</h1>
            <Badge variant="danger" size="md">
              Root Authority
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage organization branding, sovereignty modes, local inference gateways, and system integrity.
          </p>
        </div>
      </div>

      {/* 1. ORGANIZATION PROFILE & BRANDING MANAGEMENT (User Request) */}
      <Card className="border-cyan-200/80 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-50 border border-cyan-100 text-cyan-700">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Organization Profile & Global Branding</CardTitle>
              <CardDescription>
                Customize your company name and logo displayed across all operator workbenches and top navigation bars.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSaveCompanyProfile} className="space-y-5 text-xs">
            {/* Logo and Name row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-4 rounded-xl bg-slate-50/70 border border-slate-200/80">
              {/* Logo Preview */}
              <div className="relative group shrink-0">
                {compLogo ? (
                  <img
                    src={compLogo}
                    alt={compName}
                    className="h-20 w-20 rounded-xl object-contain border-2 border-slate-200 bg-white shadow-xs p-1"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 border-2 border-cyan-400/30 flex items-center justify-center text-white font-black text-2xl shadow-md">
                    {(compName || 'C').trim().charAt(0).toUpperCase() || 'C'}
                  </div>
                )}
              </div>

              {/* Logo Action Buttons */}
              <div className="space-y-2">
                <span className="block font-semibold text-slate-800 text-xs">Company Logo</span>
                <p className="text-[11px] text-slate-500 max-w-sm">
                  Upload your official company emblem. It will appear at the top-right of every dashboard and sidebar.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs"
                  >
                    <Upload className="h-3.5 w-3.5 mr-1" />
                    Upload New Logo
                  </Button>
                  {compLogo && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCompLogo(null)}
                      className="text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Remove
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                </div>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company / Organization Name *
                </label>
                <input
                  type="text"
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  placeholder="e.g., Acme Aerospace Corp"
                  className="w-full bg-white border border-slate-300 rounded-lg py-2 px-3 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Registered Company Code (Primary Sovereign ID)
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 border border-slate-200 rounded-lg py-2 px-3 font-mono font-bold text-slate-800 tracking-wider">
                    {compCode}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCode}
                    className="shrink-0"
                    title="Copy Company Code"
                  >
                    {isCopiedCode ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-slate-600" />}
                  </Button>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Give this code to your operators (Admin, AI Operator, Employee, Auditor) to log in.
                </span>
              </div>
            </div>

            {/* Geographic Location Cascades */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Country
                </label>
                <select
                  value={compCountry}
                  onChange={handleCountryChange}
                  className="w-full bg-white border border-slate-300 rounded-lg py-2 px-3 text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  State / Province
                </label>
                <select
                  value={compState}
                  onChange={handleStateChange}
                  className="w-full bg-white border border-slate-300 rounded-lg py-2 px-3 text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {statesList.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  District / City
                </label>
                <select
                  value={compDistrict}
                  onChange={(e) => setCompDistrict(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg py-2 px-3 text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {districtsList.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" variant="primary" size="md" disabled={isSavingProfile} className="bg-cyan-600 hover:bg-cyan-700 text-white">
                <Save className="h-4 w-4 mr-1.5" />
                {isSavingProfile ? 'Saving Changes...' : 'Save Organization Profile'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 2. COMPANY WEBSITE & WEB PRESENCE SECTION (Super Admin Request) */}
      <Card className="border-cyan-200/90 shadow-sm overflow-visible">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-50 border border-cyan-100 text-cyan-700">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Company Details & Web Presence</CardTitle>
                <CardDescription>
                  Official digital website and deployment portal for {compName} ({compCode})
                </CardDescription>
              </div>
            </div>
            {compWebsite && !isEditingWebsite && (
              <Badge variant="success" size="sm" className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Website
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {!compWebsite && !isEditingWebsite ? (
            /* State 1: No website added yet */
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-xl bg-gradient-to-r from-slate-50 via-cyan-50/20 to-slate-50 border-2 border-dashed border-cyan-200">
              <div className="flex items-center gap-3.5 text-left">
                <div className="h-10 w-10 rounded-xl bg-cyan-100/70 border border-cyan-300/60 flex items-center justify-center text-cyan-800 shrink-0">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 tracking-tight">
                    Add your company website
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Link your official corporate domain, Vercel app, GitHub page, or any web portal (.com, .in, .app, etc.).
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setWebsiteInputValue('');
                  setWebsiteError(null);
                  setIsEditingWebsite(true);
                }}
                className="shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-md shadow-cyan-600/25 border border-cyan-300/40 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
                <span>ADD</span>
              </button>
            </div>
          ) : isEditingWebsite ? (
            /* State 2: Input mode (adding or editing) */
            <div className="p-4 rounded-xl bg-slate-50 border border-cyan-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800">
                  Enter Company Website URL
                </label>
                <span className="text-[10px] text-slate-400">Supports all formats: vercel, github, .com, .in, etc.</span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={websiteInputValue}
                    onChange={(e) => {
                      setWebsiteInputValue(e.target.value);
                      if (websiteError) setWebsiteError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveWebsite();
                      }
                    }}
                    placeholder="e.g. acme.com, myapp.vercel.app, company.in, or org.github.io"
                    className="w-full bg-white border border-slate-300 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    autoFocus
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleSaveWebsite}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold px-3 py-2"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Save URL
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditingWebsite(false);
                      setWebsiteError(null);
                    }}
                    className="text-xs px-3 py-2"
                  >
                    Cancel
                  </Button>
                </div>
              </div>

              {websiteError && (
                <p className="text-[11px] text-rose-600 font-medium">
                  {websiteError}
                </p>
              )}
            </div>
          ) : (
            /* State 3: Website is stored and active with 3-dots corner menu */
            <div className="p-4 rounded-xl bg-gradient-to-r from-slate-50 via-cyan-50/10 to-blue-50/20 border border-cyan-200/90 flex items-center justify-between gap-4 relative">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-cyan-600/20">
                  <Globe className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-cyan-800 uppercase tracking-wider">
                      Official Company Website
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <a
                    href={compWebsite || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-slate-900 hover:text-cyan-700 flex items-center gap-1.5 truncate transition-colors underline decoration-cyan-400/50 underline-offset-2 mt-0.5"
                    title={`Visit ${compWebsite}`}
                  >
                    <span className="truncate">{compWebsite}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
                  </a>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Permanently stored in {compName} sovereign profile.
                  </span>
                </div>
              </div>

              {/* Top-Right 3-Dots Menu */}
              <div className="relative shrink-0" ref={websiteMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsWebsiteMenuOpen(!isWebsiteMenuOpen)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white border border-slate-200/80 shadow-2xs transition-colors"
                  title="Website Options"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {isWebsiteMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30 animate-in fade-in duration-100">
                    <button
                      type="button"
                      onClick={() => {
                        setIsWebsiteMenuOpen(false);
                        setWebsiteInputValue(compWebsite || '');
                        setIsEditingWebsite(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-medium text-left transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-cyan-600 shrink-0" />
                      <span>Edit URL</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteWebsite}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 font-medium text-left transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. MODE SELECTOR CARD */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sovereignty & Identity Architecture</CardTitle>
            <CardDescription>
              Explicit distinction between Hybrid Sovereign and True Disconnected Air-Gap
            </CardDescription>
          </div>
          <Badge variant={sovereignMode === 'AIR_GAP_LOCAL' ? 'sovereign' : 'info'} size="sm">
            {sovereignMode === 'AIR_GAP_LOCAL' ? 'Air-Gapped' : 'Hybrid (Google IdP)'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              onClick={() => setSovereignMode('HYBRID_GOOGLE')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                sovereignMode === 'HYBRID_GOOGLE'
                  ? 'border-blue-600 bg-blue-50/20 ring-2 ring-blue-500/10'
                  : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <strong className="text-xs font-bold text-slate-900">Hybrid Sovereign Mode</strong>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Google/Firebase utilized strictly for external identity token verification. 100% of documents, RAG, and AI inference remain on-premises.
              </p>
            </div>

            <div
              onClick={() => setSovereignMode('AIR_GAP_LOCAL')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                sovereignMode === 'AIR_GAP_LOCAL'
                  ? 'border-emerald-600 bg-emerald-50/20 ring-2 ring-emerald-500/10'
                  : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Lock className="h-4 w-4 text-emerald-600" />
                <strong className="text-xs font-bold text-slate-900">True Air-Gapped Mode</strong>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Zero external internet connection required. Google services disabled. Operates using local cryptographic passwords and offline models.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. LOCAL INFERENCE GATEWAYS & SYSTEM PARAMETERS */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Local AI Inference Gateway</CardTitle>
            <CardDescription>OpenAI-compatible local server endpoints (vLLM, Ollama, Triton)</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveSystemSettings} className="space-y-4 text-xs">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Inference Server Base URL (REST API)
              </label>
              <input
                type="text"
                value={inferenceUrl}
                onChange={(e) => setInferenceUrl(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 px-3 font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Default: http://127.0.0.1:8000/v1 (vLLM) or http://127.0.0.1:11434/v1 (Ollama)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vector Embedding Dimensions
                </label>
                <input
                  type="text"
                  value={vectorDim}
                  onChange={(e) => setVectorDim(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 px-3 font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">1024 for BGE-M3</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Max Document Upload (MB)
                </label>
                <input
                  type="text"
                  value={maxUploadMb}
                  onChange={(e) => setMaxUploadMb(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 px-3 font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Enforced by ASGI gateway</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Encrypted Document Volume Path
              </label>
              <input
                type="text"
                value={storageDir}
                onChange={(e) => setStorageDir(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 px-3 font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Local host volume or mounted encrypted block device
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" variant="primary" size="md">
                <Save className="h-4 w-4 mr-1.5" />
                Save System Parameters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 4. DANGER ZONE: FACTORY RESET & ORGANIZATION PURGE (User Request) */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-red-500/80 bg-gradient-to-br from-red-50 via-white to-red-50/30 p-6 shadow-md">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-red-600 text-white shadow-md shadow-red-500/20 shrink-0 mt-0.5">
            <AlertTriangle className="h-6 w-6" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-red-950 tracking-tight">
                ⚠️ Danger Zone: Organization Purge & Factory Reset
              </h2>
              <Badge variant="danger" size="sm">
                Permanent Action
              </Badge>
            </div>

            <div className="mt-2 space-y-2 text-xs text-red-900 leading-relaxed">
              <p className="font-semibold">
                Permanent, irreversible action. A to Z all data will be permanently wiped out:
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-red-800/90 pl-1 font-medium">
                <li>Company profile and registered Company Code ({compCode}) will be completely erased.</li>
                <li>All Super Admin credentials, passwords, and security recovery answers will be deleted.</li>
                <li>All team member accounts, role assignments, and active operator sessions will be terminated.</li>
                <li>All pending and approved access requests will be permanently purged.</li>
                <li>All indexed documents, deliverable artifacts, and local audit logs will be destroyed.</li>
              </ul>
              <p className="text-[11px] font-bold text-red-950 bg-red-100/80 p-2.5 rounded-lg border border-red-200">
                WARNING: Clicking this button will permanently delete all organization data from A to Z, including all accounts, credentials, and settings. This action is irreversible and cannot be recovered!
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-red-200/80 flex items-center justify-between flex-wrap gap-4">
              <span className="text-[11px] text-slate-500">
                Requires Super Admin Master Password verification.
              </span>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => {
                  setResetPassword('');
                  setResetError(null);
                  setIsResetModalOpen(true);
                }}
                className="bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/20 font-bold text-xs"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Reset & Wipe Organization Data
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Image Crop Modal */}
      {isCropModalOpen && rawImageForCrop && (
        <ImageCropModal
          isOpen={isCropModalOpen}
          imageSrc={rawImageForCrop}
          onClose={() => {
            setIsCropModalOpen(false);
            setRawImageForCrop(null);
          }}
          onCropComplete={handleApplyCrop}
        />
      )}

      {/* Confirmation Reset Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-red-200 overflow-hidden">
            {/* Modal Header */}
            <div className="bg-red-600 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-5 w-5 text-white" />
                <h3 className="text-sm font-bold tracking-tight">Confirm Organization Purge</h3>
              </div>
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="text-red-200 hover:text-white text-lg font-bold"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleExecutePurge} className="p-6 space-y-4">
              <p className="text-xs text-slate-700 leading-relaxed">
                You are about to permanently wipe <strong className="text-slate-900 font-bold">{compName}</strong> ({compCode}).
                To confirm this root destructive action, please enter your <strong className="text-red-700 font-bold">Super Admin Password</strong>:
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Super Admin Password *
                </label>
                <div className="relative">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="Enter your Super Admin password"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2.5 pl-3 pr-10 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
                  >
                    {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {resetError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {resetError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsResetModalOpen(false)}
                  disabled={isPurging}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isPurging}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-600/20"
                >
                  {isPurging ? 'Purging Everything...' : 'Verify Password & Purge All Data'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
