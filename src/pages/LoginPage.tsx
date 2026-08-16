import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSignIn, useClerk } from '@clerk/clerk-react';
import { useAuth } from '../hooks/useAuth';
import { GoogleButton } from '../components/ui/GoogleButton';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

/**
 * Clerk-Powered Android Native Login Form Component
 * Connects directly to existing Clerk authentication (Google OAuth & Email/Password)
 */
const ClerkNativeLoginForm: React.FC = () => {
  const { isLoaded, signIn, setActive } = useSignIn();
  const clerk = useClerk();
  const { setGuestExplorer } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    if (!isLoaded || !signIn) {
      // Fallback to clerk general openSignIn if hook is still preparing
      try {
        clerk.openSignIn();
      } catch (err: unknown) {
        console.warn('Clerk Google OAuth fallback error:', err);
      }
      return;
    }

    setIsGoogleLoading(true);
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/dashboard',
        redirectUrlComplete: '/dashboard',
      });
    } catch (err: unknown) {
      setIsGoogleLoading(false);
      const clerkErr = err as { errors?: Array<{ message?: string; longMessage?: string }> };
      const msg = clerkErr?.errors?.[0]?.longMessage || clerkErr?.errors?.[0]?.message || 'Google sign-in could not be completed. Please try again.';
      setErrorMessage(msg);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please enter your email address and password.');
      return;
    }

    if (!isLoaded || !signIn) {
      setErrorMessage('Authentication service is initializing. Please wait a moment.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === 'complete') {
        if (setActive) {
          await setActive({ session: result.createdSessionId });
        }
        navigate('/dashboard');
      } else if (result.status === 'needs_first_factor' || result.status === 'needs_second_factor') {
        setErrorMessage('Additional verification required for your account.');
      } else {
        setErrorMessage(`Sign-in status: ${result.status}. Please check your credentials.`);
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ message?: string; longMessage?: string; code?: string }> };
      const firstErr = clerkErr?.errors?.[0];
      if (firstErr?.code === 'form_identifier_not_found' || firstErr?.code === 'form_password_incorrect') {
        setErrorMessage('Incorrect email address or password. Please try again.');
      } else {
        setErrorMessage(firstErr?.longMessage || firstErr?.message || 'Unable to sign in. Please verify your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreviewAsGuest = () => {
    setGuestExplorer(true);
    navigate('/dashboard');
  };

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
            Welcome back
          </h1>
          <p className="text-xs text-slate-400 max-w-xs">
            Sign in to continue to CHECKSCROW.
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
            onClick={handleGoogleSignIn}
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

        {/* 2. Email / Password Login Form */}
        <form onSubmit={handleEmailSignIn} className="space-y-4">
          {/* Email Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="login-email"
              className="block text-xs font-medium text-slate-300"
            >
              Email address
            </label>
            <div className="relative flex items-center rounded-xl bg-[#0B0C10] border border-slate-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <span className="pl-3.5 text-slate-400 pointer-events-none">
                <Mail className="w-4 h-4" />
              </span>
              <input
                id="login-email"
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

          {/* Password Input with Visibility Toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-slate-300"
              >
                Password
              </label>
              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  setErrorMessage('Password reset instructions will be sent to your registered email address.');
                }}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Forgot password?
              </a>
            </div>
            <div className="relative flex items-center rounded-xl bg-[#0B0C10] border border-slate-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <span className="pl-3.5 text-slate-400 pointer-events-none">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
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

          {/* Primary Sign In Button */}
          <button
            type="submit"
            disabled={isLoading || isGoogleLoading}
            className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-sm tracking-wide transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Bottom Registration Prompt */}
        <div className="pt-2 text-center">
          <p className="text-xs text-slate-400">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="font-bold text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
            >
              Create account
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
const LocalNativeLoginForm: React.FC = () => {
  const { login, isLoading, error, clearError, setGuestExplorer } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim() || !password) {
      setLocalError('Please enter your email and password.');
      return;
    }

    const success = await login({ email: email.trim(), password });
    if (success) {
      navigate('/dashboard');
    }
  };

  const handleGoogleSignIn = () => {
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
            Welcome back
          </h1>
          <p className="text-xs text-slate-400 max-w-xs">
            Sign in to continue to CHECKSCROW.
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
            onClick={handleGoogleSignIn}
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

        {/* 2. Email / Password Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="local-login-email"
              className="block text-xs font-medium text-slate-300"
            >
              Email address
            </label>
            <div className="relative flex items-center rounded-xl bg-[#0B0C10] border border-slate-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <span className="pl-3.5 text-slate-400 pointer-events-none">
                <Mail className="w-4 h-4" />
              </span>
              <input
                id="local-login-email"
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

          {/* Password Input with Visibility Toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="local-login-password"
                className="block text-xs font-medium text-slate-300"
              >
                Password
              </label>
              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  setLocalError('Password reset link will be sent to your email.');
                }}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Forgot password?
              </a>
            </div>
            <div className="relative flex items-center rounded-xl bg-[#0B0C10] border border-slate-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <span className="pl-3.5 text-slate-400 pointer-events-none">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="local-login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
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

          {/* Primary Sign In Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-sm tracking-wide transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Bottom Registration Prompt */}
        <div className="pt-2 text-center">
          <p className="text-xs text-slate-400">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="font-bold text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
            >
              Create account
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

export const LoginPage: React.FC = () => {
  const { isClerkConfigured } = useAuth();

  if (isClerkConfigured) {
    return <ClerkNativeLoginForm />;
  }

  return <LocalNativeLoginForm />;
};
