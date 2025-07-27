import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import useSiteSettings from '../useSiteSettings';
import debugLog from '../utils/debugLog';
import { DEFAULT_LOGO_URL } from '../constants';
import OptimizedImage from './OptimizedImage.jsx';
import { FiChevronLeft, FiChevronRight, FiLogOut } from 'react-icons/fi';

/**
 * Common sidebar layout.
 *
 * @param {Object} props
 * @param {boolean} [props.applySiteAccent=true] When false the sidebar will not
 * apply the global site accent color. This allows callers to control theming.
 */
const SidebarBase = ({
  tabs = [],
  logoUrl,
  logoAlt,
  applySiteAccent = true,
  collapsed = false,
  onToggleCollapse,
  LogoComponent,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const [openGroups, setOpenGroups] = React.useState({});
  const { settings } = useSiteSettings(applySiteAccent);
  const [logoReady, setLogoReady] = React.useState(false);
  const logoSrc = logoUrl || settings.logoUrl || DEFAULT_LOGO_URL;

  React.useEffect(() => {
    if (LogoComponent) {
      setLogoReady(true);
    }
  }, [LogoComponent]);

  const handleClick = (tab) => {
    debugLog('Navigate to', tab.path);
    if (tab.path) {
      navigate(tab.path);
    }
    // Close the mobile menu when a tab is selected
    setOpen(false);
  };

  const handleLogout = () => {
    signOut(auth).catch((err) => console.error('Failed to sign out', err));
  };

  const toggleGroup = (label) =>
    setOpenGroups((g) => ({ ...g, [label]: !g[label] }));

  const menuItems = (
    <>
      {tabs.map((tab) => {
        const ParentIcon = tab.icon;
        const currentPath = location.pathname + location.search;
        if (tab.children && !collapsed) {
          const activeChild = tab.children.some((c) => currentPath.startsWith(c.path));
          const isOpen = openGroups[tab.label] || activeChild;
          const parentClasses =
            (activeChild
              ? 'text-accent font-medium border border-accent dark:border-accent bg-accent-10 '
              : 'text-gray-700 dark:text-gray-200 hover:bg-accent-10 border border-transparent dark:!border-transparent ') +
            'rounded-xl w-full text-center px-3 py-[0.9rem] transition-colors duration-200 flex items-center justify-center overflow-hidden';
          return (
            <div key={tab.label} className="space-y-1">
              <button onClick={() => toggleGroup(tab.label)} className={parentClasses + ' focus:outline-none'}>
                <span className={`flex items-center gap-1 ${collapsed ? 'justify-center' : 'justify-start'}`}>
                  {ParentIcon && <ParentIcon className="text-lg shrink-0" aria-hidden="true" />}
                  <span
                    className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[10rem] ml-1'}`}
                  >
                    {tab.label}
                  </span>
                </span>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96' : 'max-h-0'}`}
              >
                <div className="mt-1 space-y-1">
                  {tab.children.map((child) => {
                    const ChildIcon = child.icon;
                    const isActive = child.path && currentPath.startsWith(child.path);
                    const childClasses =
                      (isActive
                        ? 'text-accent font-medium border border-accent dark:border-accent bg-accent-10 '
                        : 'text-gray-700 dark:text-gray-200 hover:bg-accent-10 border border-transparent dark:!border-transparent ') +
                      'rounded-lg w-full text-center text-sm px-3 py-2 transition-colors duration-200 flex items-center justify-center overflow-hidden';
                    return (
                      <button
                        key={child.label}
                        onClick={() => handleClick(child)}
                        className={childClasses + ' focus:outline-none'}
                      >
                        <span className={`flex items-center gap-1 ${collapsed ? 'justify-center' : 'justify-start'}` }>
                          {ChildIcon && <ChildIcon className="text-lg shrink-0" aria-hidden="true" />}
                          <span
                            className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[10rem] ml-1'}`}
                          >
                            {child.label}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        }

        const isActive =
          (tab.children && collapsed
            ? tab.children.some((c) => currentPath.startsWith(c.path))
            : tab.path && currentPath.startsWith(tab.path));

        const classes =
          (collapsed
            ? (isActive
                ? 'text-accent font-medium border border-accent dark:border-accent bg-accent-10 '
                : 'text-gray-700 dark:text-gray-200 hover:bg-accent-10 border border-transparent dark:!border-transparent ')
              +
              'rounded-xl w-full text-center px-3 py-[0.9rem] transition-colors duration-200 flex items-center justify-center overflow-hidden'
            : (isActive
                ? 'text-accent font-medium border border-accent dark:border-accent bg-accent-10 '
                : 'text-gray-700 dark:text-gray-200 hover:bg-accent-10 border border-transparent dark:!border-transparent ')
              +
              'rounded-xl w-full text-center px-3 py-[0.9rem] transition-colors duration-200 flex items-center justify-center overflow-hidden') +
          ' focus:outline-none';
        const Icon = tab.icon;
        return (
          <button
            key={tab.label}
            onClick={() => handleClick(tab)}
            className={classes}
            title={collapsed ? tab.label : undefined}
          >
            <span className={`flex items-center gap-1 ${collapsed ? 'justify-center' : 'justify-start'}` }>
              {Icon && <Icon className="text-lg shrink-0" aria-hidden="true" />}
              <span
                className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[10rem] ml-1'}`}
              >
                {tab.label}
              </span>
            </span>
          </button>
        );
      })}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div
        className={`hidden md:flex fixed top-0 left-0 ${collapsed ? 'w-16 px-2 py-4' : 'w-[250px] p-4'} border-r bg-white dark:bg-[var(--dark-sidebar-bg)] dark:border-[var(--dark-sidebar-hover)] flex-col h-screen justify-between transition-all duration-300`}
      >
        <div className="space-y-2">
          <div className="relative mx-auto mt-4 mb-4 h-16 flex-shrink-0 flex items-center justify-center">
            {!logoReady && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="loading-ring w-6 h-6" />
              </div>
            )}
            {LogoComponent ? (
              <LogoComponent isOpen={!collapsed} />
            ) : (
              <OptimizedImage
                pngUrl={logoSrc}
                alt={logoAlt || 'Logo'}
                loading="eager"
                cacheKey={logoSrc}
                className={`max-h-full w-auto ${logoReady ? '' : 'opacity-0'}`}
                onLoad={() => setLogoReady(true)}
                onError={() => setLogoReady(true)}
              />
            )}
          </div>
          {menuItems}
          {onToggleCollapse && (
            <button
              type="button"
              aria-label="Toggle sidebar"
              onClick={onToggleCollapse}
              className="my-2 mx-auto block text-xl focus:outline-none"
            >
              {collapsed ? (
                <FiChevronRight aria-hidden="true" />
              ) : (
                <FiChevronLeft aria-hidden="true" />
              )}
            </button>
          )}
        </div>
        <div className="flex flex-col items-center space-y-1">
          <button
            onClick={handleLogout}
            className="text-gray-700 dark:text-gray-200 hover:bg-accent-10 w-full text-center font-bold px-3 py-[0.9rem] rounded-xl flex items-center justify-center focus:outline-none"
          >
            <span className={`flex items-center gap-1 ${collapsed ? 'justify-center' : 'justify-start'}` }>
              <FiLogOut className="text-lg shrink-0" aria-hidden="true" />
              <span className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[10rem] ml-1'}`}>Log Out</span>
            </span>
          </button>
          <footer
            className="text-xs text-gray-400 dark:text-gray-500 text-center whitespace-nowrap overflow-hidden transition-all duration-300"
            style={{ maxWidth: collapsed ? '2.5rem' : '12rem' }}
          >
            © 2025 Studio Tak. All rights reserved.
          </footer>
        </div>
      </div>

      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label="Menu"
        className="md:hidden fixed top-4 right-2 m-2 text-2xl z-40 focus:outline-none"
        onClick={() => setOpen(true)}
      >
        &#9776;
      </button>

        {open && (
          <div className="fixed inset-0 bg-white dark:bg-[var(--dark-sidebar-bg)] p-4 flex flex-col h-full justify-between z-50">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute top-4 right-4 text-2xl focus:outline-none"
              onClick={() => setOpen(false)}
            >
              &times;
            </button>
            <div className="space-y-2 mt-8">
              <div className="relative mx-auto mt-4 mb-4 h-16 flex items-center justify-center">
                {!logoReady && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="loading-ring w-6 h-6" />
                  </div>
                )}
                {LogoComponent ? (
                  <LogoComponent isOpen={!collapsed} />
                ) : (
                  <OptimizedImage
                    pngUrl={logoSrc}
                    alt={logoAlt || 'Logo'}
                    loading="eager"
                    cacheKey={logoSrc}
                    className={`max-h-full w-auto ${logoReady ? '' : 'opacity-0'}`}
                    onLoad={() => setLogoReady(true)}
                    onError={() => setLogoReady(true)}
                  />
                )}
              </div>
              {menuItems}
            </div>
            <div className="flex flex-col items-center space-y-1">
              <button
                onClick={handleLogout}
                className="text-gray-700 dark:text-gray-200 hover:bg-accent-10 w-full text-center font-bold px-3 py-[0.9rem] rounded-xl flex items-center justify-center focus:outline-none"
              >
                <span className={`flex items-center gap-1 ${collapsed ? 'justify-center' : 'justify-start'}` }>
                  <FiLogOut className="text-lg shrink-0" aria-hidden="true" />
                  <span className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[10rem] ml-1'}`}>Log Out</span>
                </span>
              </button>
              <footer
                className="text-xs text-gray-400 dark:text-gray-500 text-center whitespace-nowrap overflow-hidden transition-all duration-300"
                style={{ maxWidth: collapsed ? '2.5rem' : '12rem' }}
              >
                © 2025 Studio Tak. All rights reserved.
              </footer>
            </div>
          </div>
        )}
    </>
  );
};

export default SidebarBase;
