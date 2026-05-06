import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { clsx } from 'clsx';

const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-dark-50 flex">
      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      {/* Main Content */}
      <main
        className={clsx(
          "flex-1 transition-all duration-300 min-h-screen",
          isSidebarOpen ? "ml-[280px]" : "ml-[80px]"
        )}
      >
        <div className="p-8 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
