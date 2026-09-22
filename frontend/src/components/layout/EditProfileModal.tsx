import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { COUNTRIES, getStates, getDistricts } from '../../services/locationData';
import { ImageCropModal } from '../auth/ImageCropModal';
import { 
  X, 
  Building2, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  ShieldCheck, 
  KeyRound, 
  Camera, 
  Check, 
  AlertCircle 
} from 'lucide-react';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, updateUserProfile } = useAuth();

  // Company profile state
  const [companyName, setCompanyName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [country, setCountry] = useState('IN');
  const [stateCode, setStateCode] = useState('TN');
  const [district, setDistrict] = useState('Chennai');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  // Super Admin personal state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('Favorite Food');
  const [securityAnswer, setSecurityAnswer] = useState('');

  // Image crop modal state
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);

  // UI state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load existing profile details on open
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    // 1. Company details
    try {
      const storedComp = localStorage.getItem('kelvrin_company');
      if (storedComp) {
        const c = JSON.parse(storedComp);
        setCompanyName(c.name || '');
        setCompanyCode(c.code || '');
        setCountry(c.country || 'IN');
        setStateCode(c.state || 'TN');
        setDistrict(c.district || 'Chennai');
        setLogoDataUrl(c.logoDataUrl || null);
      }
    } catch (e) {
      console.error('Failed to load company details', e);
    }

    // 2. Admin details
    try {
      const storedAdmin = localStorage.getItem('kelvrin_registered_admin');
      if (storedAdmin) {
        const a = JSON.parse(storedAdmin);
        setFirstName(a.firstName || '');
        setLastName(a.lastName || '');
        setEmail(a.email || user?.email || '');
        setPhoneNumber(a.phone || '');
        setSecurityQuestion(a.securityQuestion || 'Favorite Food');
        setSecurityAnswer(a.securityAnswer || '');
      } else if (user) {
        const parts = (user.fullName || '').split(' ');
        setFirstName(parts[0] || '');
        setLastName(parts.slice(1).join(' ') || '');
        setEmail(user.email || '');
      }
    } catch (e) {
      console.error('Failed to load admin details', e);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  // Handle Logo file select
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(reader.result as string);
      setCropModalOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleApplyCrop = (croppedDataUrl: string) => {
    setLogoDataUrl(croppedDataUrl);
    setCropModalOpen(false);
    setRawImageSrc(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!firstName.trim()) {
      setErrorMsg('First Name cannot be empty.');
      return;
    }
    if (!phoneNumber.trim() || phoneNumber.trim().length < 8) {
      setErrorMsg('Please provide a valid Phone Number (minimum 8 digits).');
      return;
    }
    if (!companyName.trim()) {
      setErrorMsg('Company Name cannot be empty.');
      return;
    }

    setIsSaving(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      // 1. Update Company Profile
      const updatedCompany = {
        name: companyName.trim(),
        code: companyCode.trim().toUpperCase(),
        country,
        state: stateCode,
        district,
        logoDataUrl,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem('kelvrin_company', JSON.stringify(updatedCompany));

      // Update companies list
      try {
        const companiesRaw = localStorage.getItem('kelvrin_companies');
        if (companiesRaw) {
          const companies = JSON.parse(companiesRaw);
          const updatedList = companies.map((c: any) =>
            c.code?.toUpperCase() === companyCode.toUpperCase() ? { ...c, ...updatedCompany } : c
          );
          localStorage.setItem('kelvrin_companies', JSON.stringify(updatedList));
        }
      } catch {}

      // 2. Update Registered Admin
      const updatedAdmin = {
        username: email.split('@')[0],
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        fullName,
        email: email.trim().toLowerCase(),
        phone: phoneNumber.trim(),
        securityQuestion,
        securityAnswer: securityAnswer.trim(),
        role: 'Super Admin',
        companyCode: companyCode.trim().toUpperCase(),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem('kelvrin_registered_admin', JSON.stringify(updatedAdmin));

      // Update in admins list
      try {
        const adminsRaw = localStorage.getItem('kelvrin_registered_admins');
        if (adminsRaw) {
          const admins = JSON.parse(adminsRaw);
          const updatedAdmins = admins.map((a: any) =>
            a.email?.toLowerCase() === email.toLowerCase() ? { ...a, ...updatedAdmin } : a
          );
          localStorage.setItem('kelvrin_registered_admins', JSON.stringify(updatedAdmins));
        }
      } catch {}

      // 3. Update active Auth Context profile in memory and localStorage
      updateUserProfile({
        fullName,
        email: email.trim().toLowerCase(),
      });

      setSuccessMsg('Profile and organization details updated successfully!');
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 900);
    } catch (err: any) {
      setErrorMsg('Failed to update profile: ' + err.message);
      setIsSaving(false);
    }
  };

  const availableStates = getStates(country);
  const availableDistricts = getDistricts(stateCode);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
        <div 
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#040f28] border-2 border-[#00d2ff]/60 shadow-[0_0_50px_rgba(0,210,255,0.25)] text-white p-6 sm:p-8 relative"
          style={{
            backgroundImage: 'radial-gradient(ellipse at top right, rgba(0, 210, 255, 0.1), transparent 70%)'
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 pb-5 border-b border-[#00d2ff]/20">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">Edit Super Admin Profile</h2>
              <p className="text-xs text-sky-300/80">Manage your sovereign enclave organization profile and credentials</p>
            </div>
          </div>

          {/* Feedback alerts */}
          {errorMsg && (
            <div className="mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            {/* SECTION 1: Company Profile */}
            <div className="rounded-2xl bg-[#06163b]/70 border border-[#00d2ff]/30 p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[#00d2ff]" />
                  Organization Details
                </span>
                <span className="text-[11px] font-mono text-sky-400/80 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800">
                  {companyCode || 'KELV-CODE'}
                </span>
              </div>

              {/* Logo Preview & Change */}
              <div className="flex items-center gap-4 pt-1">
                <div className="h-14 w-14 rounded-full border-2 border-[#00d2ff] bg-[#071d47] flex items-center justify-center overflow-hidden shrink-0 shadow-[0_0_12px_rgba(0,210,255,0.4)]">
                  {logoDataUrl ? (
                    <img src={logoDataUrl} alt="Company Logo" className="h-full w-full object-cover" />
                  ) : (
                    <Building2 className="h-6 w-6 text-sky-400" />
                  )}
                </div>
                <div>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/35 border border-cyan-400/40 text-cyan-200 text-xs font-medium cursor-pointer transition-colors">
                    <Camera className="h-3.5 w-3.5" />
                    <span>Change / Crop Logo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoFileChange}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[10px] text-slate-400 mt-1">Circular badge preview with live zoom & pan</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-[#071d47] border border-[#00d2ff]/40 text-white text-xs focus:border-[#00d2ff] outline-none"
                    placeholder="e.g. Acme Sovereign Defense"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Company Code
                  </label>
                  <input
                    type="text"
                    value={companyCode}
                    readOnly
                    className="w-full h-10 px-3 rounded-lg bg-[#071d47]/50 border border-slate-700 text-slate-300 text-xs cursor-not-allowed font-mono"
                    title="Company Code is registered and locked"
                  />
                </div>
              </div>

              {/* Cascading Location Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-cyan-400" />
                    <span>Country</span>
                  </label>
                  <select
                    value={country}
                    onChange={(e) => {
                      const newCountry = e.target.value;
                      setCountry(newCountry);
                      const st = getStates(newCountry);
                      setStateCode(st[0]?.code || '');
                      const dt = getDistricts(st[0]?.code || '');
                      setDistrict(dt[0] || '');
                    }}
                    className="w-full h-10 px-2 rounded-lg bg-[#071d47] border border-[#00d2ff]/40 text-white text-xs focus:border-[#00d2ff] outline-none"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code} className="bg-[#071d47] text-white">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    State / Region
                  </label>
                  <select
                    value={stateCode}
                    onChange={(e) => {
                      const newState = e.target.value;
                      setStateCode(newState);
                      const dt = getDistricts(newState);
                      setDistrict(dt[0] || '');
                    }}
                    className="w-full h-10 px-2 rounded-lg bg-[#071d47] border border-[#00d2ff]/40 text-white text-xs focus:border-[#00d2ff] outline-none"
                  >
                    {availableStates.map((s) => (
                      <option key={s.code} value={s.code} className="bg-[#071d47] text-white">
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    District ({availableDistricts.length})
                  </label>
                  <select
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full h-10 px-2 rounded-lg bg-[#071d47] border border-[#00d2ff]/40 text-white text-xs focus:border-[#00d2ff] outline-none"
                  >
                    {availableDistricts.map((d) => (
                      <option key={d} value={d} className="bg-[#071d47] text-white">
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 2: Super Admin Personal Info */}
            <div className="rounded-2xl bg-[#06163b]/70 border border-[#00d2ff]/30 p-4 sm:p-5 space-y-4">
              <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                <User className="h-4 w-4 text-[#00d2ff]" />
                Super Admin Details (No Password Change)
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-[#071d47] border border-[#00d2ff]/40 text-white text-xs focus:border-[#00d2ff] outline-none"
                    placeholder="e.g. Rahman"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-[#071d47] border border-[#00d2ff]/40 text-white text-xs focus:border-[#00d2ff] outline-none"
                    placeholder="e.g. S"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                    <Mail className="h-3 w-3 text-cyan-400" />
                    <span>Email Address</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="w-full h-10 px-3 rounded-lg bg-[#071d47]/50 border border-slate-700 text-slate-300 text-xs cursor-not-allowed font-mono"
                    title="Email is locked to maintain identity uniqueness"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                    <Phone className="h-3 w-3 text-cyan-400" />
                    <span>Phone Number *</span>
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-[#071d47] border border-[#00d2ff]/40 text-white text-xs focus:border-[#00d2ff] outline-none"
                    placeholder="e.g. +91 98765 43210"
                    required
                  />
                </div>
              </div>

              {/* Security Question */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                    <KeyRound className="h-3 w-3 text-cyan-400" />
                    <span>Recovery Question</span>
                  </label>
                  <select
                    value={securityQuestion}
                    onChange={(e) => setSecurityQuestion(e.target.value)}
                    className="w-full h-10 px-2 rounded-lg bg-[#071d47] border border-[#00d2ff]/40 text-white text-xs focus:border-[#00d2ff] outline-none"
                  >
                    <option value="Favorite Place" className="bg-[#071d47] text-white">Favorite Place</option>
                    <option value="Favorite Food" className="bg-[#071d47] text-white">Favorite Food</option>
                    <option value="Favorite Thing" className="bg-[#071d47] text-white">Favorite Thing</option>
                    <option value="Memorable Event / Other" className="bg-[#071d47] text-white">Memorable Event / Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Security Answer (Secret)
                  </label>
                  <input
                    type="text"
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-[#071d47] border border-[#00d2ff]/40 text-white text-xs focus:border-[#00d2ff] outline-none"
                    placeholder="e.g. Biryani / Paris"
                  />
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#00d2ff]/20">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-full text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-7 py-2.5 rounded-full text-xs font-bold text-white bg-gradient-to-r from-[#00d2ff] to-[#0077ff] hover:from-[#33ddff] hover:to-[#1a88ff] shadow-[0_0_20px_rgba(0,210,255,0.4)] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-75"
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-3.5 w-3.5 text-white shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Saving Updates...</span>
                  </span>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Image Crop Modal for Logo */}
      {cropModalOpen && rawImageSrc && (
        <ImageCropModal
          isOpen={cropModalOpen}
          imageSrc={rawImageSrc}
          onCropComplete={handleApplyCrop}
          onClose={() => {
            setCropModalOpen(false);
            setRawImageSrc(null);
          }}
        />
      )}
    </>
  );
};
