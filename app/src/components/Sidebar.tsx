import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  CreditCard,
  User,
  Bell,
  Settings,
  Users,
  ArrowLeftRight,
  Shield,
  Gavel,
  Landmark,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Gift,
  X,
  Bug,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';

interface SidebarProps {
  isAdmin?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  isMobile?: boolean;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  badge?: boolean;
}

const userNavItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/wallet', label: 'Wallet', icon: Wallet },
  { path: '/gift-cards', label: 'Gift Cards', icon: Gift },
  { path: '/profile', label: 'Profile', icon: User },
  { path: '/notifications', label: 'Notifications', icon: Bell, badge: true },
];

const adminNavItems: NavItem[] = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/users', label: 'Users', icon: Users },
  { path: '/admin/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { path: '/admin/gift-cards', label: 'Gift Cards', icon: Gift },
  { path: '/admin/kyc', label: 'KYC Verification', icon: Shield },
  { path: '/admin/wallet', label: 'Admin Wallet', icon: Wallet },
  { path: '/admin/appeals', label: 'Appeals', icon: Gavel },
  { path: '/admin/errors', label: 'Error Reports', icon: Bug },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ isAdmin = false, collapsed = false, onToggle, isMobile = false }: SidebarProps) {
  const { logout } = useAuth();
  const { unreadCount } = useNotifications();
  const navItems = isAdmin ? adminNavItems : userNavItems;

  return (
    <div className="flex h-full flex-col bg-white shadow-xl dark:bg-gray-800">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b px-4 dark:border-gray-700">
        <div className={cn('flex items-center gap-3', collapsed && !isMobile && 'justify-center')}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600">
            <Gift className="h-5 w-5 text-white" />
          </div>
          {(!collapsed || isMobile) && (
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {isAdmin ? 'Admin Panel' : 'GiftCard Pro'}
            </span>
          )}
        </div>
        {isMobile && (
          <button
            onClick={onToggle}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {!isMobile && (
          <button
            onClick={onToggle}
            className="hidden rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700 lg:block"
          >
            {collapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                onClick={isMobile ? onToggle : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                    isActive
                      ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
                    collapsed && !isMobile && 'justify-center'
                  )
                }
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {(!collapsed || isMobile) && (
                  <span className="flex-1">{item.label}</span>
                )}
                {item.badge && unreadCount > 0 && (!collapsed || isMobile) && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Quick Actions for User */}
        {!isAdmin && (!collapsed || isMobile) && (
          <div className="mt-8">
            <p className="mb-2 px-3 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Quick Actions
            </p>
            <ul className="space-y-2">
              <li>
                <NavLink
                  to="/gift-cards/submit"
                  onClick={isMobile ? onToggle : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                      isActive
                        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    )
                  }
                >
                  <CreditCard className="h-5 w-5" />
                  <span>Sell Gift Card</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/wallet/withdrawal"
                  onClick={isMobile ? onToggle : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                      isActive
                        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    )
                  }
                >
                  <Landmark className="h-5 w-5" />
                  <span>Withdraw</span>
                </NavLink>
              </li>
            </ul>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t p-4 dark:border-gray-700">
        <button
          onClick={logout}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20',
            collapsed && !isMobile && 'justify-center'
          )}
        >
          <LogOut className="h-5 w-5" />
          {(!collapsed || isMobile) && <span>Logout</span>}
        </button>
      </div>
    </div>
  );
}
