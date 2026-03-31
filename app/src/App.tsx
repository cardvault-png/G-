import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { SplashScreen } from './components/SplashScreen';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { ErrorBoundary } from './components/ErrorBoundary';

// Pages
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { VerifyOtp } from './pages/auth/VerifyOtp';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { Dashboard } from './pages/user/Dashboard';
import { Wallet } from './pages/user/Wallet';
import { Transactions } from './pages/user/Transactions';
import { GiftCards } from './pages/user/GiftCards';
import { SubmitGiftCard } from './pages/user/SubmitGiftCard';
import { Profile } from './pages/user/Profile';
import { Kyc } from './pages/user/Kyc';
import { Notifications } from './pages/user/Notifications';
import { BankAccounts } from './pages/user/BankAccounts';
import { Withdrawal } from './pages/user/Withdrawal';

// Admin Pages
import { AdminLogin } from './pages/admin/AdminLogin';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { UserManagement } from './pages/admin/UserManagement';
import { TransactionManagement } from './pages/admin/TransactionManagement';
import { GiftCardManagement } from './pages/admin/GiftCardManagement';
import { AdminLiveWall } from './pages/admin/AdminLiveWall';

// Legal Pages
import { Terms } from './pages/legal/Terms';
import { Privacy } from './pages/legal/Privacy';
import { Rules } from './pages/legal/Rules';
import { About } from './pages/legal/About';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// App content with router
function AppContent() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const splashShown = sessionStorage.getItem('giftcard_pro_splash');
    if (splashShown) {
      setShowSplash(false);
    } else {
      const timer = setTimeout(() => {
        setShowSplash(false);
        sessionStorage.setItem('giftcard_pro_splash', 'true');
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-otp" element={<VerifyOtp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        
        {/* Legal Routes */}
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/about" element={<About />} />

        {/* User Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/wallet/transactions" element={<Transactions />} />
            <Route path="/wallet/withdrawal" element={<Withdrawal />} />
            <Route path="/gift-cards" element={<GiftCards />} />
            <Route path="/gift-cards/submit" element={<SubmitGiftCard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/kyc" element={<Kyc />} />
            <Route path="/profile/bank-accounts" element={<BankAccounts />} />
            <Route path="/notifications" element={<Notifications />} />
          </Route>
        </Route>

        {/* Admin Routes */}
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<UserManagement />} />
        <Route path="/admin/transactions" element={<TransactionManagement />} />
        <Route path="/admin/giftcards" element={<GiftCardManagement />} />
        <Route path="/admin/live-wall" element={<AdminLiveWall />} />

        {/* Default Redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <NotificationProvider>
              <AppContent />
            </NotificationProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
