import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';

interface LayoutProps {
  isAdmin?: boolean;
}

export function Layout({ isAdmin = false }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 hidden h-screen transition-all duration-300 lg:block',
          sidebarCollapsed ? 'w-20' : 'w-64'
        )}
      >
        <Sidebar
          isAdmin={isAdmin}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </aside>

      {/* Mobile Sidebar */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="fixed left-0 top-0 z-50 h-screen w-64 lg:hidden">
            <Sidebar
              isAdmin={isAdmin}
              collapsed={false}
              onToggle={() => setMobileSidebarOpen(false)}
              isMobile
            />
          </aside>
        </>
      )}

      {/* Main Content */}
      <div
        className={cn(
          'transition-all duration-300',
          sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
        )}
      >
        <Header
          onMenuClick={() => setMobileSidebarOpen(true)}
          isAdmin={isAdmin}
        />
        <main className="p-4 pt-20 lg:p-8 lg:pt-24">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
