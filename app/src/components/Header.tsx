import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Menu,
  Sun,
  Moon,
  Bell,
  User,
  ChevronDown,
  LogOut,
  Settings,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface HeaderProps {
  onMenuClick: () => void;
  isAdmin?: boolean;
}

export function Header({ onMenuClick, isAdmin = false }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, isAdmin: userIsAdmin } = useAuth();
  const { unreadCount } = useNotifications();
  const [cryptoRates] = useState([
    { symbol: 'BTC', price: 67234.56, change: 2.34 },
    { symbol: 'ETH', price: 3456.78, change: -1.23 },
    { symbol: 'USDT', price: 1.0, change: 0.01 },
  ]);

  return (
    <header className="fixed left-0 right-0 top-0 z-30 border-b bg-white/80 backdrop-blur-md dark:border-gray-700 dark:bg-gray-800/80 lg:left-auto">
      <div className="flex h-16 items-center justify-between px-4 lg:px-8">
        {/* Left side */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Crypto Ticker - Desktop only */}
          <div className="hidden items-center gap-4 md:flex">
            {cryptoRates.map((crypto) => (
              <div key={crypto.symbol} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-900 dark:text-white">
                  {crypto.symbol}
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                  ${crypto.price.toLocaleString()}
                </span>
                <span
                  className={cn(
                    'text-xs',
                    crypto.change >= 0 ? 'text-green-500' : 'text-red-500'
                  )}
                >
                  {crypto.change >= 0 ? '+' : ''}
                  {crypto.change}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>

          {/* Notifications */}
          <Link to="/notifications">
            <button className="relative rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </Link>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
                  <User className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="hidden text-left md:block">
                  <p className="text-sm font-medium">{user?.fullName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {user?.email}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex items-center gap-2 p-2 md:hidden">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
                  <User className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">{user?.fullName}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
              </div>
              <DropdownMenuSeparator className="md:hidden" />
              
              <DropdownMenuItem asChild>
                <Link to="/profile" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuItem asChild>
                <Link to="/profile/kyc" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  KYC Verification
                  {user?.kycStatus === 'PENDING' && (
                    <Badge variant="warning" className="ml-auto text-xs">
                      Pending
                    </Badge>
                  )}
                  {user?.kycStatus === 'NOT_SUBMITTED' && (
                    <Badge variant="destructive" className="ml-auto text-xs">
                      Required
                    </Badge>
                  )}
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuItem asChild>
                <Link to="/profile" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>

              {userIsAdmin && !isAdmin && (
                <DropdownMenuItem asChild>
                  <Link to="/admin" className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Admin Panel
                  </Link>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />
              
              <DropdownMenuItem
                onClick={logout}
                className="flex items-center gap-2 text-red-600"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
