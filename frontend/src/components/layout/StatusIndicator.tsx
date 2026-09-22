import React from 'react';
import { ShieldCheck, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const StatusIndicator: React.FC = () => {
  const { sovereignMode } = useAuth();
  const isAirGap = sovereignMode === 'AIR_GAP_LOCAL';

  return (
    <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-50 border border-emerald-200/90 rounded-full text-xs font-medium text-emerald-800 shadow-2xs">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      {isAirGap ? (
        <span className="flex items-center gap-1 font-semibold text-emerald-900">
          <Lock className="h-3 w-3 text-emerald-700" />
          True Air-Gapped
        </span>
      ) : (
        <span className="flex items-center gap-1 font-semibold text-emerald-900">
          <ShieldCheck className="h-3 w-3 text-emerald-700" />
          Zero Data Leakage (Local Inference)
        </span>
      )}
    </div>
  );
};
