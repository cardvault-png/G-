import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Gift, Loader2, Lock, Mail, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, error: authError, clearError } = useAuth();
  
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });

  const banned = searchParams.get('banned') === 'true';

  // Sync auth context error with local error state
  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError]);

  // Clear errors when form changes
  useEffect(() => {
    setError(null);
    clearError();
  }, [formData.email, formData.password, clearError]);

  const validateForm = (): boolean => {
    if (!formData.email.trim()) {
      setError('Please enter your email address');
      return false;
    }
    
    if (!formData.password) {
      setError('Please enter your password');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('[Login] Form submitted');
    
    // Prevent double submission
    if (isLoading) {
      console.log('[Login] Already loading, ignoring submission');
      return;
    }

    // Clear previous errors
    setError(null);
    clearError();

    // Validate form
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      console.log('[Login] Calling login...');
      await login(formData.email, formData.password, twoFactorCode || undefined);
      console.log('[Login] Login successful');
      // Navigation is handled in AuthContext
    } catch (err: any) {
      console.error('[Login] Login failed:', err);
      
      // Handle 2FA required
      if (err.message === '2FA_REQUIRED') {
        setRequires2FA(true);
        setError(null);
      } else {
        // Display error message
        const errorMessage = err.response?.data?.message || 
                            err.message || 
                            'Invalid credentials. Please try again.';
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setRequires2FA(false);
    setTwoFactorCode('');
    setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4 py-12 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg">
            <Gift className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {requires2FA ? 'Two-Factor Authentication' : 'Welcome back'}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {requires2FA 
              ? 'Enter the 6-digit code from your authenticator app'
              : 'Sign in to your GiftCard Pro account'}
          </p>
        </div>

        {/* Error Alerts */}
        {banned && (
          <Alert variant="destructive">
            <AlertDescription>
              Your account has been suspended. Please contact support for assistance.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-xl bg-white p-8 shadow-lg dark:bg-gray-800">
            {!requires2FA ? (
              <>
                {/* Email Field */}
                <div>
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="pl-10"
                      placeholder="Enter your email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      className="pl-10 pr-10"
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember"
                      checked={formData.rememberMe}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, rememberMe: checked as boolean })
                      }
                      disabled={isLoading}
                    />
                    <Label
                      htmlFor="remember"
                      className="text-sm font-normal"
                    >
                      Remember me
                    </Label>
                  </div>
                  <Link
                    to="/forgot-password"
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    Forgot password?
                  </Link>
                </div>
              </>
            ) : (
              /* 2FA Code Input */
              <div>
                <div className="mb-4 flex items-center gap-2 text-indigo-600">
                  <Shield className="h-5 w-5" />
                  <span className="font-medium">Authentication Code</span>
                </div>
                <Label htmlFor="2fa">Enter 6-digit code</Label>
                <Input
                  id="2fa"
                  name="2fa"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  placeholder="000000"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 text-center text-2xl tracking-widest"
                  disabled={isLoading}
                  autoFocus
                />
                <p className="mt-2 text-sm text-gray-500">
                  Open your authenticator app to get the code
                </p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {requires2FA ? 'Verifying...' : 'Signing in...'}
                </>
              ) : requires2FA ? (
                'Verify'
              ) : (
                'Sign in'
              )}
            </Button>

            {/* Back Button for 2FA */}
            {requires2FA && (
              <button
                type="button"
                onClick={handleBackToLogin}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
                disabled={isLoading}
              >
                Back to login
              </button>
            )}
          </div>
        </form>

        {/* Sign Up Link */}
        {!requires2FA && (
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Sign up
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
