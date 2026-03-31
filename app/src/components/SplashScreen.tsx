import { useEffect, useState } from 'react';
import { Gift, Loader2 } from 'lucide-react';

export function SplashScreen() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 4;
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500">
      <div className="relative">
        {/* Animated circles */}
        <div className="absolute inset-0 animate-ping rounded-full bg-white/20" style={{ animationDuration: '2s' }} />
        <div className="absolute inset-0 animate-ping rounded-full bg-white/10" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
        
        {/* Logo */}
        <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-white shadow-2xl">
          <Gift className="h-12 w-12 text-indigo-600" />
        </div>
      </div>

      <h1 className="mt-8 text-3xl font-bold text-white">GiftCard Pro</h1>
      <p className="mt-2 text-white/80">Secure Gift Card Trading Platform</p>

      {/* Progress bar */}
      <div className="mt-8 w-64">
        <div className="h-1 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all duration-100 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-sm text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Initializing...</span>
        </div>
      </div>
    </div>
  );
}
