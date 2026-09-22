import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  FileText, 
  Brain, 
  Code2, 
  BarChart3, 
  ChevronDown, 
  ChevronUp, 
  ArrowLeft, 
  Check, 
  User, 
  Lock, 
  Eye, 
  EyeOff,
  Building2,
  MapPin,
  Upload,
  Crop,
  ShieldCheck,
  AlertCircle,
  Key,
  Phone,
  HelpCircle,
  RefreshCw,
  Clock,
  Info
} from 'lucide-react';
import { ShinyButton } from '../components/ui/shiny-button';
import { ImageCropModal } from '../components/auth/ImageCropModal';
import { LoginMethodGuideModal } from '../components/auth/LoginMethodGuideModal';
import { 
  COUNTRIES, 
  getStates, 
  getDistricts 
} from '../services/locationData';
import { 
  checkUserApprovalStatus, 
  submitAccessRequest, 
  recordActiveSession,
  validateTeamMemberLogin,
  getStoredCompanies,
  getStoredAdmins,
  getTeamMembers,
  getAccessRequests,
  getRoleDefaultPermissions,
  isEmailCurrentlyLoggedIn,
  checkEmailConflict,
  removeActiveSession
} from '../services/accessControl';
import { 
  syncCompanyToCloud, 
  fetchCompanyFromCloud, 
  fetchAllCompaniesFromCloud,
  syncAdminToCloud, 
  fetchAdminFromCloud,
  syncAccessRequestToCloud,
  fetchAccessRequestsFromCloud,
  listenToUserApproval,
  listenToSingleRequestApproval
} from '../services/cloudSync';
import { meshSync } from '../services/meshSync';
import { signInWithGoogleIdentity } from '../services/firebase';
import { authApi } from '../services/api';

const ROLES_LIST = [
  'Super Admin',
  'Admin',
  'AI Operator',
  'Approver / Manager',
  'Analyst',
  'Employee',
  'Auditor',
];

const SECURITY_QUESTIONS = [
  { id: 'place', label: 'Favorite Place', prompt: 'What is your favorite place or city?' },
  { id: 'food', label: 'Favorite Food', prompt: 'What is your favorite dish or food?' },
  { id: 'thing', label: 'Favorite Thing', prompt: 'What is your favorite item or gadget?' },
  { id: 'other', label: 'Memorable Event / Other', prompt: 'What was your first school or pet name?' },
];

export const LoginPage: React.FC = () => {
  const { user, isAuthenticated, loginWithAirGap, setAuthenticatedSession } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  
  // If user is already authenticated, redirect to dashboard immediately
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, user]);
  
  // 3D Card Rotation State:
  // 0°   = Overview Hub (Face A) - Sovereign Workbench entry screen for all new sessions
  // 180° = Face B (Role Selection)
  // 360° = Face A (Super Admin Login or Company Code Verification)
  // 540° = Face B (Role Login for staff OR Registration Step 1)
  // 720° = Face A (Registration Step 2)
  const [rotationAngle, setRotationAngle] = useState<number>(0);

  const [faceBMode, setFaceBMode] = useState<'role_select' | 'reg_step1' | 'forgot_password' | 'role_login'>('role_select');

  const [showLoginGuide, setShowLoginGuide] = useState(false);
  
  const [selectedRole, setSelectedRole] = useState<string>(() => {
    try {
      return localStorage.getItem('kelvrin_last_role') || 'Super Admin';
    } catch {
      return 'Super Admin';
    }
  });

  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(true);

  // Terminal-Bound Authorized Email for Non-Super Admin Roles
  const [authorizedEmail, setAuthorizedEmail] = useState<string | null>(() => {
    try {
      const lastRole = localStorage.getItem('kelvrin_last_role') || 'Super Admin';
      if (lastRole !== 'Super Admin') {
        const roleEmail = localStorage.getItem(`kelvrin_authorized_email_${lastRole}`);
        if (roleEmail) return roleEmail.toLowerCase().trim();
      }
      const general = localStorage.getItem('kelvrin_authorized_email');
      return general ? general.toLowerCase().trim() : null;
    } catch {
      return null;
    }
  });

  // Role Login Form States (Image 2)
  const [roleLoginUsername, setRoleLoginUsername] = useState<string>(() => {
    try {
      const lastRole = localStorage.getItem('kelvrin_last_role') || 'Super Admin';
      if (lastRole !== 'Super Admin') {
        const roleEmail = localStorage.getItem(`kelvrin_authorized_email_${lastRole}`);
        if (roleEmail) return roleEmail;
      }
      const general = localStorage.getItem('kelvrin_authorized_email');
      return general || '';
    } catch {
      return '';
    }
  });
  const [roleLoginPassword, setRoleLoginPassword] = useState('');
  const [showRoleLoginPassword, setShowRoleLoginPassword] = useState(false);
  const [roleLoginError, setRoleLoginError] = useState<string | null>(null);

  // Super Admin Login Form States
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccessNotice, setLoginSuccessNotice] = useState<string | null>(null);

  // Other Roles: Company Code Form States
  const [verifiedCompany, setVerifiedCompany] = useState<any | null>(() => {
    try {
      const raw = localStorage.getItem('kelvrin_company');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [companyCodeInput, setCompanyCodeInput] = useState<string>(() => {
    try {
      const raw = localStorage.getItem('kelvrin_company');
      if (raw) {
        const parsed = JSON.parse(raw);
        return (parsed.code || parsed.companyCode || '').toUpperCase();
      }
      return (localStorage.getItem('kelvrin_last_company_code') || '').toUpperCase();
    } catch {
      return '';
    }
  });

  const [unverifiedCodeNotice, setUnverifiedCodeNotice] = useState<string | null>(null);
  const [loadingButtonKey, setLoadingButtonKey] = useState<string | null>(null);

  // Registration Step 1: Organization & Location States
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regCompanyCode, setRegCompanyCode] = useState('');
  const [regCountry, setRegCountry] = useState('IN');
  const [regState, setRegState] = useState('TN');
  const [regDistrict, setRegDistrict] = useState('Chennai');
  const [regLogoDataUrl, setRegLogoDataUrl] = useState<string | null>(null);
  const [rawImageForCrop, setRawImageForCrop] = useState<string | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [regStep1Error, setRegStep1Error] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Registration Step 2: Super Admin & Recovery States
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showAdminConfirmPassword, setShowAdminConfirmPassword] = useState(false);
  const [securityQuestionType, setSecurityQuestionType] = useState('place');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [regStep2Error, setRegStep2Error] = useState<string | null>(null);

  // Forgot Password Recovery States
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotAnswer, setForgotAnswer] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [showForgotConfirmPassword, setShowForgotConfirmPassword] = useState(false);
  const [forgotStage, setForgotStage] = useState<'verify' | 'reset'>('verify');
  const [matchedAdmin, setMatchedAdmin] = useState<any | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Google Connect & Super Admin Approval States
  const [pendingApprovalUser, setPendingApprovalUser] = useState<{
    fullName: string;
    email: string;
    role: string;
    companyCode: string;
    avatarUrl?: string;
  } | null>(null);
  const [approvalCheckNotice, setApprovalCheckNotice] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  // Pre-load all registered companies from Cloud Firestore & Local Mesh
  useEffect(() => {
    // Pre-sync all companies registered on other systems/devices
    fetchAllCompaniesFromCloud().catch(err => {
      console.warn('[CloudSync] Pre-load companies warning:', err);
    });

    // Request immediate sync from any open tabs/windows
    meshSync.requestCompaniesSync();
  }, []);

  // Listen for company purge events from Super Admin: reset everyone back to 0° only when purged
  useEffect(() => {
    const handleCompanyUpdate = () => {
      try {
        const raw = localStorage.getItem('kelvrin_company');
        if (!raw) {
          // Organization was purged by Super Admin: reset everyone back to the very first login page (0°)
          setVerifiedCompany(null);
          setCompanyCodeInput('');
          setSelectedRole('Super Admin');
          setRotationAngle(0);
          setFaceBMode('role_select');
          setAuthorizedEmail(null);
          setRoleLoginUsername('');
        } else {
          const comp = JSON.parse(raw);
          setVerifiedCompany(comp);
          setCompanyCodeInput((comp.code || comp.companyCode || '').toUpperCase());
        }
      } catch {}
    };

    window.addEventListener('kelvrin_company_updated', handleCompanyUpdate);
    window.addEventListener('storage', handleCompanyUpdate);
    return () => {
      window.removeEventListener('kelvrin_company_updated', handleCompanyUpdate);
      window.removeEventListener('storage', handleCompanyUpdate);
    };
  }, []);

  // Sync authorized email when selectedRole changes for non-Super Admin roles
  useEffect(() => {
    if (selectedRole !== 'Super Admin') {
      try {
        const roleEmail = localStorage.getItem(`kelvrin_authorized_email_${selectedRole}`);
        const general = localStorage.getItem('kelvrin_authorized_email');
        const effective = roleEmail || general || null;
        setAuthorizedEmail(effective ? effective.toLowerCase().trim() : null);
        if (effective) {
          setRoleLoginUsername(effective);
        }
      } catch {}
    }
  }, [selectedRole]);

  // Security Validator: Ensures non-Super Admin logins strictly match the email granted permission
  const checkEmailHasRolePermission = useCallback((
    testIdentifier: string,
    targetRole: string,
    targetCompanyCode: string
  ): { hasPermission: boolean; authorizedEmail?: string } => {
    const norm = testIdentifier.trim().toLowerCase();
    const normCode = targetCompanyCode.trim().toUpperCase();

    // Priority 1: Terminal-bound authorized email
    const roleLockedEmail = localStorage.getItem(`kelvrin_authorized_email_${targetRole}`) || 
                            localStorage.getItem('kelvrin_authorized_email');
    if (roleLockedEmail) {
      const lockedLower = roleLockedEmail.toLowerCase().trim();
      const lockedUser = lockedLower.split('@')[0];
      if (norm === lockedLower || norm === lockedUser) {
        return { hasPermission: true, authorizedEmail: lockedLower };
      } else {
        return { hasPermission: false, authorizedEmail: lockedLower };
      }
    }

    // Priority 2: Registered Team Members for this company & role
    const members = getTeamMembers();
    const matchedMember = members.find(m =>
      (m.email.toLowerCase() === norm || m.username.toLowerCase() === norm) &&
      m.companyCode.toUpperCase() === normCode &&
      m.role === targetRole &&
      m.status === 'active'
    );
    if (matchedMember) {
      return { hasPermission: true, authorizedEmail: matchedMember.email.toLowerCase() };
    }

    // Priority 3: Approved Access Requests for this company & role
    const requests = getAccessRequests();
    const matchedReq = requests.find(r =>
      (r.email.toLowerCase() === norm || r.fullName.toLowerCase() === norm || r.email.split('@')[0].toLowerCase() === norm) &&
      (!r.companyCode || r.companyCode.toUpperCase() === normCode) &&
      r.role === targetRole &&
      r.status === 'approved'
    );
    if (matchedReq) {
      return { hasPermission: true, authorizedEmail: matchedReq.email.toLowerCase() };
    }

    return { hasPermission: false };
  }, []);

  // Dedicated ref to prevent duplicate approval triggers or navigation loops
  const approvalGrantedRef = useRef(false);

  const handleGrantAccessAndRedirect = useCallback((requestData?: any) => {
    if (approvalGrantedRef.current) return;
    approvalGrantedRef.current = true;

    setApprovalCheckNotice('Permission granted by Super Admin! Launching workbench...');
    if (typeof (window as any).Loader?.show === 'function') {
      (window as any).Loader.show('Loading');
    }

    const approvedRole = (requestData?.role || pendingApprovalUser?.role || selectedRole) as any;
    const userObj = {
      id: `usr_${Date.now()}`,
      email: pendingApprovalUser?.email || requestData?.email,
      fullName: requestData?.fullName || pendingApprovalUser?.fullName,
      role: approvedRole,
      companyCode: pendingApprovalUser?.companyCode || requestData?.companyCode,
      avatarUrl: requestData?.avatarUrl || pendingApprovalUser?.avatarUrl,
      status: 'active',
      permissions: getRoleDefaultPermissions(approvedRole),
    };
    removeActiveSession(userObj.email);
    setAuthenticatedSession(userObj);

    setTimeout(() => {
      if (typeof (window as any).Loader?.done === 'function') {
        (window as any).Loader.done();
      }
      navigate(from, { replace: true });
    }, 800);
  }, [pendingApprovalUser, selectedRole, setAuthenticatedSession, navigate, from]);

  // Real-time listener & resilient fallback when user is waiting for Super Admin approval
  useEffect(() => {
    if (!pendingApprovalUser) {
      approvalGrantedRef.current = false;
      return;
    }

    // 1. Listen to real-time Cloud Firestore updates (< 150ms cross-laptop latency!)
    const unsubscribeCloud = listenToUserApproval(
      pendingApprovalUser.email,
      pendingApprovalUser.companyCode,
      (cloudReq) => {
        if (cloudReq.status === 'approved') {
          handleGrantAccessAndRedirect(cloudReq);
        } else if (cloudReq.status === 'rejected') {
          setApprovalCheckNotice('Your access request was declined by the Super Admin.');
        }
      }
    );

    // 2. Listen to real-time local mesh events (for tabs on same machine)
    const unsubscribeMesh = meshSync.subscribe((msg) => {
      if (msg.type === 'ACCESS_REQUEST_DECIDED' && msg.payload) {
        const payload = msg.payload;
        const targetEmail = (payload.email || '').toLowerCase();
        const pEmail = pendingApprovalUser.email.toLowerCase();
        const targetCode = (payload.companyCode || '').toUpperCase();
        const pCode = pendingApprovalUser.companyCode.toUpperCase();
        const isMatch = (targetEmail === pEmail || payload.id === payload.requestId) && (!targetCode || targetCode === pCode);
        if (isMatch) {
          if (payload.status === 'approved') {
            handleGrantAccessAndRedirect(payload);
          } else if (payload.status === 'rejected') {
            setApprovalCheckNotice('Your access request was declined by the Super Admin.');
          }
        }
      }
    });

    // 3. Resilient polling fallback every 1.5 seconds
    const interval = setInterval(async () => {
      if (approvalGrantedRef.current) {
        clearInterval(interval);
        return;
      }
      try {
        await fetchAccessRequestsFromCloud(pendingApprovalUser.companyCode);
      } catch (err) {
        console.warn('[CloudSync] Polling error:', err);
      }
      const status = checkUserApprovalStatus(pendingApprovalUser.email, pendingApprovalUser.companyCode);
      if (status.isApproved) {
        clearInterval(interval);
        handleGrantAccessAndRedirect(status.request);
      } else if (status.isRejected) {
        setApprovalCheckNotice('Your access request was declined by the Super Admin.');
      }
    }, 1500);

    return () => {
      clearInterval(interval);
      unsubscribeCloud();
      unsubscribeMesh();
    };
  }, [pendingApprovalUser, handleGrantAccessAndRedirect]);

  // Update state/district cascades when country or state changes
  const statesList = getStates(regCountry);
  const districtsList = getDistricts(regState);

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCountry = e.target.value;
    setRegCountry(newCountry);
    const newStates = getStates(newCountry);
    const firstState = newStates[0]?.code || '';
    setRegState(firstState);
    const newDistricts = getDistricts(firstState);
    setRegDistrict(newDistricts[0] || '');
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newState = e.target.value;
    setRegState(newState);
    const newDistricts = getDistricts(newState);
    setRegDistrict(newDistricts[0] || '');
  };

  // Generate random company code helper
  const handleAutoGenerateCompanyCode = () => {
    const randomCode = 'KELV-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    setRegCompanyCode(randomCode);
  };

  // Handle Logo Upload File Selection
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setRawImageForCrop(url);
      setIsCropModalOpen(true);
    }
  };

  // 3D Rotation Navigators
  const goToRoleSelect = () => {
    setLoginError(null);
    setRoleLoginError(null);
    setUnverifiedCodeNotice(null);
    setFaceBMode('role_select');
    setRotationAngle(180);
  };
  const goToOverview = () => {
    setLoginError(null);
    setRoleLoginError(null);
    setUnverifiedCodeNotice(null);
    setRotationAngle(0);
  };
  const goToLoginForm = () => {
    setLoginError(null);
    setRoleLoginError(null);
    setUnverifiedCodeNotice(null);
    try {
      localStorage.setItem('kelvrin_last_role', selectedRole);
    } catch {}
    setRotationAngle(360);
  };
  const goToRegStep1 = () => {
    setRegStep1Error(null);
    setFaceBMode('reg_step1');
    setRotationAngle(540);
  };
  const goToForgotPass = () => {
    setForgotError(null);
    setForgotStage('verify');
    setForgotIdentifier(loginUsername);
    setForgotAnswer('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setMatchedAdmin(null);
    setFaceBMode('forgot_password');
    setRotationAngle(540);
  };

  // Step 1 Validation with STRICT UNIQUENESS CHECKS
  const goToRegStep2 = () => {
    const nameTrimmed = regCompanyName.trim();
    const codeTrimmed = regCompanyCode.trim().toUpperCase();

    if (!nameTrimmed) {
      setRegStep1Error('Please enter your Company Name.');
      return;
    }
    if (!codeTrimmed) {
      setRegStep1Error('Please specify or generate a Company Code.');
      return;
    }
    if (!regDistrict.trim()) {
      setRegStep1Error('Please select your District.');
      return;
    }

    // Uniqueness checks against stored companies
    const existingCompanies = getStoredCompanies();
    
    // 1. Company Name Uniqueness
    if (existingCompanies.some(c => c.name?.toLowerCase() === nameTrimmed.toLowerCase())) {
      setRegStep1Error(`Company Name "${nameTrimmed}" is already registered. Please choose a unique name.`);
      return;
    }

    // 2. Company Code Uniqueness
    if (existingCompanies.some(c => c.code?.toUpperCase() === codeTrimmed)) {
      setRegStep1Error(`Company Code "${codeTrimmed}" is already in use. Please enter or generate a unique code.`);
      return;
    }

    // 3. Company Logo Uniqueness
    if (regLogoDataUrl && existingCompanies.some(c => c.logoDataUrl && c.logoDataUrl === regLogoDataUrl)) {
      setRegStep1Error('This Company Logo has already been registered for an existing organization. Please upload a unique logo.');
      return;
    }

    setRegStep1Error(null);
    setRotationAngle(720);
  };

  // Super Admin Login Submit with 2s Circular Loading Spinner Inside Button
  const handleSuperAdminLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);

    const userVal = loginUsername.trim();
    const passVal = loginPassword.trim();

    // Strict validation: must enter both username & password
    if (!userVal || !passVal) {
      setLoginError('Please enter both Super Admin username and password to proceed.');
      return;
    }

    setIsLoading(true);
    setLoadingButtonKey('superadmin_signin');
    const startTime = Date.now();

    try {
      let registeredAdmins = getStoredAdmins();
      let foundAdmin = registeredAdmins.find(reg => 
        reg.username?.toLowerCase() === userVal.toLowerCase() || 
        reg.email?.toLowerCase() === userVal.toLowerCase()
      );

      // If not cached locally, query Cloud Firestore so Super Admin can log in from any computer!
      if (!foundAdmin) {
        const cloudAdmin = await fetchAdminFromCloud(userVal);
        if (cloudAdmin) {
          foundAdmin = cloudAdmin;
        }
      }

      // Guarantee minimum 2000ms circular spinner experience inside the button
      const elapsed = Date.now() - startTime;
      if (elapsed < 2000) {
        await new Promise((resolve) => setTimeout(resolve, 2000 - elapsed));
      }

      if (foundAdmin) {
        if (foundAdmin.password !== passVal) {
          setLoginError('Incorrect password for Super Admin account.');
          return;
        }

        // Check if email is already logged in on an active session
        if (isEmailCurrentlyLoggedIn(foundAdmin.email)) {
          setLoginError(`Super Admin account (${foundAdmin.email}) is already active in another session. Simultaneous logins with the same email are not permitted.`);
          return;
        }

        // Attempt backend air-gap token exchange if backend is reachable
        let sessionToken: string | undefined;
        try {
          const authResult = await authApi.localLogin(foundAdmin.email, passVal);
          if (authResult?.token) {
            sessionToken = authResult.token;
          }
        } catch (apiErr) {
          console.info('[KELVRIN] Backend auth offline or air-gap enclave active, authenticating sovereign local session.');
        }

        // Authenticate registered admin
        const userObj = {
          id: 'usr_' + Date.now(),
          email: foundAdmin.email,
          fullName: foundAdmin.fullName || `${foundAdmin.firstName} ${foundAdmin.lastName}`,
          phone: foundAdmin.phone,
          role: 'Super Admin',
          companyCode: foundAdmin.companyCode,
          status: 'active',
          permissions: ['*'],
        };
        removeActiveSession(foundAdmin.email);
        localStorage.setItem('kelvrin_last_role', 'Super Admin');
        if (foundAdmin.companyCode) {
          localStorage.setItem('kelvrin_last_company_code', foundAdmin.companyCode);
        }
        setAuthenticatedSession(userObj as any, sessionToken);
        navigate(from, { replace: true });
        return;
      }

      // Check backend for pre-seeded or backend-provisioned Super Admin accounts
      try {
        const authResult = await authApi.localLogin(userVal, passVal);
        if (authResult?.user) {
          removeActiveSession(authResult.user.email);
          setAuthenticatedSession(authResult.user, authResult.token);
          navigate(from, { replace: true });
          return;
        }
      } catch {
        // Backend offline or user not found
      }

      // If no admin is found, prompt them to register
      setLoginError('No Super Admin account registered yet. Please click "New Registration" below to configure your company and create your Super Admin credentials.');
    } catch (err: any) {
      setLoginError(err.message || 'Authentication error.');
    } finally {
      setIsLoading(false);
      setLoadingButtonKey(null);
    }
  };

  // Company Code Submit (for other roles) with 2s Circular Loading & Worldwide Verification
  const handleCompanyCodeSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);
    setUnverifiedCodeNotice(null);
    setVerifiedCompany(null);

    const code = companyCodeInput.trim().toUpperCase();
    if (!code) {
      setLoginError('Please enter your Company Code.');
      return;
    }

    setIsLoading(true);
    setLoadingButtonKey('verify_company_code');
    const startTime = Date.now();

    let matchedCompany: any = null;
    try {
      // 1. Check local cache first
      const existingCompanies = getStoredCompanies();
      matchedCompany = existingCompanies.find(c => (c.code || c.companyCode)?.toUpperCase() === code);

      // 2. If not yet in local storage, query Cloud Firestore & Backend REST API
      if (!matchedCompany) {
        matchedCompany = await fetchCompanyFromCloud(code);
      }
    } catch (err) {
      console.warn('[CloudSync] Company code validation error:', err);
    }

    // Guarantee minimum 2000ms circular spinner experience inside the button
    const elapsed = Date.now() - startTime;
    if (elapsed < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 2000 - elapsed));
    }
    setIsLoading(false);
    setLoadingButtonKey(null);

    // Strict verification:
    // If company code is not registered, show unverified alert and block
    if (!matchedCompany) {
      setUnverifiedCodeNotice(`Company Code "${code}" is unverified. No registered organization matches this code.`);
      setLoginError(`Company Code "${code}" is unverified. Please enter a valid registered Company Code or ask your organization Super Admin.`);
      return;
    }

    // Code verified! Save to active company & display verified badge
    setVerifiedCompany(matchedCompany);
    try {
      localStorage.setItem('kelvrin_company', JSON.stringify(matchedCompany));
    } catch {}

    // Brief visual confirmation of verified badge, then rotate card to Face B (540°) showing Role Login (Image 2)
    setTimeout(() => {
      setRoleLoginUsername('');
      setRoleLoginPassword('');
      setRoleLoginError(null);
      setFaceBMode('role_login');
      setRotationAngle(540);
    }, 600);
  };

  // Role Login Submit on Face B (Image 2)
  const handleRoleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoleLoginError(null);

    const identifier = roleLoginUsername.trim();
    const pass = roleLoginPassword.trim();
    const code = companyCodeInput.trim().toUpperCase();

    if (!identifier || !pass) {
      setRoleLoginError('Please enter both username/email and password.');
      return;
    }

    // 0. Strict Authorized Email & Permission Enforcement for Non-Super Admin roles
    if (selectedRole !== 'Super Admin') {
      const permCheck = checkEmailHasRolePermission(identifier, selectedRole, code);
      if (!permCheck.hasPermission) {
        if (permCheck.authorizedEmail) {
          setRoleLoginError(
            `Access Denied: Only the authorized email (${permCheck.authorizedEmail}) granted permission for this role can log in. Different email accounts ("${identifier}") are strictly prohibited.`
          );
        } else {
          setRoleLoginError(
            `Access Denied: Account "${identifier}" has not been granted permission by the Super Admin for role ${selectedRole}. Only authorized emails granted permission can log in.`
          );
        }
        return;
      }
    }

    setIsLoading(true);
    setLoadingButtonKey('role_signin');
    const startTime = Date.now();

    try {
      // 1. Check if identifier is already currently logged in on an active session
      if (isEmailCurrentlyLoggedIn(identifier)) {
        setRoleLoginError(`This account (${identifier}) is already active in another session. Simultaneous logins with the same account are not permitted.`);
        setIsLoading(false);
        setLoadingButtonKey(null);
        return;
      }

      // 2. Prevent Super Admin from using credentials here to log in as another role!
      const admins = getStoredAdmins();
      const isSuperAdmin = admins.some(a => 
        a.email?.toLowerCase() === identifier.toLowerCase() || 
        a.username?.toLowerCase() === identifier.toLowerCase()
      );
      if (isSuperAdmin) {
        setRoleLoginError(`This account (${identifier}) is registered as Super Admin. Super Admins cannot log in as ${selectedRole}. Please use the Super Admin Login portal.`);
        setIsLoading(false);
        setLoadingButtonKey(null);
        return;
      }

      // 3. Prevent password-based login or impersonation for accounts linked via Google
      const members = getTeamMembers();
      const requests = getAccessRequests();
      const isGoogleLinked = 
        members.some(m => (m.email.toLowerCase() === identifier.toLowerCase() || m.username.toLowerCase() === identifier.toLowerCase()) && m.authProvider === 'google') ||
        requests.some(r => (r.email.toLowerCase() === identifier.toLowerCase() || r.fullName.toLowerCase() === identifier.toLowerCase() || r.email.split('@')[0].toLowerCase() === identifier.toLowerCase()) && r.authProvider === 'google');

      if (isGoogleLinked) {
        setRoleLoginError(`This account is secured with Google Authentication. Please sign in by clicking "Continue with Google".`);
        setIsLoading(false);
        setLoadingButtonKey(null);
        return;
      }

      // 4. Check in team members registered by Super Admin in User Management
      const member = validateTeamMemberLogin(identifier, pass, code);

      // Guarantee minimum 2000ms circular spinner experience inside the button
      const elapsed = Date.now() - startTime;
      if (elapsed < 2000) {
        await new Promise((resolve) => setTimeout(resolve, 2000 - elapsed));
      }

      if (member) {
        // Enforce role consistency: member cannot log in as a different role
        if (member.role !== selectedRole) {
          setRoleLoginError(`This member is registered with role "${member.role}". You cannot log in under role "${selectedRole}".`);
          return;
        }

        if (isEmailCurrentlyLoggedIn(member.email)) {
          setRoleLoginError(`This member account (${member.email}) is already active in another session. Simultaneous logins with the same email are not permitted.`);
          return;
        }

        const memberComps = getStoredCompanies();
        const matchedMemberComp = memberComps.find(c => (c.code || c.companyCode)?.toUpperCase() === member.companyCode.toUpperCase());
        if (matchedMemberComp) {
          localStorage.setItem('kelvrin_company', JSON.stringify(matchedMemberComp));
        }

        const userObj = {
          id: member.id,
          email: member.email,
          fullName: member.fullName,
          role: member.role,
          companyCode: member.companyCode,
          companyName: matchedMemberComp?.name || member.companyCode,
          status: member.status,
          permissions: getRoleDefaultPermissions(member.role),
        };
        removeActiveSession(member.email);
        localStorage.setItem('kelvrin_last_role', member.role);
        if (member.companyCode) {
          localStorage.setItem('kelvrin_last_company_code', member.companyCode);
        }
        localStorage.setItem('kelvrin_authorized_email', member.email.toLowerCase().trim());
        localStorage.setItem(`kelvrin_authorized_email_${member.role}`, member.email.toLowerCase().trim());
        setAuthorizedEmail(member.email.toLowerCase().trim());
        setAuthenticatedSession(userObj as any);
        navigate(from, { replace: true });
        return;
      }

      // 5. Check Cloud Firestore & local requests for pending or approved access request
      try {
        await fetchAccessRequestsFromCloud(code);
      } catch {}

      const normId = identifier.toLowerCase();
      const cloudReqs = getAccessRequests();
      const existingReq = cloudReqs.find(r => 
        (r.email.toLowerCase() === normId || r.fullName.toLowerCase() === normId || r.email.split('@')[0].toLowerCase() === normId) &&
        (!r.companyCode || r.companyCode.toUpperCase() === code)
      );

      if (existingReq) {
        if (existingReq.status === 'approved') {
          const approvedRole = (existingReq.role || selectedRole) as any;
          const userObj = {
            id: existingReq.id,
            email: existingReq.email,
            fullName: existingReq.fullName,
            role: approvedRole,
            companyCode: code,
            avatarUrl: existingReq.avatarUrl,
            status: 'active',
            permissions: getRoleDefaultPermissions(approvedRole),
          };
          removeActiveSession(existingReq.email);
          localStorage.setItem('kelvrin_last_role', approvedRole);
          localStorage.setItem('kelvrin_last_company_code', code);
          localStorage.setItem('kelvrin_authorized_email', existingReq.email.toLowerCase().trim());
          localStorage.setItem(`kelvrin_authorized_email_${approvedRole}`, existingReq.email.toLowerCase().trim());
          setAuthorizedEmail(existingReq.email.toLowerCase().trim());
          setAuthenticatedSession(userObj as any);
          navigate(from, { replace: true });
          return;
        } else if (existingReq.status === 'pending_approval') {
          setPendingApprovalUser({
            fullName: existingReq.fullName,
            email: existingReq.email,
            role: existingReq.role || selectedRole,
            companyCode: code,
            avatarUrl: existingReq.avatarUrl,
          });
          setRotationAngle(360);
          return;
        } else if (existingReq.status === 'rejected') {
          setRoleLoginError(`Your access request for ${identifier} was declined by the Super Admin.`);
          return;
        }
      }

      setRoleLoginError(`Credentials for "${identifier}" not found. Click "Request Access as ${selectedRole}" below to request authorization from the Super Admin.`);
    } catch (err: any) {
      setRoleLoginError('Login error: ' + (err.message || 'Please try again.'));
    } finally {
      setIsLoading(false);
      setLoadingButtonKey(null);
    }
  };

  // Direct Access Request (via Username/Email without Google OAuth requirement)
  const handleRequestAccessDirectly = async () => {
    setRoleLoginError(null);
    const identifier = roleLoginUsername.trim();
    const code = companyCodeInput.trim().toUpperCase();

    if (!code) {
      setRoleLoginError('Company Code is required. Please verify your company code first.');
      return;
    }

    if (!identifier) {
      setRoleLoginError(`Please enter your Name or Email in the username box above, then click "Request Access as ${selectedRole}".`);
      return;
    }

    if (selectedRole !== 'Super Admin') {
      const roleLockedEmail = localStorage.getItem(`kelvrin_authorized_email_${selectedRole}`) || 
                              localStorage.getItem('kelvrin_authorized_email');
      if (roleLockedEmail) {
        const lockedLower = roleLockedEmail.toLowerCase().trim();
        const lockedUser = lockedLower.split('@')[0];
        const normId = identifier.toLowerCase();
        if (normId !== lockedLower && normId !== lockedUser) {
          setRoleLoginError(
            `Workstation Locked: This terminal is already registered to authorized account (${lockedLower}). Submitting access requests for different accounts is prohibited.`
          );
          return;
        }
      }
    }

    setIsLoading(true);
    setLoadingButtonKey('request_access_direct');
    const startTime = Date.now();

    try {
      const email = identifier.includes('@')
        ? identifier.toLowerCase()
        : `${identifier.toLowerCase().replace(/\s+/g, '.')}@${code.toLowerCase()}.enclave`;
      const fullName = identifier.includes('@') ? identifier.split('@')[0] : identifier;

      // Submit access request to Super Admin's queue (local & cloud)
      const newReq = submitAccessRequest({
        fullName,
        email,
        role: selectedRole as any,
        companyCode: code,
        authProvider: 'air_gap',
      });

      if (newReq) {
        await syncAccessRequestToCloud(newReq).catch(e => console.warn('[CloudSync] Access request sync failed:', e));
      }

      const elapsed = Date.now() - startTime;
      if (elapsed < 1200) {
        await new Promise((resolve) => setTimeout(resolve, 1200 - elapsed));
      }

      setPendingApprovalUser({
        fullName,
        email,
        role: selectedRole,
        companyCode: code,
      });

      // Rotate card back to 360° to display the Authorization Pending screen on Face A
      setRotationAngle(360);
    } catch (err: any) {
      setRoleLoginError('Failed to submit access request: ' + (err.message || 'Please try again.'));
    } finally {
      setIsLoading(false);
      setLoadingButtonKey(null);
    }
  };

  // Continue with Google on Face B (Image 2) with 2s Circular Loading
  const handleContinueWithGoogle = async () => {
    setRoleLoginError(null);
    const code = companyCodeInput.trim().toUpperCase();

    if (!code) {
      setRoleLoginError('Company Code is required. Please verify your company code first.');
      return;
    }

    setIsLoading(true);
    setLoadingButtonKey('google_signin');
    const startTime = Date.now();
    try {
      // 1. Trigger live Firebase Google Sign-In popup
      const googleAuth = await signInWithGoogleIdentity();
      const email = (googleAuth.email || '').trim().toLowerCase();
      const fullName = (googleAuth.displayName || email.split('@')[0] || 'User').trim();
      const avatarUrl = googleAuth.photoURL;

      if (!email) {
        throw new Error('Could not retrieve a verified email address from your Google account.');
      }

      // Guarantee smooth 2000ms circular spinner experience inside the button
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 2. Super Admin email protection: Super Admin email cannot be used for any other role!
      const admins = getStoredAdmins();
      const isSuperAdminEmail = admins.some(a => a.email?.toLowerCase() === email);
      if (isSuperAdminEmail && selectedRole !== 'Super Admin') {
        setRoleLoginError(`This email (${email}) is registered as a Super Admin. You cannot use the Super Admin's email to log in or request access as ${selectedRole}. Please use the Super Admin login portal.`);
        setIsLoading(false);
        setLoadingButtonKey(null);
        return;
      }

      // Strict Authorized Email & Permission Enforcement for Non-Super Admin roles:
      // If this workstation is already locked to a specific authorized account, reject different emails!
      if (selectedRole !== 'Super Admin') {
        const permCheck = checkEmailHasRolePermission(email, selectedRole, code);
        if (permCheck.authorizedEmail && !permCheck.hasPermission) {
          setRoleLoginError(
            `Access Denied: You authenticated with Google as "${email}". This workstation is strictly locked to the authorized email (${permCheck.authorizedEmail}) approved by the Super Admin.`
          );
          setIsLoading(false);
          setLoadingButtonKey(null);
          return;
        }
      }

      // 3. Pre-sync latest access requests from Cloud Firestore
      try {
        await fetchAccessRequestsFromCloud(code);
      } catch (err) {
        console.warn('[CloudSync] Pre-login sync notice:', err);
      }

      // 4. Strict email conflict & concurrent session check
      // For Google OAuth, isGoogleAuth = true clears any local stale session and verifies verified identity
      const conflict = checkEmailConflict(email, selectedRole, code, true);
      if (conflict.hasConflict) {
        setRoleLoginError(conflict.reason || `This email (${email}) is already registered or active in the system.`);
        setIsLoading(false);
        setLoadingButtonKey(null);
        return;
      }

      // 5. Check if user is ALREADY approved by Super Admin
      const status = checkUserApprovalStatus(email, code);
      const members = getTeamMembers();
      const approvedMember = members.find(
        m => m.email.toLowerCase() === email && m.companyCode.toUpperCase() === code && m.status === 'active'
      );

      if (status.isApproved || approvedMember) {
        const approvedRole = (status.request?.role || approvedMember?.role || selectedRole) as any;
        const userObj = {
          id: `google_${googleAuth.uid || Date.now()}`,
          email,
          fullName: status.request?.fullName || approvedMember?.fullName || fullName,
          role: approvedRole,
          companyCode: code,
          avatarUrl: avatarUrl || status.request?.avatarUrl,
          status: 'active',
          permissions: getRoleDefaultPermissions(approvedRole),
        };
        removeActiveSession(email);
        localStorage.setItem('kelvrin_last_role', approvedRole);
        localStorage.setItem('kelvrin_last_company_code', code);
        localStorage.setItem('kelvrin_authorized_email', email.toLowerCase().trim());
        localStorage.setItem(`kelvrin_authorized_email_${approvedRole}`, email.toLowerCase().trim());
        setAuthorizedEmail(email.toLowerCase().trim());
        setAuthenticatedSession(userObj as any);
        setIsLoading(false);
        setLoadingButtonKey(null);
        navigate(from, { replace: true });
        return;
      }

      // 6. If an access request is already pending, return to Face A waiting screen
      if (status.isPending) {
        setPendingApprovalUser({
          fullName: status.request?.fullName || fullName,
          email,
          role: status.request?.role || selectedRole,
          companyCode: code,
          avatarUrl: status.request?.avatarUrl || avatarUrl,
        });
        setIsLoading(false);
        setLoadingButtonKey(null);
        setRotationAngle(360);
        return;
      }

      // 7. If access request was rejected
      if (status.isRejected) {
        setRoleLoginError(`Your access request for ${email} was declined by the Super Admin. Please contact your organization administrator.`);
        setIsLoading(false);
        setLoadingButtonKey(null);
        return;
      }

      // 8. User account is verified from Google, but not yet authorized by Super Admin:
      // Submit access request to Super Admin's queue (local & cloud)
      const newReq = submitAccessRequest({
        fullName,
        email,
        role: selectedRole as any,
        companyCode: code,
        authProvider: 'google',
        avatarUrl,
      });

      if (newReq) {
        await syncAccessRequestToCloud(newReq).catch(e => console.warn('[CloudSync] Access request sync failed:', e));
      }

      setPendingApprovalUser({
        fullName,
        email,
        role: selectedRole,
        companyCode: code,
        avatarUrl,
      });

      // Rotate card back to 360° to display the Authorization Pending screen on Face A
      setRotationAngle(360);
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      if (elapsed < 2000) {
        await new Promise((resolve) => setTimeout(resolve, 2000 - elapsed));
      }
      console.error('[KELVRIN] Google Sign-In Error:', err);
      if (err.message && err.message.includes('popup was closed')) {
        setRoleLoginError('Google Sign-In was cancelled.');
      } else {
        setRoleLoginError(err.message || 'Google authentication failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
      setLoadingButtonKey(null);
    }
  };

  // Check Approval Status manually
  const handleCheckApprovalStatus = async () => {
    if (!pendingApprovalUser) return;
    setIsLoading(true);
    try {
      await fetchAccessRequestsFromCloud(pendingApprovalUser.companyCode);
    } catch {}
    const status = checkUserApprovalStatus(pendingApprovalUser.email, pendingApprovalUser.companyCode);

    if (status.isApproved) {
      setApprovalCheckNotice('Permission granted by Super Admin! Launching workbench...');
      setTimeout(() => {
        const approvedRole = (status.request?.role || pendingApprovalUser.role) as any;
        const userObj = {
          id: `usr_${Date.now()}`,
          email: pendingApprovalUser.email,
          fullName: status.request?.fullName || pendingApprovalUser.fullName,
          role: approvedRole,
          companyCode: pendingApprovalUser.companyCode,
          avatarUrl: status.request?.avatarUrl || pendingApprovalUser.avatarUrl,
          status: 'active',
          permissions: getRoleDefaultPermissions(approvedRole),
        };
        removeActiveSession(pendingApprovalUser.email);
        setAuthenticatedSession(userObj as any);
        navigate(from, { replace: true });
      }, 500);
    } else if (status.isRejected) {
      setApprovalCheckNotice('Your access request was declined by the Super Admin.');
    } else {
      setApprovalCheckNotice('Still awaiting Super Admin approval. Please wait for the Super Admin to approve your access from the Dashboard.');
      setTimeout(() => setApprovalCheckNotice(null), 4000);
    }
    setIsLoading(false);
  };

  // Step 2 Registration Submit: Create Super Admin & Company with STRICT UNIQUENESS
  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegStep2Error(null);

    const emailTrimmed = adminEmail.trim().toLowerCase();
    const phoneTrimmed = adminPhone.trim();

    if (!adminFirstName.trim()) {
      setRegStep2Error('Please enter your Super Admin First Name.');
      return;
    }
    if (!emailTrimmed || !emailTrimmed.includes('@')) {
      setRegStep2Error('Please enter a valid Email Address.');
      return;
    }
    if (!phoneTrimmed || phoneTrimmed.length < 8) {
      setRegStep2Error('Please enter a valid Phone Number (minimum 8 digits).');
      return;
    }
    if (!adminPassword || adminPassword.length < 6) {
      setRegStep2Error('Password must be at least 6 characters long.');
      return;
    }
    if (adminPassword !== adminConfirmPassword) {
      setRegStep2Error('Passwords do not match. Please re-enter.');
      return;
    }
    if (!securityAnswer.trim()) {
      setRegStep2Error('Please provide an answer for your security recovery question.');
      return;
    }

    // Uniqueness checks against stored admins
    const existingAdmins = getStoredAdmins();
    
    // 1. Email Uniqueness Check
    if (existingAdmins.some(a => a.email?.toLowerCase() === emailTrimmed)) {
      setRegStep2Error(`Email address "${adminEmail}" is already registered. Each account must have a unique email.`);
      return;
    }

    // 2. Phone Number Uniqueness Check
    if (existingAdmins.some(a => a.phone === phoneTrimmed)) {
      setRegStep2Error(`Phone number "${adminPhone}" is already registered with another account.`);
      return;
    }

    setIsLoading(true);
    setLoadingButtonKey('register_admin');
    const startTime = Date.now();
    try {
      // 1. Save company profile
      const newCompany = {
        name: regCompanyName.trim(),
        code: regCompanyCode.trim().toUpperCase(),
        country: regCountry,
        state: regState,
        district: regDistrict,
        logoDataUrl: regLogoDataUrl,
        createdAt: new Date().toISOString(),
      };
      const existingCompanies = getStoredCompanies();
      const updatedCompanies = [...existingCompanies, newCompany];
      localStorage.setItem('kelvrin_companies', JSON.stringify(updatedCompanies));
      localStorage.setItem('kelvrin_company', JSON.stringify(newCompany));

      // 2. Save Super Admin Account
      const newAdmin = {
        username: emailTrimmed.split('@')[0],
        firstName: adminFirstName.trim(),
        lastName: adminLastName.trim(),
        fullName: `${adminFirstName.trim()} ${adminLastName.trim()}`.trim(),
        email: emailTrimmed,
        phone: phoneTrimmed,
        password: adminPassword,
        securityQuestion: securityQuestionType,
        securityAnswer: securityAnswer.trim(),
        role: 'Super Admin',
        companyCode: regCompanyCode.trim().toUpperCase(),
        createdAt: new Date().toISOString(),
      };
      const updatedAdmins = [...existingAdmins, newAdmin];
      localStorage.setItem('kelvrin_registered_admins', JSON.stringify(updatedAdmins));
      localStorage.setItem('kelvrin_registered_admin', JSON.stringify(newAdmin));

      // 3. Sync Company & Super Admin to Cloud Firestore & Backend so any system/browser can recognize them
      await Promise.allSettled([
        syncCompanyToCloud(newCompany),
        syncAdminToCloud(newAdmin)
      ]);

      // 4. Pre-fill login inputs
      setLoginUsername(newAdmin.username);
      setLoginPassword(adminPassword);
      setLoginSuccessNotice(`Registration successful! Super Admin account created for ${newCompany.name}.`);

      // 5. Rotate back to Super Admin Login (360°)
      setRotationAngle(360);

      // Smooth 2-second transition
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (err: any) {
      setRegStep2Error('Failed to save registration: ' + err.message);
    } finally {
      setIsLoading(false);
      setLoadingButtonKey(null);
    }
  };

  // Forgot Password: Stage 1 - Verify Security Answer
  const handleVerifySecurityAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    const identifier = forgotIdentifier.trim().toLowerCase();
    const answer = forgotAnswer.trim().toLowerCase();

    if (!identifier) {
      setForgotError('Please enter your registered Email or Username.');
      return;
    }
    if (!answer) {
      setForgotError('Please enter your secret security recovery answer.');
      return;
    }

    setIsLoading(true);
    setLoadingButtonKey('verify_security_answer');
    const startTime = Date.now();

    try {
      const admins = getStoredAdmins();
      const found = admins.find(a => 
        a.email?.toLowerCase() === identifier || 
        a.username?.toLowerCase() === identifier
      );

      const elapsed = Date.now() - startTime;
      if (elapsed < 1500) {
        await new Promise((resolve) => setTimeout(resolve, 1500 - elapsed));
      }

      if (!found) {
        setForgotError(`No Super Admin account found matching "${forgotIdentifier}".`);
        return;
      }

      if (found.securityAnswer?.trim().toLowerCase() !== answer) {
        setForgotError('Security answer is incorrect. Please check and try again.');
        return;
      }

      // Security question verified! Move to Stage 2: Reset Password
      setMatchedAdmin(found);
      setForgotStage('reset');
    } finally {
      setIsLoading(false);
      setLoadingButtonKey(null);
    }
  };

  // Forgot Password: Stage 2 - Update Password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      setForgotError('New password must be at least 6 characters long.');
      return;
    }

    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('New passwords do not match. Please re-enter.');
      return;
    }

    setIsLoading(true);
    setLoadingButtonKey('update_password');
    const startTime = Date.now();

    try {
      // Update in localStorage
      const admins = getStoredAdmins();
      const updatedAdmins = admins.map(a => {
        if (a.email?.toLowerCase() === matchedAdmin.email?.toLowerCase()) {
          return { ...a, password: forgotNewPassword };
        }
        return a;
      });
      localStorage.setItem('kelvrin_registered_admins', JSON.stringify(updatedAdmins));

      const single = localStorage.getItem('kelvrin_registered_admin');
      if (single) {
        const parsed = JSON.parse(single);
        if (parsed.email?.toLowerCase() === matchedAdmin.email?.toLowerCase()) {
          parsed.password = forgotNewPassword;
          localStorage.setItem('kelvrin_registered_admin', JSON.stringify(parsed));
        }
      }

      const elapsed = Date.now() - startTime;
      if (elapsed < 1800) {
        await new Promise((resolve) => setTimeout(resolve, 1800 - elapsed));
      }

      // Pre-fill login
      setLoginUsername(matchedAdmin.username || matchedAdmin.email);
      setLoginPassword(forgotNewPassword);
      setLoginSuccessNotice(`Password updated successfully for ${matchedAdmin.fullName || matchedAdmin.username}! You can now sign in.`);

      // Reset forgot form state
      setForgotStage('verify');
      setForgotIdentifier('');
      setForgotAnswer('');
      setForgotNewPassword('');
      setForgotConfirmPassword('');
      setMatchedAdmin(null);

      // Rotate back to Login
      setRotationAngle(360);
    } finally {
      setIsLoading(false);
      setLoadingButtonKey(null);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex items-center pl-6 sm:pl-16 md:pl-28 lg:pl-36 xl:pl-48 pr-4 sm:pr-8 py-10 bg-[#020817] overflow-hidden select-none">
      {/* Background Image Layer with Reduced Brightness - REMAINS COMPLETELY STILL */}
      <div 
        className="absolute inset-0 bg-cover bg-no-repeat bg-center md:bg-right pointer-events-none transition-all duration-700"
        style={{
          backgroundImage: `url('/assets/kelvrin_login_bg.jpg')`,
          filter: 'brightness(0.78) contrast(1.06)',
        }}
      />

      {/* Subtle Atmospheric Gradient & Dark Overlays */}
      <div className="absolute inset-0 bg-[#020817]/25 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#020b1e]/96 via-[#03112c]/75 to-black/25 pointer-events-none" />

      {/* Top Left Logo & Brand Header */}
      <div className="absolute top-6 left-6 md:top-8 md:left-12 flex items-center gap-3 z-20">
        <svg width="32" height="32" viewBox="0 0 28 28" fill="none" className="shrink-0 drop-shadow-[0_0_12px_rgba(0,210,255,0.8)]">
          <path d="M4 6L14 12L24 6" stroke="#E040FB" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 12L14 18L24 12" stroke="#8B5CF6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 18L14 24L24 18" stroke="#00E5FF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-2xl font-black tracking-wider text-white uppercase font-sans drop-shadow-md">
          KELVRIN
        </span>
      </div>

      {/* 3D Flip Card Container */}
      <div 
        className={`relative z-10 w-full ${rotationAngle === 180 ? 'max-w-[540px] xl:max-w-[580px] my-auto' : 'max-w-[530px] xl:max-w-[570px] mt-8 sm:mt-10'} animate-in fade-in zoom-in-95 transition-all duration-500`}
        style={{ perspective: '1400px' }}
      >
        {/* Flip Inner Rotator */}
        <div 
          className="relative w-full"
          style={{
            transformStyle: 'preserve-3d',
            WebkitTransformStyle: 'preserve-3d',
            transform: `rotateY(${rotationAngle}deg)`,
            transition: 'transform 0.85s cubic-bezier(0.4, 0.2, 0.2, 1)',
          }}
        >
          
          {/* =========================================================================
              FACE A: (0° = Overview Hub | 360° = Login/CompanyCode | 720° = Reg Step 2)
              ========================================================================= */}
          <div 
            className={`w-full ${rotationAngle === 180 ? 'min-h-[740px] sm:min-h-[780px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden' : 'min-h-[580px] overflow-y-auto'} max-h-[95vh] rounded-[34px] bg-[#051332]/92 backdrop-blur-2xl border-[2.5px] border-[#00d2ff] p-6 sm:p-8 lg:p-9 flex flex-col justify-between transition-all duration-500`}
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              boxShadow: `
                0 20px 50px rgba(0, 0, 0, 0.75),
                0 0 40px rgba(0, 210, 255, 0.4),
                0 0 80px rgba(0, 150, 255, 0.15),
                inset 0 0 15px rgba(0, 210, 255, 0.2),
                inset 1px 1px 3px rgba(255, 255, 255, 0.35)
              `
            }}
          >
            {rotationAngle === 0 ? (
              /* ---------------- 0° FRONT FACE: OVERVIEW HUB ---------------- */
              <div className="flex flex-col justify-between h-full flex-1 relative">
                {/* ⓘ Login Methods & Authentication Guide Button (Visible ONLY on this first face) */}
                <button
                  type="button"
                  onClick={() => setShowLoginGuide(true)}
                  className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 z-30 h-8 w-8 rounded-full bg-[#030d24]/90 border border-[#00d2ff] text-[#00d2ff] hover:text-black hover:bg-[#00d2ff] flex items-center justify-center shadow-[0_0_15px_rgba(0,210,255,0.6)] hover:shadow-[0_0_25px_rgba(0,210,255,0.9)] transition-all cursor-pointer group"
                  title="Login Methods & Authentication Protocol"
                  aria-label="Login Methods & Authentication Protocol"
                >
                  <Info className="h-4 w-4 transition-transform group-hover:scale-110" />
                </button>
                <div>
                  <h1 className="text-4xl sm:text-[44px] font-black text-white text-center tracking-wider font-sans drop-shadow-md leading-tight">
                    KELVRIN
                  </h1>
                  <p className="text-base sm:text-lg font-medium text-slate-200 text-center mt-2">
                    Sovereign Agentic AI Workbench
                  </p>

                  <div className="flex items-center justify-center gap-3 text-xs sm:text-sm text-sky-200 font-semibold mt-2.5">
                    <span>Secure</span>
                    <span className="text-[#00d2ff] text-[10px] leading-none">•</span>
                    <span>Private</span>
                    <span className="text-[#00d2ff] text-[10px] leading-none">•</span>
                    <span>On-Premise</span>
                  </div>
                </div>

                {/* Isometric Architecture Graphic */}
                <div className="relative w-full h-56 sm:h-60 my-2 flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 440 240" fill="none">
                    <defs>
                      <filter id="neonCyanA" x="-25%" y="-25%" width="150%" height="150%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <linearGradient id="shieldGradA" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#00f5ff" />
                        <stop offset="100%" stopColor="#0284c7" />
                      </linearGradient>
                    </defs>

                    <path d="M 105 52 L 165 52 L 190 92" stroke="#00d2ff" strokeWidth="2.2" strokeOpacity="0.85" filter="url(#neonCyanA)" />
                    <path d="M 335 52 L 275 52 L 250 92" stroke="#00d2ff" strokeWidth="2.2" strokeOpacity="0.85" filter="url(#neonCyanA)" />
                    <path d="M 105 188 L 165 188 L 190 148" stroke="#00d2ff" strokeWidth="2.2" strokeOpacity="0.85" filter="url(#neonCyanA)" />
                    <path d="M 335 188 L 275 188 L 250 148" stroke="#00d2ff" strokeWidth="2.2" strokeOpacity="0.85" filter="url(#neonCyanA)" />

                    <polygon points="220,86 274,114 220,142 166,114" fill="#0c4a6e" stroke="#00d2ff" strokeWidth="1.8" filter="url(#neonCyanA)" opacity="0.95" />
                    <polygon points="166,114 220,142 220,162 166,134" fill="#075985" stroke="#0284c7" strokeWidth="1.2" />
                    <polygon points="220,142 274,114 274,134 220,162" fill="#0369a1" stroke="#0284c7" strokeWidth="1.2" />
                    <polygon points="220,98 266,122 220,146 174,122" fill="#0284c7" stroke="#00f0ff" strokeWidth="1.2" opacity="0.85" />
                    <polygon points="174,122 220,146 220,158 174,134" fill="#0369a1" />
                    <polygon points="220,146 266,122 266,134 220,158" fill="#075985" />
                    
                    <g transform="translate(220, 88) scale(1.3)">
                      <path d="M 0 -24 C 13 -24, 20 -19, 20 -7 C 20 9, 10 19, 0 24 C -10 19, -20 9, -20 -7 C -20 -19, -13 -24, 0 -24 Z" 
                            fill="url(#shieldGradA)" filter="url(#neonCyanA)" stroke="#ffffff" strokeWidth="1.6" opacity="0.95" />
                      <path d="M -5 -4 L -5 -8 C -5 -11, 5 -11, 5 -8 L 5 -4 M -7 -4 L 7 -4 C 8 -4, 8.5 -3.5, 8.5 -2 L 8.5 6 C 8.5 7.5, 7.5 8, 6.5 8 L -6.5 8 C -7.5 8, -8.5 7.5, -8.5 6 L -8.5 -2 C -8.5 -3.5, -8 -4, -7 -4 Z" 
                            fill="#ffffff" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  </svg>

                  {/* 4 Peripheral Node Badges */}
                  <div className="absolute top-1 left-4 flex flex-col items-center">
                    <div className="h-14 w-14 rounded-2xl bg-[#08183a]/90 border border-sky-400/50 p-2 flex items-center justify-center shadow-[0_0_12px_rgba(56,189,248,0.35)]">
                      <FileText className="h-5 w-5 text-sky-300" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-200 mt-1">Documents</span>
                  </div>

                  <div className="absolute top-1 right-4 flex flex-col items-center">
                    <div className="h-14 w-14 rounded-2xl bg-[#08183a]/90 border border-pink-400/50 p-2 flex items-center justify-center shadow-[0_0_12px_rgba(244,63,94,0.35)]">
                      <Brain className="h-5 w-5 text-pink-300" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-200 mt-1">AI Agents</span>
                  </div>

                  <div className="absolute bottom-1 left-4 flex flex-col items-center">
                    <div className="h-14 w-14 rounded-2xl bg-[#08183a]/90 border border-indigo-400/50 p-2 flex items-center justify-center shadow-[0_0_12px_rgba(129,140,248,0.35)]">
                      <Code2 className="h-5 w-5 text-indigo-300" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-200 mt-1">Code Lab</span>
                  </div>

                  <div className="absolute bottom-1 right-4 flex flex-col items-center">
                    <div className="h-14 w-14 rounded-2xl bg-[#08183a]/90 border border-purple-400/50 p-2 flex items-center justify-center shadow-[0_0_12px_rgba(168,85,247,0.35)]">
                      <BarChart3 className="h-5 w-5 text-purple-300" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-200 mt-1">Analytics</span>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-300 font-normal text-center my-2 tracking-wide">
                  Your data. Your infrastructure. Your AI.
                </p>

                <ShinyButton
                  type="button"
                  onClick={goToRoleSelect}
                  disabled={isLoading}
                  className="!w-full !h-14 sm:!h-15 !rounded-full !text-lg sm:!text-xl !font-bold tracking-wider !flex !items-center !justify-center gap-2.5 transition-all shadow-[0_0_20px_rgba(0,210,255,0.45)] hover:shadow-[0_0_35px_rgba(0,210,255,0.75)] cursor-pointer group"
                  style={{
                    '--shiny-cta-bg': '#06163b',
                    '--shiny-cta-bg-subtle': '#0c2660',
                    '--shiny-cta-fg': '#ffffff',
                    '--shiny-cta-highlight': '#00d2ff',
                    '--shiny-cta-highlight-subtle': '#8484ff',
                  } as React.CSSProperties}
                >
                  <span className="flex items-center justify-center gap-2.5 font-semibold select-none pointer-events-none">
                    <span className="drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]">Login</span>
                    <span className="text-xl font-bold transition-transform group-hover:translate-x-1.5 duration-200">→</span>
                  </span>
                </ShinyButton>
              </div>
            ) : rotationAngle === 720 ? (
              /* ---------------- 720° FACE A: REGISTRATION STEP 2 (SUPER ADMIN & RECOVERY) ---------------- */
              <form onSubmit={handleCompleteRegistration} className="flex flex-col justify-between h-full flex-1">
                <div className="flex flex-col items-center text-center">
                  <div className="flex items-center justify-center gap-2.5">
                    <ShieldCheck className="h-7 w-7 text-[#00d2ff]" />
                    <h2 className="text-2xl sm:text-[30px] font-black text-white tracking-wider font-sans drop-shadow-md">
                      KELVRIN
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-sky-300 mt-1">
                    Step 2 of 2: Super Admin Account Setup
                  </p>
                </div>

                <div className="rounded-[22px] bg-[#040f28]/85 border-[1.5px] border-[#00d2ff]/50 p-4 sm:p-5 my-2 shadow-[0_0_25px_rgba(0,210,255,0.18)] flex flex-col gap-2.5">
                  {regStep2Error && (
                    <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                      <span>{regStep2Error}</span>
                    </div>
                  )}

                  {/* Super Admin First & Last Name */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">First Name *</label>
                      <input
                        type="text"
                        placeholder="Super Admin name"
                        value={adminFirstName}
                        onChange={(e) => setAdminFirstName(e.target.value)}
                        className="w-full h-10 px-3.5 rounded-xl bg-[#071d47]/85 border border-[#00d2ff]/60 text-white placeholder:text-slate-400 text-xs sm:text-sm outline-none focus:border-[#4de5ff]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Last Name</label>
                      <input
                        type="text"
                        placeholder="Last Name"
                        value={adminLastName}
                        onChange={(e) => setAdminLastName(e.target.value)}
                        className="w-full h-10 px-3.5 rounded-xl bg-[#071d47]/85 border border-[#00d2ff]/60 text-white placeholder:text-slate-400 text-xs sm:text-sm outline-none focus:border-[#4de5ff]"
                      />
                    </div>
                  </div>

                  {/* Email & Phone Number (with Uniqueness Checks) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Email ID (Unique) *</label>
                      <input
                        type="email"
                        placeholder="admin@company.com"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        className="w-full h-10 px-3.5 rounded-xl bg-[#071d47]/85 border border-[#00d2ff]/60 text-white placeholder:text-slate-400 text-xs sm:text-sm outline-none focus:border-[#4de5ff]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center gap-1">
                        <Phone className="h-3 w-3 text-[#00d2ff]" />
                        <span>Phone Number (Unique) *</span>
                      </label>
                      <input
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={adminPhone}
                        onChange={(e) => setAdminPhone(e.target.value)}
                        className="w-full h-10 px-3.5 rounded-xl bg-[#071d47]/85 border border-[#00d2ff]/60 text-white placeholder:text-slate-400 text-xs sm:text-sm outline-none focus:border-[#4de5ff]"
                      />
                    </div>
                  </div>

                  {/* Password & Confirm Password */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Password *</label>
                      <div className="relative">
                        <input
                          type={showAdminPassword ? 'text' : 'password'}
                          placeholder="Min 6 characters"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          className="w-full h-10 pl-3.5 pr-8 rounded-xl bg-[#071d47]/85 border border-[#00d2ff]/60 text-white placeholder:text-slate-400 text-xs outline-none focus:border-[#4de5ff]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAdminPassword(!showAdminPassword)}
                          className="absolute right-2.5 top-2.5 text-sky-300 hover:text-white"
                        >
                          {showAdminPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Confirm Password *</label>
                      <div className="relative">
                        <input
                          type={showAdminConfirmPassword ? 'text' : 'password'}
                          placeholder="Repeat password"
                          value={adminConfirmPassword}
                          onChange={(e) => setAdminConfirmPassword(e.target.value)}
                          className="w-full h-10 pl-3.5 pr-8 rounded-xl bg-[#071d47]/85 border border-[#00d2ff]/60 text-white placeholder:text-slate-400 text-xs outline-none focus:border-[#4de5ff]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAdminConfirmPassword(!showAdminConfirmPassword)}
                          className="absolute right-2.5 top-2.5 text-sky-300 hover:text-white"
                        >
                          {showAdminConfirmPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Forgot Password Security Recovery Question Method */}
                  <div className="pt-1 border-t border-sky-400/20">
                    <label className="text-xs font-bold text-sky-200 block mb-1 flex items-center gap-1.5">
                      <Key className="h-3.5 w-3.5 text-[#00d2ff]" />
                      <span>Password Recovery Question *</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={securityQuestionType}
                        onChange={(e) => setSecurityQuestionType(e.target.value)}
                        className="w-full h-9 px-3 rounded-xl bg-[#071d47] border border-[#00d2ff]/60 text-white text-xs outline-none cursor-pointer"
                      >
                        {SECURITY_QUESTIONS.map((q) => (
                          <option key={q.id} value={q.id} className="bg-[#051438] text-white">
                            {q.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Your secret answer *"
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        className="w-full h-9 px-3.5 rounded-xl bg-[#071d47]/85 border border-[#00d2ff]/60 text-white placeholder:text-slate-400 text-xs outline-none focus:border-[#4de5ff]"
                      />
                    </div>
                  </div>

                  {/* Auto-Assigned Role: Super Admin Badge */}
                  <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-sky-500/15 border border-[#00d2ff]/40">
                    <span className="text-xs text-slate-300 font-medium">Role:</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/30 text-[#00f5ff] border border-[#00d2ff] shadow-[0_0_10px_rgba(0,210,255,0.4)]">
                      Super Admin (Auto Assigned)
                    </span>
                  </div>
                </div>

                {/* Submit & Back */}
                <div className="flex flex-col gap-2 mt-auto">
                  <ShinyButton
                    type="submit"
                    disabled={isLoading}
                    isLoading={loadingButtonKey === 'register_admin'}
                    loadingText="Creating Super Admin & Launching..."
                    className="!w-full !h-12 !rounded-full !text-base !font-bold tracking-wider !flex !items-center !justify-center gap-2 shadow-[0_0_20px_rgba(0,210,255,0.45)] hover:shadow-[0_0_35px_rgba(0,210,255,0.75)] cursor-pointer"
                    style={{
                      '--shiny-cta-bg': '#06163b',
                      '--shiny-cta-bg-subtle': '#0c2660',
                      '--shiny-cta-fg': '#ffffff',
                      '--shiny-cta-highlight': '#00d2ff',
                      '--shiny-cta-highlight-subtle': '#8484ff',
                    } as React.CSSProperties}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <span>Create Super Admin & Launch</span>
                      <span className="text-base font-bold">→</span>
                    </span>
                  </ShinyButton>

                  <button
                    type="button"
                    onClick={goToRegStep1}
                    className="w-full py-1 text-xs text-sky-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back to Organization Details</span>
                  </button>
                </div>
              </form>
            ) : (
              /* ---------------- 360° FACE A: SUPER ADMIN LOGIN (Image 1) OR COMPANY CODE (Image 2) ---------------- */
              selectedRole === 'Super Admin' ? (
                /* Super Admin Login with Strict Blank Validation (Image 1) */
                <form onSubmit={handleSuperAdminLoginSubmit} className="flex flex-col justify-between h-full flex-1">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex items-center justify-center gap-3">
                      <svg width="30" height="30" viewBox="0 0 28 28" fill="none" className="shrink-0 drop-shadow-[0_0_12px_rgba(0,210,255,0.8)]">
                        <path d="M4 6L14 12L24 6" stroke="#E040FB" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M4 12L14 18L24 12" stroke="#8B5CF6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M4 18L14 24L24 18" stroke="#00E5FF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <h2 className="text-3xl sm:text-[36px] font-black text-white tracking-wider font-sans drop-shadow-md">
                        KELVRIN
                      </h2>
                    </div>
                    <p className="text-sm sm:text-base font-medium text-slate-200 mt-1">
                      Sovereign Agent AI Workbench
                    </p>
                    <div className="flex items-center justify-center gap-3 text-xs sm:text-sm text-sky-200 font-semibold mt-1.5">
                      <span>Secure</span>
                      <span className="text-[#00d2ff] text-[10px] leading-none">•</span>
                      <span>Private</span>
                      <span className="text-[#00d2ff] text-[10px] leading-none">•</span>
                      <span>On-Premise</span>
                    </div>
                  </div>

                  {/* Inner Login Glass Card */}
                  <div className="rounded-[22px] bg-[#040f28]/80 border-[1.5px] border-[#00d2ff]/50 p-5 sm:p-6 my-4 shadow-[0_0_25px_rgba(0,210,255,0.18)] flex flex-col">
                    <h3 className="text-lg font-bold text-white tracking-wide mb-3">
                      Login
                    </h3>

                    {/* Success Notice if just registered or password updated */}
                    {loginSuccessNotice && (
                      <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span>{loginSuccessNotice}</span>
                      </div>
                    )}

                    {/* Error Notice */}
                    {loginError && (
                      <div className="mb-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>{loginError}</span>
                      </div>
                    )}

                    {/* Username Pill Input */}
                    <div className="w-full h-11 px-4 rounded-full bg-[#071d47]/85 border-[1.5px] border-[#00d2ff] flex items-center shadow-[0_0_12px_rgba(0,210,255,0.2)] focus-within:border-[#4de5ff] transition-all">
                      <User className="h-4 w-4 text-sky-300 shrink-0 mr-2.5" />
                      <input
                        type="text"
                        placeholder="Username"
                        value={loginUsername}
                        onChange={(e) => {
                          setLoginUsername(e.target.value);
                          setLoginError(null);
                        }}
                        className="w-full bg-transparent border-none outline-none text-white placeholder:text-slate-300 text-sm sm:text-base font-medium"
                      />
                    </div>

                    {/* Password Pill Input */}
                    <div className="w-full h-11 px-4 rounded-full bg-[#071d47]/85 border-[1.5px] border-[#00d2ff] flex items-center shadow-[0_0_12px_rgba(0,210,255,0.2)] focus-within:border-[#4de5ff] transition-all mt-3">
                      <Lock className="h-4 w-4 text-sky-300 shrink-0 mr-2.5" />
                      <input
                        type={showLoginPassword ? 'text' : 'password'}
                        placeholder="Password"
                        value={loginPassword}
                        onChange={(e) => {
                          setLoginPassword(e.target.value);
                          setLoginError(null);
                        }}
                        className="w-full bg-transparent border-none outline-none text-white placeholder:text-slate-300 text-sm sm:text-base font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="text-sky-300 hover:text-white transition-colors ml-2 focus:outline-none cursor-pointer"
                      >
                        {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Forgot password link */}
                    <button
                      type="button"
                      onClick={goToForgotPass}
                      className="text-xs sm:text-sm text-sky-300 hover:text-white transition-colors mt-2 ml-auto self-end cursor-pointer"
                    >
                      Forgot password?
                    </button>

                    {/* Capitalized New Registration Link */}
                    <button
                      type="button"
                      onClick={goToRegStep1}
                      className="text-xs sm:text-sm text-sky-300 hover:text-white font-semibold underline block mx-auto mt-3 cursor-pointer"
                    >
                      New Registration
                    </button>
                  </div>

                  {/* Actions: Sign In & Back */}
                  <div className="flex flex-col gap-2 mt-auto">
                    <ShinyButton
                      type="submit"
                      disabled={isLoading}
                      isLoading={loadingButtonKey === 'superadmin_signin' || (isLoading && !loadingButtonKey)}
                      loadingText="Authenticating Super Admin..."
                      className="!w-full !h-12 sm:!h-13 !rounded-full !text-base sm:!text-lg !font-bold tracking-wider !flex !items-center !justify-center gap-2 transition-all shadow-[0_0_20px_rgba(0,210,255,0.45)] hover:shadow-[0_0_35px_rgba(0,210,255,0.75)] cursor-pointer group"
                      style={{
                        '--shiny-cta-bg': '#06163b',
                        '--shiny-cta-bg-subtle': '#0c2660',
                        '--shiny-cta-fg': '#ffffff',
                        '--shiny-cta-highlight': '#00d2ff',
                        '--shiny-cta-highlight-subtle': '#8484ff',
                      } as React.CSSProperties}
                    >
                      <span className="flex items-center justify-center gap-2 select-none pointer-events-none">
                        <span>Sign In as Super Admin</span>
                        <span className="text-lg font-bold transition-transform group-hover:translate-x-1 duration-200">→</span>
                      </span>
                    </ShinyButton>

                    {/* Back to Role Selection */}
                    <button
                      type="button"
                      onClick={goToRoleSelect}
                      className="w-full py-1 text-xs sm:text-sm text-sky-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Back to Role Selection</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* Company Code Form for Other Roles (Image 2) */
                pendingApprovalUser ? (
                  /* =========================================================================
                     AUTHORIZATION PENDING: AWAITING SUPER ADMIN APPROVAL
                     ========================================================================= */
                  <div className="flex flex-col justify-between h-full flex-1 animate-in fade-in duration-300">
                    <div>
                      {/* Header */}
                      <div className="flex flex-col items-center text-center mb-4">
                        <div className="relative mb-2.5">
                          {pendingApprovalUser.avatarUrl ? (
                            <img 
                              src={pendingApprovalUser.avatarUrl} 
                              alt={pendingApprovalUser.fullName}
                              className="h-16 w-16 rounded-full border-2 border-amber-400 object-cover shadow-[0_0_20px_rgba(245,158,11,0.6)]"
                            />
                          ) : (
                            <div className="h-14 w-14 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 text-white font-bold text-xl flex items-center justify-center border-2 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.6)]">
                              {(pendingApprovalUser.fullName || pendingApprovalUser.email || 'U')[0].toUpperCase()}
                            </div>
                          )}
                          <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-[#040f28] border border-amber-400 flex items-center justify-center shadow-sm">
                            <Clock className="h-3 w-3 text-amber-300 animate-spin" />
                          </span>
                        </div>
                        <h2 className="text-2xl font-bold text-white tracking-wide">
                          Authorization Pending
                        </h2>
                        <p className="text-xs text-amber-300 font-semibold mt-0.5">
                          Super Admin Approval Required
                        </p>
                      </div>

                      {/* Request Details Card */}
                      <div className="rounded-[20px] bg-[#040f28]/90 border-[1.5px] border-amber-400/50 p-4 space-y-2.5 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
                        <div className="flex items-center justify-between pb-2 border-b border-amber-400/20">
                          <span className="text-[11px] text-slate-300 font-medium">Enclave Access Request</span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/40">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                            Pending
                          </span>
                        </div>

                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Operator:</span>
                            <span className="font-semibold text-white truncate max-w-[170px]">{pendingApprovalUser.fullName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Email:</span>
                            <span className="font-mono text-cyan-300 truncate max-w-[170px]">{pendingApprovalUser.email}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Requested Role:</span>
                            <span className="font-semibold text-amber-200">{pendingApprovalUser.role}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Company Code:</span>
                            <span className="font-mono font-bold text-cyan-300">{pendingApprovalUser.companyCode}</span>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-300/90 leading-relaxed pt-2 border-t border-amber-400/20">
                          Your request has been submitted to the Super Admin. The Super Admin must approve your access from the Sovereign Dashboard before you can access the workbench.
                        </p>
                      </div>

                      {approvalCheckNotice && (
                        <div className="mt-3 p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-400/50 text-cyan-200 text-xs text-center animate-in fade-in">
                          {approvalCheckNotice}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 mt-auto pt-4">
                      <button
                        type="button"
                        onClick={handleCheckApprovalStatus}
                        className="w-full h-11 rounded-full bg-gradient-to-r from-amber-400 via-cyan-400 to-blue-500 hover:from-amber-300 hover:to-blue-400 text-black font-bold text-xs shadow-[0_0_20px_rgba(0,210,255,0.4)] flex items-center justify-center gap-2 cursor-pointer transition-all uppercase tracking-wider"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>Check Approval Status</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPendingApprovalUser(null);
                          setApprovalCheckNotice(null);
                        }}
                        className="w-full py-1 text-xs text-sky-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>Back to Login</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleCompanyCodeSubmit} className="flex flex-col justify-between h-full flex-1">
                    <div className="flex flex-col items-center text-center">
                      <div className="flex items-center justify-center gap-3">
                        <svg width="30" height="30" viewBox="0 0 28 28" fill="none" className="shrink-0 drop-shadow-[0_0_12px_rgba(0,210,255,0.8)]">
                          <path d="M4 6L14 12L24 6" stroke="#E040FB" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M4 12L14 18L24 12" stroke="#8B5CF6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M4 18L14 24L24 18" stroke="#00E5FF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <h2 className="text-3xl sm:text-[36px] font-black text-white tracking-wider font-sans drop-shadow-md">
                          KELVRIN
                        </h2>
                      </div>
                      <p className="text-sm sm:text-base font-medium text-slate-200 mt-1">
                        Sovereign Agent AI Workbench
                      </p>
                      <div className="flex items-center justify-center gap-3 text-xs sm:text-sm text-sky-200 font-semibold mt-1.5">
                        <span>Secure</span>
                        <span className="text-[#00d2ff] text-[10px] leading-none">•</span>
                        <span>Private</span>
                        <span className="text-[#00d2ff] text-[10px] leading-none">•</span>
                        <span>On-Premise</span>
                      </div>
                    </div>

                    {/* Unverified Alert Banner */}
                    {unverifiedCodeNotice && (
                      <div className="my-2 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/50 text-rose-200 flex items-start gap-2.5 shadow-[0_0_20px_rgba(244,63,94,0.25)] animate-in fade-in">
                        <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                        <div className="flex flex-col text-left">
                          <span className="text-xs font-black text-rose-300 uppercase tracking-wider">✕ Unverified Company Code</span>
                          <span className="text-xs text-rose-200/90 mt-0.5 leading-relaxed">{unverifiedCodeNotice}</span>
                        </div>
                      </div>
                    )}

                    {/* Verified Company Banner */}
                    {verifiedCompany && (
                      <div className="my-2 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-400/60 text-emerald-200 flex items-center gap-3 shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-in fade-in">
                        <div className="h-9 w-9 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                          <ShieldCheck className="h-5 w-5 text-emerald-300" />
                        </div>
                        <div className="flex flex-col text-left min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">✓ Verified Organization</span>
                          </div>
                          <span className="text-sm font-bold text-white truncate">{verifiedCompany.name}</span>
                          <span className="text-[11px] text-emerald-200/80 font-mono truncate">
                            Code: {verifiedCompany.code} {verifiedCompany.district ? `• ${verifiedCompany.district}` : ''} {verifiedCompany.country ? `(${verifiedCompany.country})` : ''}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Generic Login Error if any and not unverified notice */}
                    {loginError && !unverifiedCodeNotice && (
                      <div className="my-2 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                        <span>{loginError}</span>
                      </div>
                    )}

                    <div className="rounded-[22px] bg-[#040f28]/80 border-[1.5px] border-[#00d2ff]/50 p-5 my-3 shadow-[0_0_25px_rgba(0,210,255,0.18)] flex flex-col">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-white tracking-wide">
                          Company Code
                        </h3>
                        <span className="text-[10px] text-cyan-300 font-medium">Role: {selectedRole}</span>
                      </div>

                      <div className="w-full h-11 px-4 rounded-full bg-[#071d47]/85 border-[1.5px] border-[#00d2ff] flex items-center shadow-[0_0_15px_rgba(0,210,255,0.25)] focus-within:border-[#4de5ff] transition-all mt-2.5">
                        <div className="h-5 w-5 rounded-full border border-sky-400/80 bg-sky-500/20 flex items-center justify-center shadow-[0_0_10px_rgba(0,210,255,0.8)] shrink-0 mr-3">
                          <div className="h-2 w-2 rounded-full bg-[#00e5ff] shadow-[0_0_6px_#00e5ff]" />
                        </div>
                        <input
                          type="text"
                          placeholder="Enter Company Code"
                          value={companyCodeInput}
                          onChange={(e) => {
                            setCompanyCodeInput(e.target.value);
                            setUnverifiedCodeNotice(null);
                            setVerifiedCompany(null);
                            setLoginError(null);
                          }}
                          className="w-full bg-transparent border-none outline-none text-white placeholder:text-slate-300 text-sm font-medium uppercase font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      <ShinyButton
                        type="submit"
                        disabled={isLoading}
                        isLoading={loadingButtonKey === 'verify_company_code'}
                        loadingText="Verifying Company Code..."
                        className="!w-full !h-12 sm:!h-13 !rounded-full !text-base sm:!text-lg !font-bold tracking-wider !flex !items-center !justify-center gap-2 transition-all shadow-[0_0_20px_rgba(0,210,255,0.45)] hover:shadow-[0_0_35px_rgba(0,210,255,0.75)] cursor-pointer group"
                        style={{
                          '--shiny-cta-bg': '#06163b',
                          '--shiny-cta-bg-subtle': '#0c2660',
                          '--shiny-cta-fg': '#ffffff',
                          '--shiny-cta-highlight': '#00d2ff',
                          '--shiny-cta-highlight-subtle': '#8484ff',
                        } as React.CSSProperties}
                      >
                        <span className="flex items-center justify-center gap-2 select-none pointer-events-none">
                          <span>Verify & Enter as {selectedRole}</span>
                          <span className="text-base font-bold transition-transform group-hover:translate-x-1 duration-200">→</span>
                        </span>
                      </ShinyButton>

                      <button
                        type="button"
                        onClick={goToRoleSelect}
                        className="w-full py-1 text-xs text-sky-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>Back to Role Selection</span>
                      </button>
                    </div>
                  </form>
                )
              )
            )}
          </div>

          {/* =========================================================================
              FACE B: (180° = ROLE SELECTION | 540° = REG STEP 1 OR FORGOT PASSWORD)
              ========================================================================= */}
          <div 
            className={`absolute inset-0 w-full h-full max-h-[95vh] ${rotationAngle === 180 ? 'overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden' : 'overflow-y-auto'} rounded-[34px] bg-[#051332]/92 backdrop-blur-2xl border-[2.5px] border-[#00d2ff] p-6 sm:p-8 lg:p-9 flex flex-col justify-between transition-all duration-500`}
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              boxShadow: `
                0 20px 50px rgba(0, 0, 0, 0.75),
                0 0 40px rgba(0, 210, 255, 0.4),
                0 0 80px rgba(0, 150, 255, 0.15),
                inset 0 0 15px rgba(0, 210, 255, 0.2),
                inset 1px 1px 3px rgba(255, 255, 255, 0.35)
              `
            }}
          >
            {faceBMode === 'forgot_password' ? (
              /* ---------------- 540° FACE B: FORGOT PASSWORD RECOVERY ---------------- */
              <div className="flex flex-col justify-between h-full flex-1">
                <div className="flex flex-col items-center text-center">
                  <div className="flex items-center justify-center gap-2.5">
                    <Key className="h-7 w-7 text-[#00d2ff]" />
                    <h2 className="text-2xl sm:text-[30px] font-black text-white tracking-wider font-sans drop-shadow-md">
                      KELVRIN
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-sky-300 mt-1">
                    Super Admin Password Recovery
                  </p>
                </div>

                <div className="rounded-[22px] bg-[#040f28]/85 border-[1.5px] border-[#00d2ff]/50 p-4 sm:p-5 my-3 shadow-[0_0_25px_rgba(0,210,255,0.18)] flex flex-col gap-3">
                  {forgotError && (
                    <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                      <span>{forgotError}</span>
                    </div>
                  )}

                  {forgotStage === 'verify' ? (
                    /* Stage 1: Verify Email/Username & Security Answer */
                    <form onSubmit={handleVerifySecurityAnswer} className="flex flex-col gap-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">
                          Email or Username *
                        </label>
                        <input
                          type="text"
                          placeholder="Registered Super Admin username or email"
                          value={forgotIdentifier}
                          onChange={(e) => setForgotIdentifier(e.target.value)}
                          className="w-full h-10 px-3.5 rounded-xl bg-[#071d47]/85 border border-[#00d2ff]/60 text-white placeholder:text-slate-400 text-xs sm:text-sm outline-none focus:border-[#4de5ff]"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center gap-1">
                          <HelpCircle className="h-3.5 w-3.5 text-[#00d2ff]" />
                          <span>Secret Security Recovery Answer *</span>
                        </label>
                        <p className="text-[11px] text-slate-400 mb-1.5">
                          Enter the answer to your chosen favorite place, food, or thing set during registration.
                        </p>
                        <input
                          type="text"
                          placeholder="Your security recovery answer"
                          value={forgotAnswer}
                          onChange={(e) => setForgotAnswer(e.target.value)}
                          className="w-full h-10 px-3.5 rounded-xl bg-[#071d47]/85 border border-[#00d2ff]/60 text-white placeholder:text-slate-400 text-xs sm:text-sm outline-none focus:border-[#4de5ff]"
                        />
                      </div>

                      <ShinyButton
                        type="submit"
                        isLoading={loadingButtonKey === 'verify_security_answer'}
                        loadingText="Verifying Answer..."
                        className="!w-full !h-11 !rounded-full !text-sm !font-bold tracking-wider !flex !items-center !justify-center gap-2 shadow-[0_0_15px_rgba(0,210,255,0.45)] mt-2 cursor-pointer"
                        style={{
                          '--shiny-cta-bg': '#06163b',
                          '--shiny-cta-bg-subtle': '#0c2660',
                          '--shiny-cta-fg': '#ffffff',
                          '--shiny-cta-highlight': '#00d2ff',
                          '--shiny-cta-highlight-subtle': '#8484ff',
                        } as React.CSSProperties}
                      >
                        <span className="flex items-center justify-center gap-1.5">
                          <span>Verify Security Answer</span>
                          <span className="text-base font-bold">→</span>
                        </span>
                      </ShinyButton>
                    </form>
                  ) : (
                    /* Stage 2: Enter New Password */
                    <form onSubmit={handleUpdatePassword} className="flex flex-col gap-3 animate-in fade-in duration-300">
                      <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span>Security verified for {matchedAdmin?.fullName || matchedAdmin?.username}!</span>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">
                          New Password (Min 6 characters) *
                        </label>
                        <div className="relative">
                          <input
                            type={showForgotNewPassword ? 'text' : 'password'}
                            placeholder="Enter new password"
                            value={forgotNewPassword}
                            onChange={(e) => setForgotNewPassword(e.target.value)}
                            className="w-full h-10 pl-3.5 pr-8 rounded-xl bg-[#071d47]/85 border border-[#00d2ff]/60 text-white placeholder:text-slate-400 text-xs sm:text-sm outline-none focus:border-[#4de5ff]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowForgotNewPassword(!showForgotNewPassword)}
                            className="absolute right-2.5 top-2.5 text-sky-300 hover:text-white"
                          >
                            {showForgotNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">
                          Confirm New Password *
                        </label>
                        <div className="relative">
                          <input
                            type={showForgotConfirmPassword ? 'text' : 'password'}
                            placeholder="Repeat new password"
                            value={forgotConfirmPassword}
                            onChange={(e) => setForgotConfirmPassword(e.target.value)}
                            className="w-full h-10 pl-3.5 pr-8 rounded-xl bg-[#071d47]/85 border border-[#00d2ff]/60 text-white placeholder:text-slate-400 text-xs sm:text-sm outline-none focus:border-[#4de5ff]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowForgotConfirmPassword(!showForgotConfirmPassword)}
                            className="absolute right-2.5 top-2.5 text-sky-300 hover:text-white"
                          >
                            {showForgotConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <ShinyButton
                        type="submit"
                        isLoading={loadingButtonKey === 'update_password'}
                        loadingText="Updating Password..."
                        className="!w-full !h-11 !rounded-full !text-sm !font-bold tracking-wider !flex !items-center !justify-center gap-2 shadow-[0_0_15px_rgba(0,210,255,0.45)] mt-2 cursor-pointer"
                        style={{
                          '--shiny-cta-bg': '#06163b',
                          '--shiny-cta-bg-subtle': '#0c2660',
                          '--shiny-cta-fg': '#ffffff',
                          '--shiny-cta-highlight': '#00d2ff',
                          '--shiny-cta-highlight-subtle': '#8484ff',
                        } as React.CSSProperties}
                      >
                        <span className="flex items-center justify-center gap-1.5">
                          <span>Update Password & Return to Login</span>
                          <span className="text-base font-bold">→</span>
                        </span>
                      </ShinyButton>
                    </form>
                  )}
                </div>

                <div className="mt-auto">
                  <button
                    type="button"
                    onClick={goToLoginForm}
                    className="w-full py-1 text-xs text-sky-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back to Super Admin Login</span>
                  </button>
                </div>
              </div>
            ) : faceBMode === 'reg_step1' ? (
              /* ---------------- 540° FACE B: REGISTRATION STEP 1 (COMPANY PROFILE & LOCATION) ---------------- */
              <div className="flex flex-col justify-between h-full flex-1">
                <div className="flex flex-col items-center text-center">
                  <div className="flex items-center justify-center gap-2.5">
                    <Building2 className="h-7 w-7 text-[#00d2ff]" />
                    <h2 className="text-2xl sm:text-[30px] font-black text-white tracking-wider font-sans drop-shadow-md">
                      KELVRIN
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-sky-300 mt-1">
                    Step 1 of 2: Organization & Location Profile
                  </p>
                </div>

                <div className="rounded-[22px] bg-[#040f28]/85 border-[1.5px] border-[#00d2ff]/50 p-4 sm:p-5 my-2.5 shadow-[0_0_25px_rgba(0,210,255,0.18)] flex flex-col gap-3">
                  {regStep1Error && (
                    <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                      <span>{regStep1Error}</span>
                    </div>
                  )}

                  {/* Company Logo Upload with Crop Preview & Uniqueness */}
                  <div className="flex items-center gap-3.5 pb-2 border-b border-sky-400/20">
                    <div className="relative h-14 w-14 rounded-full border-2 border-[#00d2ff] bg-[#06183e] flex items-center justify-center shadow-[0_0_12px_rgba(0,210,255,0.4)] overflow-hidden shrink-0">
                      {regLogoDataUrl ? (
                        <img src={regLogoDataUrl} alt="Company Logo" className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="h-6 w-6 text-sky-400" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <span className="text-xs font-semibold text-white">Company Logo (Unique)</span>
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleLogoFileChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-sky-200 bg-sky-500/20 border border-sky-400/40 hover:bg-sky-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Upload className="h-3 w-3" />
                          <span>{regLogoDataUrl ? 'Change' : 'Upload'}</span>
                        </button>
                        {regLogoDataUrl && (
                          <button
                            type="button"
                            onClick={() => setIsCropModalOpen(true)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-cyan-200 bg-cyan-500/20 border border-cyan-400/40 hover:bg-cyan-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Crop className="h-3 w-3" />
                            <span>Crop / Adjust</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Company Name & Code with Uniqueness */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Company Name (Unique) *</label>
                      <input
                        type="text"
                        placeholder="e.g. Acme Defense Tech"
                        value={regCompanyName}
                        onChange={(e) => {
                          setRegCompanyName(e.target.value);
                          setRegStep1Error(null);
                        }}
                        className="w-full h-10 px-3.5 rounded-xl bg-[#071d47]/85 border border-[#00d2ff]/60 text-white placeholder:text-slate-400 text-xs sm:text-sm outline-none focus:border-[#4de5ff]"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-300">Company Code (Unique) *</label>
                        <button
                          type="button"
                          onClick={handleAutoGenerateCompanyCode}
                          className="text-[10px] text-sky-300 hover:text-white underline cursor-pointer"
                        >
                          Auto Generate
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. KELV-2026"
                        value={regCompanyCode}
                        onChange={(e) => {
                          setRegCompanyCode(e.target.value.toUpperCase());
                          setRegStep1Error(null);
                        }}
                        className="w-full h-10 px-3.5 rounded-xl bg-[#071d47]/85 border border-[#00d2ff]/60 text-white placeholder:text-slate-400 text-xs sm:text-sm uppercase font-mono outline-none focus:border-[#4de5ff]"
                      />
                    </div>
                  </div>

                  {/* Location Cascades: Country -> State -> District */}
                  <div className="pt-1">
                    <label className="text-xs font-bold text-sky-200 block mb-1.5 flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-[#00d2ff]" />
                      <span>Company Location Cascade</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {/* Country */}
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">Country</span>
                        <select
                          value={regCountry}
                          onChange={handleCountryChange}
                          className="w-full h-9 px-2.5 rounded-xl bg-[#071d47] border border-[#00d2ff]/60 text-white text-xs outline-none cursor-pointer"
                        >
                          {COUNTRIES.map((c) => (
                            <option key={c.code} value={c.code} className="bg-[#051438] text-white">
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* State */}
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">State</span>
                        <select
                          value={regState}
                          onChange={handleStateChange}
                          className="w-full h-9 px-2.5 rounded-xl bg-[#071d47] border border-[#00d2ff]/60 text-white text-xs outline-none cursor-pointer"
                        >
                          {statesList.map((s) => (
                            <option key={s.code} value={s.code} className="bg-[#051438] text-white">
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* District - Supports all 38 TN districts */}
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">District (All 38 TN)</span>
                        <select
                          value={regDistrict}
                          onChange={(e) => setRegDistrict(e.target.value)}
                          className="w-full h-9 px-2.5 rounded-xl bg-[#071d47] border border-[#00d2ff]/60 text-white text-xs outline-none cursor-pointer"
                        >
                          {districtsList.map((d) => (
                            <option key={d} value={d} className="bg-[#051438] text-white">
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Continue & Back Actions */}
                <div className="flex flex-col gap-2 mt-auto">
                  <ShinyButton
                    type="button"
                    onClick={goToRegStep2}
                    className="!w-full !h-12 !rounded-full !text-base !font-bold tracking-wider !flex !items-center !justify-center gap-2 shadow-[0_0_20px_rgba(0,210,255,0.45)] hover:shadow-[0_0_35px_rgba(0,210,255,0.75)] cursor-pointer"
                    style={{
                      '--shiny-cta-bg': '#06163b',
                      '--shiny-cta-bg-subtle': '#0c2660',
                      '--shiny-cta-fg': '#ffffff',
                      '--shiny-cta-highlight': '#00d2ff',
                      '--shiny-cta-highlight-subtle': '#8484ff',
                    } as React.CSSProperties}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <span>Continue to Admin Setup</span>
                      <span className="text-base font-bold">→</span>
                    </span>
                  </ShinyButton>

                  <button
                    type="button"
                    onClick={goToLoginForm}
                    className="w-full py-1 text-xs text-sky-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back to Super Admin Login</span>
                  </button>
                </div>
              </div>
            ) : faceBMode === 'role_login' ? (
              /* ---------------- 540° FACE B: ROLE LOGIN FORM (EXACT REPLICA OF IMAGE 2) ---------------- */
              <form onSubmit={handleRoleLoginSubmit} className="flex flex-col justify-between h-full flex-1 animate-in fade-in duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="flex items-center justify-center gap-3">
                    <svg width="32" height="32" viewBox="0 0 28 28" fill="none" className="shrink-0 drop-shadow-[0_0_12px_rgba(0,210,255,0.85)]">
                      <path d="M4 6L14 12L24 6" stroke="#E040FB" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 12L14 18L24 12" stroke="#8B5CF6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 18L14 24L24 18" stroke="#00E5FF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <h2 className="text-3xl sm:text-[36px] font-black text-white tracking-wider font-sans drop-shadow-md">
                      KELVRIN
                    </h2>
                  </div>
                  <p className="text-sm sm:text-base font-medium text-slate-200 mt-1">
                    Sovereign Agent AI Workbench
                  </p>
                  <div className="flex items-center justify-center gap-3 text-xs sm:text-sm text-sky-200 font-semibold mt-1.5">
                    <span>Secure</span>
                    <span className="text-[#00d2ff] text-[10px] leading-none">•</span>
                    <span>Private</span>
                    <span className="text-[#00d2ff] text-[10px] leading-none">•</span>
                    <span>On-Premise</span>
                  </div>
                </div>

                {/* Sub-card: Login (Image 2) */}
                <div className="rounded-[24px] bg-[#040f28]/85 border-[1.5px] border-[#00d2ff] p-5 my-2 shadow-[0_0_25px_rgba(0,210,255,0.22)] flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                      Login
                    </h3>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-300 bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-500/40 shadow-xs">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>Verified • {companyCodeInput.toUpperCase()}</span>
                    </span>
                  </div>

                  {authorizedEmail && (
                    <div className="flex items-center justify-between text-[11px] px-3 py-1.5 rounded-xl bg-sky-950/70 border border-[#00d2ff]/40 text-sky-200 shadow-xs">
                      <span className="font-semibold text-slate-300">Permitted Account:</span>
                      <span className="font-mono text-[#00d2ff] font-bold truncate max-w-[190px]">{authorizedEmail}</span>
                    </div>
                  )}

                  {roleLoginError && (
                    <div className="p-3 rounded-xl bg-rose-950/90 border-2 border-rose-500 text-rose-100 text-xs flex items-start gap-2 shadow-[0_0_20px_rgba(244,63,94,0.4)] animate-in fade-in duration-200">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                      <span className="font-semibold leading-relaxed">{roleLoginError}</span>
                    </div>
                  )}

                  {/* Username Input Pill (Image 2) */}
                  <div className="w-full h-11 px-4 rounded-full bg-[#071d47]/90 border border-[#00d2ff]/80 flex items-center shadow-[0_0_12px_rgba(0,210,255,0.2)] focus-within:border-[#4de5ff] focus-within:shadow-[0_0_18px_rgba(0,210,255,0.4)] transition-all">
                    <User className="h-4 w-4 text-[#00d2ff] shrink-0 mr-2.5" />
                    <input
                      type="text"
                      placeholder="Enter Username"
                      value={roleLoginUsername}
                      onChange={(e) => setRoleLoginUsername(e.target.value)}
                      className="w-full bg-transparent border-none outline-none text-white placeholder:text-slate-300 text-xs sm:text-sm font-medium"
                      required
                    />
                  </div>

                  {/* Password Input Pill (Image 2) */}
                  <div className="w-full h-11 px-4 rounded-full bg-[#071d47]/90 border border-[#00d2ff]/80 flex items-center shadow-[0_0_12px_rgba(0,210,255,0.2)] focus-within:border-[#4de5ff] focus-within:shadow-[0_0_18px_rgba(0,210,255,0.4)] transition-all">
                    <Lock className="h-4 w-4 text-[#00d2ff] shrink-0 mr-2.5" />
                    <input
                      type={showRoleLoginPassword ? 'text' : 'password'}
                      placeholder="Enter Password"
                      value={roleLoginPassword}
                      onChange={(e) => setRoleLoginPassword(e.target.value)}
                      className="w-full bg-transparent border-none outline-none text-white placeholder:text-slate-300 text-xs sm:text-sm font-medium"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowRoleLoginPassword(!showRoleLoginPassword)}
                      className="text-sky-300 hover:text-white transition-colors ml-2"
                    >
                      {showRoleLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* "or" separator (Image 2) */}
                  <div className="flex items-center my-0.5">
                    <div className="flex-1 h-[1px] bg-slate-700/60" />
                    <span className="px-2.5 text-[11px] text-slate-300 font-medium">or</span>
                    <div className="flex-1 h-[1px] bg-slate-700/60" />
                  </div>

                  {/* Continue with Google button (Image 2) */}
                  <button
                    type="button"
                    onClick={handleContinueWithGoogle}
                    disabled={isLoading}
                    className="w-full h-11 px-4 rounded-full bg-[#071d47]/90 hover:bg-[#0b275e] border border-[#00d2ff] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-[0_0_15px_rgba(0,210,255,0.25)] hover:shadow-[0_0_20px_rgba(0,210,255,0.4)] transition-all cursor-pointer disabled:opacity-80"
                  >
                    {loadingButtonKey === 'google_signin' ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-white shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Connecting with Google...</span>
                      </span>
                    ) : (
                      <>
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                        <span>Continue with Google</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 mt-auto">
                  <ShinyButton
                    type="submit"
                    disabled={isLoading}
                    isLoading={loadingButtonKey === 'role_signin'}
                    loadingText={`Signing In as ${selectedRole}...`}
                    className="!w-full !h-12 !rounded-full !text-base !font-bold tracking-wider !flex !items-center !justify-center gap-2 shadow-[0_0_20px_rgba(0,210,255,0.45)] hover:shadow-[0_0_35px_rgba(0,210,255,0.75)] cursor-pointer group"
                    style={{
                      '--shiny-cta-bg': '#06163b',
                      '--shiny-cta-bg-subtle': '#0c2660',
                      '--shiny-cta-fg': '#ffffff',
                      '--shiny-cta-highlight': '#00d2ff',
                      '--shiny-cta-highlight-subtle': '#8484ff',
                    } as React.CSSProperties}
                  >
                    <span className="flex items-center justify-center gap-2 select-none pointer-events-none">
                      <span>Sign In as {selectedRole}</span>
                      <span className="text-base font-bold transition-transform group-hover:translate-x-1 duration-200">→</span>
                    </span>
                  </ShinyButton>

                  {/* Direct Access Request button for non-registered users */}
                  <button
                    type="button"
                    onClick={handleRequestAccessDirectly}
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-full border border-[#00d2ff]/50 bg-[#071d47]/80 hover:bg-[#0c2660] text-sky-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs hover:shadow-[0_0_15px_rgba(0,210,255,0.3)] disabled:opacity-50"
                  >
                    {loadingButtonKey === 'request_access_direct' ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-3.5 w-3.5 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Submitting Request to Super Admin...</span>
                      </span>
                    ) : (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5 text-[#00d2ff]" />
                        <span>Request Access as {selectedRole}</span>
                      </>
                    )}
                  </button>

                  {/* Switch Role / Back to Role Selection */}
                  <button
                    type="button"
                    onClick={goToRoleSelect}
                    className="w-full py-1.5 text-xs text-sky-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Switch Role / Back to Role Selection</span>
                  </button>

                  {/* Change Company Code */}
                  <button
                    type="button"
                    onClick={() => {
                      setVerifiedCompany(null);
                      try {
                        localStorage.removeItem('kelvrin_company');
                      } catch {}
                      setRotationAngle(360);
                    }}
                    className="w-full py-1 text-xs text-slate-400 hover:text-sky-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Change Company Code</span>
                  </button>
                </div>
              </form>
            ) : (
              /* ---------------- 180° FACE B: ROLE SELECTION (Reference Image) ---------------- */
              <div className="flex flex-col justify-between h-full flex-1">
                <div className="flex flex-col items-center text-center">
                  <div className="flex items-center justify-center gap-3">
                    <svg width="30" height="30" viewBox="0 0 28 28" fill="none" className="shrink-0 drop-shadow-[0_0_12px_rgba(0,210,255,0.8)]">
                      <path d="M4 6L14 12L24 6" stroke="#E040FB" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 12L14 18L24 12" stroke="#8B5CF6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 18L14 24L24 18" stroke="#00E5FF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <h2 className="text-3xl sm:text-[36px] font-black text-white tracking-wider font-sans drop-shadow-md">
                      KELVRIN
                    </h2>
                  </div>
                  <p className="text-sm sm:text-base font-medium text-slate-200 mt-1">
                    Sovereign Agent AI Workbench
                  </p>
                  <div className="flex items-center justify-center gap-3 text-xs sm:text-sm text-sky-200 font-semibold mt-1.5">
                    <span>Secure</span>
                    <span className="text-[#00d2ff] text-[10px] leading-none">•</span>
                    <span>Private</span>
                    <span className="text-[#00d2ff] text-[10px] leading-none">•</span>
                    <span>On-Premise</span>
                  </div>
                </div>

                {/* Role Selector Card */}
                <div className="rounded-[22px] bg-[#040f28]/80 border-[1.5px] border-[#00d2ff]/50 p-4 sm:p-5 my-2 shadow-[0_0_20px_rgba(0,210,255,0.15)] flex flex-col justify-center">
                  <label className="text-base sm:text-lg font-bold text-white block">
                    Role
                  </label>

                  <button
                    type="button"
                    onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                    className="w-full mt-2 h-11 px-4 rounded-xl bg-[#092254]/90 border border-[#00d2ff] flex items-center justify-between text-white font-semibold text-sm sm:text-base shadow-[0_0_12px_rgba(0,210,255,0.25)] hover:border-[#4de5ff] transition-all cursor-pointer"
                  >
                    <span>{selectedRole || 'User'}</span>
                    {isRoleDropdownOpen ? (
                      <ChevronUp className="h-4 w-4 text-[#00d2ff]" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-[#00d2ff]" />
                    )}
                  </button>

                  {isRoleDropdownOpen && (
                    <div className="mt-2.5 rounded-xl border border-sky-400/35 bg-[#05173e]/95 backdrop-blur-xl p-1.5 space-y-1 shadow-[0_10px_25px_rgba(0,0,0,0.7),0_0_15px_rgba(0,210,255,0.2)] animate-in fade-in zoom-in-95 duration-200">
                      {ROLES_LIST.map((role) => {
                        const isSelected = selectedRole === role;
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() => setSelectedRole(role)}
                            className={`w-full text-left px-3.5 py-2 rounded-lg text-sm sm:text-[15px] font-medium transition-all flex items-center justify-between cursor-pointer ${
                              isSelected
                                ? 'bg-sky-500/30 text-white border border-[#00d2ff]/60 shadow-[0_0_12px_rgba(0,210,255,0.35)]'
                                : 'text-slate-200 hover:text-white hover:bg-sky-500/15'
                            }`}
                          >
                            <span>{role}</span>
                            {isSelected && <Check className="h-4 w-4 text-[#00d2ff]" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <ShinyButton
                    type="button"
                    onClick={goToLoginForm}
                    disabled={isLoading}
                    className="!w-full !h-12 sm:!h-13 !rounded-full !text-base sm:!text-lg !font-bold tracking-wider !flex !items-center !justify-center gap-2 transition-all shadow-[0_0_20px_rgba(0,210,255,0.45)] hover:shadow-[0_0_35px_rgba(0,210,255,0.75)] cursor-pointer group"
                    style={{
                      '--shiny-cta-bg': '#06163b',
                      '--shiny-cta-bg-subtle': '#0c2660',
                      '--shiny-cta-fg': '#ffffff',
                      '--shiny-cta-highlight': '#00d2ff',
                      '--shiny-cta-highlight-subtle': '#8484ff',
                    } as React.CSSProperties}
                  >
                    <span className="flex items-center justify-center gap-2 select-none pointer-events-none">
                      <span>Enter as {selectedRole}</span>
                      <span className="text-lg font-bold transition-transform group-hover:translate-x-1 duration-200">→</span>
                    </span>
                  </ShinyButton>

                  <button
                    type="button"
                    onClick={goToOverview}
                    className="w-full py-1 text-xs sm:text-sm text-sky-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back to Overview</span>
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Image Crop Modal for Company Logo */}
      {rawImageForCrop && (
        <ImageCropModal
          isOpen={isCropModalOpen}
          imageSrc={rawImageForCrop}
          onClose={() => {
            setIsCropModalOpen(false);
            setRawImageForCrop(null);
          }}
          onCropComplete={(croppedDataUrl) => {
            setRegLogoDataUrl(croppedDataUrl);
            setRawImageForCrop(null);
          }}
        />
      )}

      {/* Login Methods & Authentication Protocol Guide Modal */}
      <LoginMethodGuideModal
        isOpen={showLoginGuide}
        onClose={() => setShowLoginGuide(false)}
      />
    </div>
  );
};
