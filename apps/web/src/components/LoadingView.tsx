import React from 'react';

interface LoadingViewProps {
  title?: string;
  subtitle?: string;
  variant?: 'fullscreen' | 'card' | 'inline' | 'illustrated' | 'skeleton';
}

export const LoadingView: React.FC<LoadingViewProps> = ({
  title = 'Analyzing Health Indicators...',
  subtitle = 'Evaluated against WHO 2021 Reference Standards, Just for You',
  variant = 'card',
}) => {
  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-3 py-4 text-xs font-medium text-[#575C55]">
        <div className="spinner spinner-sm" />
        <span>{title}</span>
      </div>
    );
  }

  // ── Illustrated Star Pedestal (Matching reference image) ──
  if (variant === 'illustrated') {
    return (
      <div className="medical-canvas p-8 sm:p-12 max-w-lg mx-auto my-8 text-center space-y-6">
        <div className="flex flex-col items-center justify-center relative pt-2">
          {/* Floating 5-Pointed Rounded Star */}
          <div className="floating-star-anim -mb-4 z-10">
            <svg width="90" height="90" viewBox="0 0 100 100" fill="none">
              <path
                d="M50 12
                   C51.5 12 53 13 53.8 14.5
                   L62.4 32.5
                   L81.8 35.2
                   C84.5 35.6 85.6 38.9 83.6 40.8
                   L69.5 54.3
                   L73 73.5
                   C73.5 76.2 70.6 78.3 68.2 76.9
                   L50.8 67.5
                   L33.4 76.9
                   C31 78.3 28.1 76.2 28.6 73.5
                   L32.1 54.3
                   L18 40.8
                   C16 38.9 17.1 35.6 19.8 35.2
                   L39.2 32.5
                   L47.8 14.5
                   C48.6 13 50.1 12 50 12
                   Z"
                fill="#5B9CF6"
                stroke="#4080E8"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* 3-Tiered Pedestal Base */}
          <div className="pedestal-anim">
            <svg width="170" height="80" viewBox="0 0 180 84" fill="none">
              {/* Step 1 (Top Tier - Soft Ice Blue) */}
              <rect x="44" y="6" width="92" height="20" rx="7" fill="#D4E6FE" />
              <rect x="66" y="6" width="48" height="20" fill="#BFDBFE" opacity="0.6" />

              {/* Step 2 (Middle Tier - Medium Periwinkle) */}
              <rect x="26" y="30" width="128" height="22" rx="8" fill="#93C5FD" />
              <rect x="52" y="30" width="76" height="22" fill="#2E6B57" opacity="0.5" />

              {/* Step 3 (Bottom Tier Base - Solid Sapphire Blue) */}
              <rect x="10" y="56" width="160" height="24" rx="9" fill="#1F4D3F" />
              <rect x="38" y="56" width="104" height="24" fill="#163A2F" opacity="0.3" />
            </svg>
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="space-y-1.5 max-w-sm mx-auto">
          <h3 className="text-lg font-semibold text-[#1A1F1C] tracking-tight">{title}</h3>
          <p className="text-xs text-[#8A8C84] leading-relaxed">{subtitle}</p>
        </div>
      </div>
    );
  }

  // ── Skeleton Shimmer (Matching reference Screen B) ──
  if (variant === 'skeleton') {
    return (
      <div className="medical-card p-6 max-w-lg mx-auto my-8 space-y-5">
        {/* Search Bar Capsule */}
        <div className="h-11 rounded-full bg-[#F7F5EF] border border-[#E4DFD3] flex items-center px-4 gap-2.5">
          <span className="text-[#8A8C84] text-sm">🔍</span>
          <span className="text-xs text-[#8A8C84]">Search a Specialist or Lab...</span>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-2">
          <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#E8EFEA] text-[#1F4D3F]">
            All
          </span>
          <span className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#8A8C84] border border-[#E4DFD3]">
            Urology
          </span>
          <span className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#8A8C84] border border-[#E4DFD3]">
            Lab and Hormone
          </span>
          <span className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#8A8C84] border border-[#E4DFD3]">
            Lifestyle
          </span>
        </div>

        {/* 5 Shimmer Rows */}
        <div className="space-y-4 pt-2">
          {[1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="flex items-center gap-3.5 py-1">
              <div className="w-11 h-11 rounded-full skeleton shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/5 rounded-md skeleton" />
                <div className="h-3 w-4/5 rounded-md skeleton" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const content = (
    <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 space-y-6">
      {/* Bio-medical glowing ring & logo icon */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute w-20 h-20 rounded-full bg-[#1F4D3F]/10 animate-ping"
          style={{ animationDuration: '2.5s' }}
        />
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-[var(--shadow-2)]"
          style={{
            background: 'linear-gradient(145deg, #2E6B57 0%, #163A2F 100%)',
            boxShadow: '0 8px 24px -4px rgba(31,77,63,0.4), 0 1px 2px rgba(255,255,255,0.3) inset',
          }}
        >
          <span className="bio-pulse-soft">س</span>
        </div>
      </div>

      {/* Title & subtitle with dot pulse */}
      <div className="space-y-1.5 max-w-sm">
        <h3 className="text-base font-bold text-[#1A1F1C] tracking-tight">{title}</h3>
        <p className="text-xs text-[#8A8C84] leading-relaxed">{subtitle}</p>
        <div className="dot-pulse flex gap-1 justify-center text-[#1F4D3F] pt-1">
          <span />
          <span />
          <span />
        </div>
      </div>

      {/* Subtle skeleton preview to communicate incoming layout */}
      <div className="w-full max-w-xs space-y-2.5 pt-2 opacity-60">
        <div className="skeleton h-3 w-3/4 mx-auto" />
        <div className="skeleton h-2.5 w-1/2 mx-auto" />
      </div>
    </div>
  );

  if (variant === 'fullscreen') {
    return (
      <div className="min-h-[60dvh] flex items-center justify-center px-4">
        <div className="w-full max-w-md medical-canvas overflow-hidden">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="medical-card overflow-hidden bg-[#FBFAF6]/90 backdrop-blur-sm border border-[#E4DFD3] shadow-sm max-w-md mx-auto my-8">
      {content}
    </div>
  );
};
