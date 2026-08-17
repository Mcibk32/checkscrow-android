import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSignUp, useClerk } from '@clerk/clerk-react';
import { useAuth } from '../hooks/useAuth';
import { GoogleButton } from '../components/ui/GoogleButton';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Loader2,
  KeyRound,
  CheckCircle2,
  Phone,
  RefreshCw,
} from 'lucide-react';

/**
 * Clerk-Powered Android Native Register & Verification Flow
 * Integrates with Clerk's existing OAuth and Email Verification flows
 */
const ClerkNativeRegisterForm: React.FC = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const clerk = useClerk();
  const { setGuestExplorer } = useAuth();
  const navigate = useNavigate();

  // Registration Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'buyer' | 'seller' | 'both'>('both');

  // Verification State
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [resendSuccess, setResendSuccess] = useState(false);

  // Loading & Error States
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Google Sign Up
  const handleGoogleSignUp = async () => {
    setErrorMessage(null);
    if (!isLoaded || !signUp) {
      try {
        clerk.openSignUp();
      } catch (err: unknown) {
        console.warn('Clerk Google OAuth fallback error:', err);
      }
      return;
    }

    setIsGoogleLoading(true);
    // DIAGNOSTIC: see matching note in LoginPage.tsx's handleGoogleSignIn.
    console.log('[Auth] Starting Clerk Google OAuth redirect (sign-up)...');
    try {
      await signUp.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/dashboard',
        redirectUrlComplete: '/dashboard',
      });
      console.log('[Auth] signUp.authenticateWithRedirect() call returned (navigation may be in progress).');
    } catch (err: unknown) {
      setIsGoogleLoading(false);
      const clerkErr = err as { errors?: Array<{ message?: string; longMessage?: string }> };
      const msg = clerkErr?.errors?.[0]?.longMessage || clerkErr?.errors?.[0]?.message || 'Google sign-up could not be completed. Please try again.';
      console.error('[Auth] Google OAuth redirect FAILED before leaving the app:', err);
      setErrorMessage(msg);
    }
  };

  // 2. Email & Password Sign Up
  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fullName.trim() || !email.trim() || !password) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (!isLoaded || !signUp) {
      setErrorMessage('Authentication service is initializing. Please wait a moment.');
      return;
    }

    setIsLoading(true);
    try {
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || fullName.trim();
      const lastName = nameParts.slice(1).join(' ') || '';

      await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName,
        lastName: lastName || undefined,
        unsafeMetadata: { role },
      });

      // Prepare Clerk Email OTP verification
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ message?: string; longMessage?: string; code?: string }> };
      const firstErr = clerkErr?.errors?.[0];
      if (firstErr?.code === 'form_identifier_exists') {
        setErrorMessage('An account with this email address already exists. Please sign in instead.');
      } else if (firstErr?.code === 'form_password_pwned' || firstErr?.code === 'form_password_length_too_short') {
        setErrorMessage(firstErr?.longMessage || 'Password must be stronger and at least 8 characters.');
      } else {
        setErrorMessage(firstErr?.longMessage || firstErr?.message || 'Unable to create account. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Email Code Verification Submission
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!verificationCode.trim()) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    if (!isLoaded || !signUp) return;

    setIsVerifying(true);
    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: verificationCode.trim(),
      });

      if (completeSignUp.status === 'complete') {
        if (setActive) {
          await setActive({ session: completeSignUp.createdSessionId });
        }
        navigate('/dashboard');
      } else {
        setErrorMessage('Verification incomplete. Please check your verification code.');
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ message?: string; longMessage?: string; code?: string }> };
      const firstErr = clerkErr?.errors?.[0];
      if (firstErr?.code === 'form_code_incorrect') {
        setErrorMessage('The verification code entered is incorrect. Please try again.');
      } else {
        setErrorMessage(firstErr?.longMessage || firstErr?.message || 'Verification failed. Please try again.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // 4. Resend Code
  const handleResendCode = async () => {
    if (!isLoaded || !signUp) return;
    setIsResending(true);
    setResendSuccess(false);
    setErrorMessage(null);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ message?: string; longMessage?: string }> };
      setErrorMessage(clerkErr?.errors?.[0]?.longMessage || 'Unable to resend code right now.');
    } finally {
      setIsResending(false);
    }
  };

  const handlePreviewAsGuest = () => {
    setGuestExplorer(true);
    navigate('/dashboard');
  };

  // RENDER: Email Verification Screen
  if (pendingVerification) {
    return (
      <div className="w-full space-y-6">
        {/* Verification Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/10">
            <KeyRound className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-semibold tracking-widest text-emerald-400 uppercase">
              SECURITY VERIFICATION
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Verify your email
            </h1>
            <p className="text-xs text-slate-400 max-w-xs">
              We sent a 6-digit verification code to <span className="font-semibold text-slate-200">{email}</span>
            </p>
          </div>
        </div>

        {/* Verification Card Container */}
        <div className="bg-[#11141D] border border-slate-800/80 rounded-2xl p-5 sm:p-6 shadow-xl shadow-black/40 space-y-5">
          {/* Error Message */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 flex items-start gap-2.5 animate-fadeIn"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Resend Success Banner */}
          {resendSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>A new verification code was sent to your email.</span>
            </div>
          )}

          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="verification-code"
                className="block text-xs font-medium text-slate-300"
              >
                6-Digit Verification Code
              </label>
              <div className="relative flex items-center rounded-xl bg-[#0B0C10] border border-slate-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                <input
                  id="verification-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="123456"
                  value={verificationCode}
                  onChange={(e) => {
                    setVerificationCode(e.target.value.replace(/\D/g, ''));
                    if (errorMessage) setErrorMessage(null);
                  }}
                  autoFocus
                  disabled={isVerifying}
                  className="w-full h-14 bg-transparent px-4 text-center text-xl font-mono tracking-widest text-slate-100 placeholder-slate-600 focus:outline-none disabled:opacity-50"
                  required
                />
              </div>
            </div>

            {/* Verify Action Button */}
            <button
              type="submit"
              disabled={isVerifying || verificationCode.length < 6}
              className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-sm tracking-wide transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Verifying code...</span>
                </>
              ) : (
                <>
                  <span>Verify & Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Resend Code & Back Buttons */}
          <div className="pt-2 flex flex-col items-center gap-3 border-t border-slate-800/80">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={isResending || isVerifying}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isResending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Resend verification code</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPendingVerification(false);
                setErrorMessage(null);
              }}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              ← Edit email address
            </button>
          </div>
        </div>
      </div>
    );
  }

  // RENDER: Main Signup Screen
  return (
    <div className="w-full space-y-6">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/10">
          <div className="w-7 h-7 bg-emerald-500 rounded-xl flex items-center justify-center font-bold text-slate-950 text-sm font-mono">
            C
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-mono font-semibold tracking-widest text-emerald-400 uppercase">
            CHECKSCROW ESCROW
          </span>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Create your account
          </h1>
          <p className="text-xs text-slate-400 max-w-xs">
            Join Nigeria's trusted escrow marketplace for safe buying & selling.
          </p>
        </div>
      </div>

      {/* Auth Card Container */}
      <div className="bg-[#11141D] border border-slate-800/80 rounded-2xl p-5 sm:p-6 shadow-xl shadow-black/40 space-y-5">
        {/* Error Alert Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 flex items-start gap-2.5 animate-fadeIn"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* 1. Prominent Official Google Button */}
        <div>
          <GoogleButton
            onClick={handleGoogleSignUp}
            isLoading={isGoogleLoading}
            disabled={isLoading}
            text="Continue with Google"
          />
        </div>

        {/* Subtle Divider */}
        <div className="relative flex items-center justify-center my-4">
          <div className="w-full border-t border-slate-800" />
          <span className="bg-[#11141D] px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-widest absolute">
            OR
          </span>
        </div>

        {/* 2. Registration Form */}
        <form onSubmit={handleEmailSignUp} className="space-y-4">
          {/* Full Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-fullname"
              className="block text-xs font-medium text-slate-300"
            >
              Full Legal Name *
            </label>
            <div className="relative flex items-center rounded-xl bg-[#0B0C10] border border-slate-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <span className="pl-3.5 text-slate-400 pointer-events-none">
                <User className="w-4 h-4" />
              </span>
              <input
                id="register-fullname"
                type="text"
                autoComplete="name"
                placeholder="e.g. Chukwuemeka Adebayo"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isLoading || isGoogleLoading}
                className="w-full h-12 bg-transparent px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50"
                required
              />
            </div>
          </div>

          {/* Email Address */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-email"
              className="block text-xs font-medium text-slate-300"
            >
              Email Address *
            </label>
            <div className="relative flex items-center rounded-xl bg-[#0B0C10] border border-slate-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <span className="pl-3.5 text-slate-400 pointer-events-none">
                <Mail className="w-4 h-4" />
              </span>
              <input
                id="register-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isLoading || isGoogleLoading}
                className="w-full h-12 bg-transparent px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50"
                required
              />
            </div>
          </div>

          {/* Password with Visibility Toggle */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-password"
              className="block text-xs font-medium text-slate-300"
            >
              Password * <span className="text-slate-500 font-normal">(min 8 characters)</span>
            </label>
            <div className="relative flex items-center rounded-xl bg-[#0B0C10] border border-slate-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <span className="pl-3.5 text-slate-400 pointer-events-none">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isLoading || isGoogleLoading}
                className="w-full h-12 bg-transparent px-3 pr-11 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 p-1.5 text-slate-400 hover:text-slate-200 active:scale-95 transition-colors cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Account Role Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Primary Account Activity
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'both', label: 'Buyer & Seller' },
                { id: 'buyer', label: 'Buyer' },
                { id: 'seller', label: 'Seller' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRole(item.id as 'buyer' | 'seller' | 'both')}
                  className={`h-10 px-2 rounded-xl text-xs font-semibold border transition-all duration-150 cursor-pointer ${
                    role === item.id
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-sm shadow-emerald-500/10'
                      : 'bg-[#0B0C10] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Terms info */}
          <p className="text-[11px] text-slate-500 leading-tight pt-1">
            By creating an account, you agree to CHECKSCROW's escrow terms and dispute mediation policies.
          </p>

          {/* Primary Create Account Button */}
          <button
            type="submit"
            disabled={isLoading || isGoogleLoading}
            className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-sm tracking-wide transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <span>Create account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Bottom Login Link */}
        <div className="pt-2 text-center">
          <p className="text-xs text-slate-400">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-bold text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Guest Explorer Option */}
      <div className="text-center pt-1">
        <button
          type="button"
          onClick={handlePreviewAsGuest}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors py-1.5 px-3 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Explore Dashboard UI Shell</span>
        </button>
      </div>
    </div>
  );
};

/**
 * Fallback Native Form (used when Clerk is not configured or in local environment)
 */
const LocalNativeRegisterForm: React.FC = () => {
  const { register, isLoading, error, clearError, setGuestExplorer } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'buyer' | 'seller' | 'both'>('both');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!fullName.trim() || !email.trim() || !password) {
      setLocalError('Please fill in all required fields.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setLocalError('Please enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    const success = await register({
      fullName: fullName.trim(),
      email: email.trim(),
      phoneNumber: phoneNumber.replace(/\s+/g, ''),
      password,
      confirmPassword,
      role,
    });

    if (success) {
      navigate('/dashboard');
    }
  };

  const handleGoogleSignUp = () => {
    setLocalError('Clerk Google OAuth will initialize when running with live Clerk credentials.');
  };

  const handlePreviewAsGuest = () => {
    setGuestExplorer(true);
    navigate('/dashboard');
  };

  const displayError = localError || error;

  return (
    <div className="w-full space-y-6">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/10">
          <div className="w-7 h-7 bg-emerald-500 rounded-xl flex items-center justify-center font-bold text-slate-950 text-sm font-mono">
            C
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-mono font-semibold tracking-widest text-emerald-400 uppercase">
            CHECKSCROW ESCROW
          </span>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Create your account
          </h1>
          <p className="text-xs text-slate-400 max-w-xs">
            Join Nigeria's trusted escrow marketplace for safe buying & selling.
          </p>
        </div>
      </div>

      {/* Auth Card Container */}
      <div className="bg-[#11141D] border border-slate-800/80 rounded-2xl p-5 sm:p-6 shadow-xl shadow-black/40 space-y-5">
        {/* Error Alert Banner */}
        {displayError && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 flex items-start gap-2.5 animate-fadeIn"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{displayError}</div>
          </div>
        )}

        {/* 1. Prominent Official Google Button */}
        <div>
          <GoogleButton
            onClick={handleGoogleSignUp}
            disabled={isLoading}
            text="Continue with Google"
          />
        </div>

        {/* Subtle Divider */}
        <div className="relative flex items-center justify-center my-4">
          <div className="w-full border-t border-slate-800" />
          <span className="bg-[#11141D] px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-widest absolute">
            OR
          </span>
        </div>

        {/* 2. Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="local-register-fullname"
              className="block text-xs font-medium text-slate-300"
            >
              Full Legal Name *
            </label>
            <div className="relative flex items-center rounded-xl bg-[#0B0C10] border border-slate-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <span className="pl-3.5 text-slate-400 pointer-events-none">
                <User className="w-4 h-4" />
              </span>
              <input
                id="local-register-fullname"
                type="text"
                autoComplete="name"
                placeholder="e.g. Chukwuemeka Adebayo"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  clearError();
                  if (localError) setLocalError(null);
                }}
                disabled={isLoading}
                className="w-full h-12 bg-transparent px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50"
                required
              />
            </div>
          </div>

          {/* Email Address */}
          <div className="space-y-1.5">
            <label
              htmlFor="local-register-email"
              className="block text-xs font-medium text-slate-300"
            >
              Email Address *
            </label>
            <div className="relative flex items-center rounded-xl bg-[#0B0C10] border border-slate-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <span className="pl-3.5 text-slate-400 pointer-events-none">
                <Mail className="w-4 h-4" />
              </span>
              <input
                id="local-register-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearError();
                  if (localError) setLocalError(null);
                }}
                disabled={isLoading}
                className="w-full h-12 bg-transparent px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50"
                required
              />
            </div>
          </div>

          {/* Phone Number */}
          <div className="space-y-1.5">
            <label
              htmlFor="local-register-phone"
              className="block text-xs font-medium text-slate-300"
            >
              Phone Number <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <div className="relative flex items-center rounded-xl bg-[#0B0C10] border border-slate-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <span className="pl-3.5 text-slate-400 pointer-events-none">
                <Phone className="w-4 h-4" />
              </span>
              <input
                id="local-register-phone"
                type="tel"
                inputMode="tel"
                placeholder="08012345678"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  clearError();
                  if (localError) setLocalError(null);
                }}
                disabled={isLoading}
                className="w-full h-12 bg-transparent px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label
              htmlFor="local-register-password"
              className="block text-xs font-medium text-slate-300"
            >
              Password * <span className="text-slate-500 font-normal">(min 8 characters)</span>
            </label>
            <div className="relative flex items-center rounded-xl bg-[#0B0C10] border border-slate-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <span className="pl-3.5 text-slate-400 pointer-events-none">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="local-register-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearError();
                  if (localError) setLocalError(null);
                }}
                disabled={isLoading}
                className="w-full h-12 bg-transparent px-3 pr-11 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 p-1.5 text-slate-400 hover:text-slate-200 active:scale-95 transition-colors cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label
              htmlFor="local-register-confirm-password"
              className="block text-xs font-medium text-slate-300"
            >
              Confirm Password *
            </label>
            <div className="relative flex items-center rounded-xl bg-[#0B0C10] border border-slate-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <span className="pl-3.5 text-slate-400 pointer-events-none">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="local-register-confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  clearError();
                  if (localError) setLocalError(null);
                }}
                disabled={isLoading}
                className="w-full h-12 bg-transparent px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50"
                required
              />
            </div>
          </div>

          {/* Account Role Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Primary Account Activity
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'both', label: 'Buyer & Seller' },
                { id: 'buyer', label: 'Buyer' },
                { id: 'seller', label: 'Seller' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRole(item.id as 'buyer' | 'seller' | 'both')}
                  className={`h-10 px-2 rounded-xl text-xs font-semibold border transition-all duration-150 cursor-pointer ${
                    role === item.id
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-sm shadow-emerald-500/10'
                      : 'bg-[#0B0C10] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Terms Info */}
          <p className="text-[11px] text-slate-500 leading-tight pt-1">
            By creating an account, you agree to CHECKSCROW's escrow terms and dispute mediation policies.
          </p>

          {/* Primary Create Account Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-sm tracking-wide transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <span>Create account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Bottom Login Link */}
        <div className="pt-2 text-center">
          <p className="text-xs text-slate-400">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-bold text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Guest Explorer Option */}
      <div className="text-center pt-1">
        <button
          type="button"
          onClick={handlePreviewAsGuest}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors py-1.5 px-3 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Explore Dashboard UI Shell</span>
        </button>
      </div>
    </div>
  );
};

export const RegisterPage: React.FC = () => {
  const { isClerkConfigured } = useAuth();

  if (isClerkConfigured) {
    return <ClerkNativeRegisterForm />;
  }

  return <LocalNativeRegisterForm />;
};
