import React from 'react';
import { 
  X, 
  ShieldCheck, 
  KeyRound, 
  Building2, 
  UserCheck, 
  AlertTriangle, 
  Fingerprint, 
  Mail, 
  Lock, 
  CheckCircle2, 
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { BorderBeamPanel } from '../ui/border-beam-panel';

interface LoginMethodGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginMethodGuideModal: React.FC<LoginMethodGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col">
        <BorderBeamPanel 
          beams={2} 
          thickness={2.5} 
          radius={24} 
          glow 
          idleSpeed={10}
          hoverSpeed={16}
          colors={['#00d2ff', '#a855f7']}
          className="!p-0 !bg-[#051332]/95 !border-cyan-500/40 shadow-2xl flex flex-col overflow-hidden max-h-[88vh]"
        >
          {/* Modal Header */}
          <div className="px-6 py-4 border-b border-cyan-500/20 bg-gradient-to-r from-cyan-950/50 via-slate-900/60 to-purple-950/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_12px_rgba(0,210,255,0.3)]">
                <ShieldCheck className="h-5 w-5 text-cyan-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white tracking-wide">
                    Login & Authentication Protocol
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                    AIRGAP v1.0
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Step-by-step identity verification procedures across sovereign roles
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close Guide"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Modal Scrollable Body */}
          <div className="px-6 py-5 overflow-y-auto space-y-6 text-slate-200 text-sm [scrollbar-width:thin] [scrollbar-color:#00d2ff_transparent]">
            
            {/* Quick Overview Pill */}
            <div className="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-center gap-3 text-xs text-cyan-200">
              <Sparkles className="h-5 w-5 text-cyan-400 shrink-0" />
              <span>
                <strong>Zero-Trust Architecture:</strong> Every operator must authenticate against their registered tenant organization. Review the authorized login paths below according to your assigned institutional role.
              </span>
            </div>

            {/* 1. Super Admin Login Method */}
            <div className="rounded-2xl bg-slate-900/80 border border-sky-500/30 p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-sky-500/20 border border-sky-400 flex items-center justify-center text-xs font-bold text-sky-300 font-mono">
                    01
                  </div>
                  <h3 className="font-bold text-white text-sm tracking-wide">
                    Super Admin Sovereign Master Login
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30 uppercase">
                  Master Authority
                </span>
              </div>

              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Initial Setup:</strong> Organization creators must click <span className="text-cyan-300 font-semibold">"Register New Organization"</span> on the portal screen to establish the master company profile and provision root Super Admin credentials.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Authentication Flow:</strong> On the login portal, enter your registered <strong>Email or Username</strong> and <strong>Master Password</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Account Recovery:</strong> If password is lost, use the <span className="text-sky-300 font-semibold">"Forgot Password"</span> portal and answer your registered sovereign security question to reset credentials.
                  </span>
                </li>
              </ul>
            </div>

            {/* 2. Company Code Verification Method (All Organization Personnel) */}
            <div className="rounded-2xl bg-slate-900/80 border border-emerald-500/30 p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-xs font-bold text-emerald-300 font-mono">
                    02
                  </div>
                  <h3 className="font-bold text-white text-sm tracking-wide">
                    Company Code Verification (Mandatory Step)
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 uppercase">
                  Tenant Isolation
                </span>
              </div>

              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Company Code Entry:</strong> All staff members must enter their assigned organization's Company Code (e.g., <code className="text-emerald-300 bg-emerald-950/60 px-1 py-0.5 rounded font-mono">KELV-HQ</code>) on the front login screen.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Cryptographic Check:</strong> Clicking <strong>"Verify Company Code"</strong> validates the code against the sovereign cloud registry. Upon successful verification, a green badge displays and the portal flips to the Role Login screen.
                  </span>
                </li>
              </ul>
            </div>

            {/* 3. Role-Based Login Protocol (Face B) */}
            <div className="rounded-2xl bg-slate-900/80 border border-purple-500/30 p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-purple-500/20 border border-purple-400 flex items-center justify-center text-xs font-bold text-purple-300 font-mono">
                    03
                  </div>
                  <h3 className="font-bold text-white text-sm tracking-wide">
                    Role-Based Access Login (Face B)
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-400/30 uppercase">
                  RBAC Enforcement
                </span>
              </div>

              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <UserCheck className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Target Roles:</strong> Applies to all institutional operators including <em>Auditor, Compliance Officer, Developer, Finance Analyst, Security Admin, Risk Analyst, DevOps Engineer, Data Scientist, Operations Lead, and Legal Counsel</em>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <UserCheck className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Credentials:</strong> Enter the Username or corporate Email and Password provisioned by your Super Admin in User Management.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <UserCheck className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Role Consistency Rule:</strong> You can only log in under the exact role clearance granted to your account. Selecting an unauthorized role will be rejected by the security engine.
                  </span>
                </li>
              </ul>
            </div>

            {/* 4. Access Request Procedure (New Operators) */}
            <div className="rounded-2xl bg-slate-900/80 border border-amber-500/30 p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-amber-500/20 border border-amber-400 flex items-center justify-center text-xs font-bold text-amber-300 font-mono">
                    04
                  </div>
                  <h3 className="font-bold text-white text-sm tracking-wide">
                    Access Request & Approval Workflow
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 uppercase">
                  Pending Clearance
                </span>
              </div>

              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <KeyRound className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>New Operator Onboarding:</strong> If you do not yet have an account, enter the Company Code and click <span className="text-amber-300 font-semibold">"Request Access"</span> on Face B.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <KeyRound className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Live Dispatch:</strong> Your request is transmitted directly to the organization Super Admin's dashboard in real-time. Once the Super Admin reviews and approves your role clearance, you can immediately access the workbench.
                  </span>
                </li>
              </ul>
            </div>

            {/* 5. Google SSO Enterprise Authentication */}
            <div className="rounded-2xl bg-slate-900/80 border border-blue-500/30 p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-blue-500/20 border border-blue-400 flex items-center justify-center text-xs font-bold text-blue-300 font-mono">
                    05
                  </div>
                  <h3 className="font-bold text-white text-sm tracking-wide">
                    Google Enterprise SSO
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30 uppercase">
                  OAuth 2.0
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                If your organization enforces Google Workspace authentication, click <strong>"Continue with Google"</strong>. Accounts authenticated via Google SSO must always use Google Sign-In; standard password authentication is blocked for Google-secured profiles.
              </p>
            </div>

            {/* 06. Persistent Workstation Locking & Direct Logout Routing */}
            <div className="rounded-2xl bg-slate-900/80 border border-cyan-500/40 p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-xs font-bold text-cyan-300 font-mono">
                    06
                  </div>
                  <h3 className="font-bold text-white text-sm tracking-wide">
                    Persistent Workstation Lock &amp; Direct Role Logout Routing
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 uppercase font-mono">
                  Terminal Lock
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Once an organization is registered or verified on an enclave workstation terminal, the workspace is cryptographically locked to that tenant. When an operator clicks <strong>Sign Out</strong>:
              </p>

              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Direct Role Re-Entry:</strong> The initial welcome overview (0°) and company code input screens are completely bypassed on logout. The terminal routes directly back to that specific role's login portal (e.g. Auditor Login with Company Code verified).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Smooth Loading Transition:</strong> A sovereign enclave unmount animation runs, securely flushing active session memory before landing on the role login screen.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Super Admin Master Reset Authority:</strong> The initial registration and company code screens will <em>ONLY</em> reappear if the Super Admin explicitly authorizes an <strong>Organization Purge</strong> from Enclave Settings.
                  </span>
                </li>
              </ul>
            </div>

            {/* CRITICAL WARNING ENFORCEMENT SECTION (HIGH VISIBILITY RED) */}
            <div className="rounded-2xl bg-rose-950/70 border-2 border-rose-500 p-5 space-y-3.5 shadow-[0_0_30px_rgba(244,63,94,0.3)]">
              <div className="flex items-center gap-2.5 text-rose-400 pb-2 border-b border-rose-500/30">
                <AlertTriangle className="h-5 w-5 shrink-0 animate-pulse text-rose-400" />
                <h3 className="font-bold text-sm text-rose-200 tracking-wider uppercase">
                  Strict Security Mandates &amp; Prohibitions
                </h3>
              </div>

              <div className="space-y-2.5 text-xs text-rose-100">
                <div className="p-2.5 rounded-xl bg-rose-900/40 border border-rose-500/40 flex items-start gap-2">
                  <span className="text-rose-400 font-bold text-sm shrink-0">⛔</span>
                  <div>
                    <strong className="text-white">Prohibited: Simultaneous Active Sessions:</strong>
                    <p className="text-rose-200/90 mt-0.5 leading-relaxed">
                      Logging into the same account across multiple computers or tabs at the same time is strictly prohibited. The system enforces single-seat session locking. Active sessions must be signed out before initiating a new login.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-rose-900/40 border border-rose-500/40 flex items-start gap-2">
                  <span className="text-rose-400 font-bold text-sm shrink-0">⛔</span>
                  <div>
                    <strong className="text-white">Prohibited: Role Credential Misuse:</strong>
                    <p className="text-rose-200/90 mt-0.5 leading-relaxed">
                      Super Admin master credentials cannot be used inside operator role login portals. Super Admins must sign in strictly through the Super Admin Master Portal.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-rose-900/40 border border-rose-500/40 flex items-start gap-2">
                  <span className="text-rose-400 font-bold text-sm shrink-0">⛔</span>
                  <div>
                    <strong className="text-white">Prohibited: Unauthorized Email &amp; Workstation Switching:</strong>
                    <p className="text-rose-200/90 mt-0.5 leading-relaxed">
                      For all operational roles (Admin, AI Operator, Approver, Analyst, Employee, Auditor), each terminal is cryptographically bound to the specific email granted permission by the Super Admin. Attempting to enter or sign in with a different email address on this workstation is strictly blocked.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-rose-900/40 border border-rose-500/40 flex items-start gap-2">
                  <span className="text-rose-400 font-bold text-sm shrink-0">⛔</span>
                  <div>
                    <strong className="text-white">Warning: Intrusion Detection &amp; Audit Logging:</strong>
                    <p className="text-rose-200/90 mt-0.5 leading-relaxed">
                      All failed login attempts, unauthorized role switching, and brute-force password tries are cryptographically recorded into the Sovereign Immutable Audit Trail and will alert the Security Administrator.
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Modal Footer */}
          <div className="px-6 py-3.5 border-t border-cyan-500/20 bg-[#030d22] flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
              <Fingerprint className="h-3.5 w-3.5 text-cyan-400" />
              Kelvrin Cryptographic Enclave Protocol
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold text-xs shadow-[0_0_15px_rgba(0,210,255,0.4)] cursor-pointer transition-all uppercase tracking-wider"
            >
              Understood
            </button>
          </div>
        </BorderBeamPanel>
      </div>
    </div>
  );
};
export default LoginMethodGuideModal;
