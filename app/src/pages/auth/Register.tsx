import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Gift, Loader2, Lock, Mail, User, Phone, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';

export function Register() {
  const navigate = useNavigate();
  const { register, error: authError, clearError } = useAuth();
  
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    username: '',
    referralCode: '',
    termsAccepted: false,
  });

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
  }, [formData, clearError]);

  const validateStep1 = (): boolean => {
    // Email or phone is required
    if (!formData.email.trim() && !formData.phone.trim()) {
      setError('Please enter either an email address or phone number');
      return false;
    }
    
    // Validate email format if provided
    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        setError('Please enter a valid email address');
        return false;
      }
    }
    
    // Password validation
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return false;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    
    return true;
  };

  const validateStep2 = (): boolean => {
    if (!formData.fullName.trim()) {
      setError('Please enter your full name');
      return false;
    }
    
    if (!formData.username.trim()) {
      setError('Please choose a username');
      return false;
    }
    
    if (formData.username.length < 3) {
      setError('Username must be at least 3 characters long');
      return false;
    }
    
    if (!formData.termsAccepted) {
      setError('You must accept the Terms of Service and Privacy Policy');
      return false;
    }
    
    return true;
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    setError(null);
    clearError();
    
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault();
    setError(null);
    setStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('[Register] Form submitted');
    
    // Prevent double submission
    if (isLoading) {
      console.log('[Register] Already loading, ignoring submission');
      return;
    }

    setError(null);
    clearError();

    if (!validateStep2()) {
      return;
    }

    setIsLoading(true);

    try {
      console.log('[Register] Calling register API...');
      
      const response = await register({
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        password: formData.password,
        fullName: formData.fullName.trim(),
        username: formData.username.trim(),
        referralCode: formData.referralCode.trim() || undefined,
        termsAccepted: formData.termsAccepted,
      });

      console.log('[Register] Registration successful:', response);

      // Redirect to OTP verification
      navigate('/verify-otp', {
        state: {
          identifier: formData.email || formData.phone,
          type: formData.email ? 'EMAIL_VERIFICATION' : 'PHONE_VERIFICATION',
        },
      });
    } catch (err: any) {
      console.error('[Register] Registration failed:', err);
      
      const errorMessage = err.response?.data?.message || 
                          err.message || 
                          'Registration failed. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
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
            Create account
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Join GiftCard Pro and start trading
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-4">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full font-medium text-sm ${
              step >= 1
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            {step > 1 ? <Check className="h-4 w-4" /> : '1'}
          </div>
          <div className="h-1 w-12 bg-gray-200 rounded">
            <div
              className={`h-full bg-indigo-600 transition-all duration-300 rounded ${
                step > 1 ? 'w-full' : 'w-0'
              }`}
            />
          </div>
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full font-medium text-sm ${
              step >= 2
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            2
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-xl bg-white p-8 shadow-lg dark:bg-gray-800">
            {step === 1 ? (
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

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-500 dark:bg-gray-800">
                      Or
                    </span>
                  </div>
                </div>

                {/* Phone Field */}
                <div>
                  <Label htmlFor="phone">Phone number</Label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      className="pl-10"
                      placeholder="Enter your phone number"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
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
                      autoComplete="new-password"
                      required
                      className="pl-10 pr-10"
                      placeholder="Create a password (min 8 chars)"
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

                {/* Confirm Password Field */}
                <div>
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      className="pl-10"
                      placeholder="Confirm your password"
                      value={formData.confirmPassword}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          confirmPassword: e.target.value,
                        })
                      }
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Continue Button */}
                <Button 
                  type="button" 
                  className="w-full" 
                  onClick={handleNext}
                  disabled={isLoading}
                >
                  Continue
                </Button>
              </>
            ) : (
              <>
                {/* Full Name Field */}
                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <div className="relative mt-1">
                    <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      id="fullName"
                      name="fullName"
                      type="text"
                      autoComplete="name"
                      required
                      className="pl-10"
                      placeholder="Enter your full name"
                      value={formData.fullName}
                      onChange={(e) =>
                        setFormData({ ...formData, fullName: e.target.value })
                      }
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Username Field */}
                <div>
                  <Label htmlFor="username">Username</Label>
                  <div className="relative mt-1">
                    <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      className="pl-10"
                      placeholder="Choose a username (min 3 chars)"
                      value={formData.username}
                      onChange={(e) =>
                        setFormData({ ...formData, username: e.target.value })
                      }
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Referral Code Field */}
                <div>
                  <Label htmlFor="referralCode">
                    Referral Code <span className="text-gray-400">(Optional)</span>
                  </Label>
                  <Input
                    id="referralCode"
                    name="referralCode"
                    type="text"
                    className="mt-1"
                    placeholder="Enter referral code"
                    value={formData.referralCode}
                    onChange={(e) =>
                      setFormData({ ...formData, referralCode: e.target.value })
                    }
                    disabled={isLoading}
                  />
                </div>

                {/* Terms Checkbox */}
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="terms"
                    checked={formData.termsAccepted}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        termsAccepted: checked as boolean,
                      })
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="terms" className="text-sm font-normal leading-tight">
                    I agree to the{' '}
                    <Link
                      to="/terms"
                      className="text-indigo-600 hover:text-indigo-500"
                      target="_blank"
                    >
                      Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link
                      to="/privacy"
                      className="text-indigo-600 hover:text-indigo-500"
                      target="_blank"
                    >
                      Privacy Policy
                    </Link>
                  </Label>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={handleBack}
                    disabled={isLoading}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </form>

        {/* Sign In Link */}
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
