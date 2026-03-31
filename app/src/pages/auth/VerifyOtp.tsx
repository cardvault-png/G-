import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Gift, Loader2, Key, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';

export function VerifyOtp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyOtp, resendOtp, error: authError, clearError } = useAuth();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  const identifier = location.state?.identifier;
  const type = location.state?.type || 'EMAIL_VERIFICATION';

  // Redirect if no identifier
  useEffect(() => {
    if (!identifier) {
      console.log('[VerifyOtp] No identifier, redirecting to register');
      navigate('/register');
    }
  }, [identifier, navigate]);

  // Sync auth context error with local error state
  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError]);

  // Clear errors when code changes
  useEffect(() => {
    setError(null);
    clearError();
  }, [code, clearError]);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => {
        setResendTimer(resendTimer - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [resendTimer]);

  const validateCode = (): boolean => {
    if (!code.trim()) {
      setError('Please enter the verification code');
      return false;
    }
    
    if (code.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('[VerifyOtp] Form submitted');
    
    // Prevent double submission
    if (isLoading) {
      console.log('[VerifyOtp] Already loading, ignoring submission');
      return;
    }

    setError(null);
    clearError();

    if (!validateCode()) {
      return;
    }

    setIsLoading(true);

    try {
      console.log('[VerifyOtp] Verifying OTP...');
      await verifyOtp(identifier, code, type);
      console.log('[VerifyOtp] Verification successful');
      // Navigation is handled in AuthContext
    } catch (err: any) {
      console.error('[VerifyOtp] Verification failed:', err);
      
      const errorMessage = err.response?.data?.message || 
                          err.message || 
                          'Invalid or expired code. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend || isResending) return;
    
    setIsResending(true);
    setError(null);
    
    try {
      console.log('[VerifyOtp] Resending OTP...');
      await resendOtp(identifier, type);
      console.log('[VerifyOtp] OTP resent successfully');
      
      // Reset timer
      setResendTimer(60);
      setCanResend(false);
    } catch (err: any) {
      console.error('[VerifyOtp] Resend failed:', err);
      
      const errorMessage = err.response?.data?.message || 
                          err.message || 
                          'Failed to resend code. Please try again.';
      setError(errorMessage);
    } finally {
      setIsResending(false);
    }
  };

  const handleBack = () => {
    navigate('/register');
  };

  if (!identifier) {
    return null; // Will redirect
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4 py-12 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg">
            <Gift className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Verify your account
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Enter the 6-digit code sent to{' '}
            <span className="font-medium text-gray-900 dark:text-white">{identifier}</span>
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-xl bg-white p-8 shadow-lg dark:bg-gray-800">
            {/* Code Input */}
            <div>
              <Label htmlFor="code">Verification Code</Label>
              <div className="relative mt-1">
                <Key className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <Input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  className="pl-10 text-center text-2xl tracking-widest"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  disabled={isLoading}
                  autoFocus
                />
              </div>
            </div>

            {/* Verify Button */}
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || code.length !== 6}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify Account'
              )}
            </Button>

            {/* Resend Code */}
            <div className="text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={!canResend || isResending}
                className="text-sm text-indigo-600 hover:text-indigo-500 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {isResending ? (
                  'Resending...'
                ) : canResend ? (
                  'Resend code'
                ) : (
                  `Resend code in ${resendTimer}s`
                )}
              </button>
            </div>

            {/* Back Button */}
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center justify-center gap-2 w-full text-sm text-gray-500 hover:text-gray-700"
              disabled={isLoading}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to registration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
