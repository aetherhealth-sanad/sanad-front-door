import React from 'react';

interface LoadingViewProps {
  title?: string;
  subtitle?: string;
  variant?: 'fullscreen' | 'card' | 'inline';
}

export const LoadingView: React.FC<LoadingViewProps> = ({
  title = 'Loading...',
  subtitle = 'Securing your confidential session...',
  variant = 'card',
}) => {
  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-3 py-4 text-xs font-medium text-[#4A6588]">
        <div className="spinner spinner-sm" />
        <span>{title}</span>
      </div>
    );
  }

  const content = (
    <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 space-y-6">
      {/* Bio-medical glowing ring & logo icon */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute w-20 h-20 rounded-full bg-[#0062FF]/10 animate-ping"
          style={{ animationDuration: '2.5s' }}
        />
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg"
          style={{
            background: 'linear-gradient(145deg, #1A7AFF 0%, #0048C8 100%)',
            boxShadow: '0 8px 24px -4px rgba(0,98,255,0.4), 0 1px 2px rgba(255,255,255,0.3) inset',
          }}
        >
          <span className="bio-pulse-soft">س</span>
        </div>
      </div>

      {/* Title & subtitle with dot pulse */}
      <div className="space-y-1.5 max-w-sm">
        <h3 className="text-base font-bold text-[#07215A] tracking-tight">{title}</h3>
        <p className="text-xs text-[#829AB8] leading-relaxed">{subtitle}</p>
        <div className="dot-pulse flex gap-1 justify-center text-[#0062FF] pt-1">
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
    <div className="medical-card overflow-hidden bg-white/90 backdrop-blur-sm border border-[#E2ECF8] shadow-sm max-w-md mx-auto my-8">
      {content}
    </div>
  );
};
