import React from 'react';

interface KelvrinLoaderProps {
  text?: string;
  fullScreen?: boolean;
}

export const KelvrinLoader: React.FC<KelvrinLoaderProps> = ({
  text = 'Loading',
  fullScreen = true,
}) => {
  return (
    <div
      className={`${
        fullScreen ? 'fixed inset-0 z-[9999]' : 'w-full py-16'
      } flex flex-col items-center justify-center gap-6 bg-[#0A0F1D] text-slate-100 select-none`}
      role="status"
      aria-live="polite"
      aria-label={text}
      style={{ fontFamily: '"Sora", "Helvetica Neue", Helvetica, Arial, sans-serif' }}
    >
      <svg
        className="w-[160px] h-[160px] md:w-[200px] md:h-[200px]"
        viewBox="4 5 24 27"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ animation: 'cycle 6s linear infinite' }}
      >
        <path
          className="v v1"
          d="M7 8L16 13L25 8"
          stroke="#3B82F6"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="100"
          strokeDasharray="100"
        />
        <path
          className="v v2"
          d="M7 16L16 21L25 16"
          stroke="#8B5CF6"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="100"
          strokeDasharray="100"
        />
        <path
          className="v v3"
          d="M7 24L16 29L25 24"
          stroke="#10B981"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="100"
          strokeDasharray="100"
        />
        <circle className="dot d1" cx="16" cy="13" r="2" fill="#60A5FA" />
        <circle className="dot d2" cx="16" cy="21" r="2" fill="#A78BFA" />
        <circle className="dot d3" cx="16" cy="29" r="2" fill="#34D399" />
      </svg>

      <span
        className="text-[13px] font-medium tracking-[0.22em] uppercase text-[#EEF2FF]"
        style={{ animation: 'text-fade 2.2s ease-in-out infinite' }}
      >
        {text}
      </span>
    </div>
  );
};
