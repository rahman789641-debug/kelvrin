import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../ui/Badge';
import { ChevronDown, LogOut, UserCheck, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EditProfileModal } from './EditProfileModal';

export const UserMenu: React.FC = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    navigate('/login');
  };

  const getFirstLetter = (name?: string, email?: string) => {
    if (name && name.trim().length > 0) {
      return name.trim().charAt(0).toUpperCase();
    }
    if (email && email.trim().length > 0) {
      return email.trim().charAt(0).toUpperCase();
    }
    return 'S';
  };

  const initialLetter = getFirstLetter(user.fullName, user.email);

  const isSuperAdmin = user.role === 'Super Admin' || (user.role && user.role.toUpperCase().replace(/\s+/g, '_') === 'SUPER_ADMIN');

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 p-1.5 rounded-lg transition-colors focus:outline-none hover:bg-slate-100 cursor-pointer focus:ring-2 focus:ring-cyan-400"
          title={`${user.fullName} (${user.role})`}
        >
          {/* Avatar with Capital First Letter (NO PHOTO) */}
          <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-white font-bold text-xs flex items-center justify-center border border-cyan-300/50 shadow-[0_0_8px_rgba(0,210,255,0.35)] shrink-0">
            {initialLetter}
          </div>

          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-semibold text-slate-800 leading-tight truncate max-w-[130px]">
              {user.fullName}
            </span>
            <span className="text-[10px] text-cyan-700 font-medium">
              {user.role}
            </span>
          </div>
          <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 py-2.5 animate-in fade-in slide-in-from-top-2 duration-150">
            {/* User Info Header (Accessible to all roles) */}
            <div className="px-4 py-2.5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-white font-bold text-base flex items-center justify-center border border-cyan-300/60 shadow-md shadow-cyan-500/20 shrink-0">
                  {initialLetter}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate">{user.fullName}</p>
                  <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <Badge variant="navy" size="sm">
                      {user.role}
                    </Badge>
                    <Badge variant="sovereign" size="sm">
                      {user.status || 'active'}
                    </Badge>
                    {user.companyCode && (
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                        {user.companyCode}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions: Edit Profile & Settings (ONLY for Super Admin) */}
            {isSuperAdmin && (
              <>
                <div className="p-1.5 space-y-1">
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setIsEditModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:text-cyan-700 hover:bg-cyan-50/70 rounded-lg transition-colors font-medium text-left"
                  >
                    <UserCheck className="h-4 w-4 text-cyan-600 shrink-0" />
                    <div className="flex flex-col">
                      <span>Edit Profile & Organization</span>
                      <span className="text-[10px] text-slate-400">Update company & contact details</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setIsOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:text-blue-700 hover:bg-slate-50 rounded-lg transition-colors font-medium text-left"
                  >
                    <Settings className="h-4 w-4 text-slate-500 shrink-0" />
                    <div className="flex flex-col">
                      <span>Workbench Settings</span>
                      <span className="text-[10px] text-slate-400">Cluster configuration & policies</span>
                    </div>
                  </button>
                </div>

                {/* Divider */}
                <div className="my-1 border-t border-slate-100" />
              </>
            )}

            {/* Logout Option (Available to ALL roles) */}
            <div className="px-1.5 pt-1">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition-colors font-semibold text-left group cursor-pointer"
              >
                <LogOut className="h-4 w-4 text-rose-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
                <span>Sign Out of Workbench</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Profile Modal */}
      {isEditModalOpen && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}
    </>
  );
};
