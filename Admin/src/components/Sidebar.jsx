import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Settings,
    ShoppingBag,
    ShoppingCart,
    Users,
    UserCircle,
    Briefcase,
    Factory,
    Truck,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Bot
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

const Sidebar = ({ isOpen, setIsOpen }) => {
    const location = useLocation();

    const menuItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
        { icon: ShoppingBag, label: 'Products', path: '/products' },
        { icon: ShoppingCart, label: 'Orders', path: '/orders' },
        { icon: Factory, label: 'Production', path: '/production-management' },
        { icon: Truck, label: 'Delivery', path: '/delivery-management' },
        { icon: Users, label: 'Accounts', path: '/accounts' },
        { icon: UserCircle, label: 'Users', path: '/users' },
        { icon: Briefcase, label: 'Careers', path: '/careers' },
        { icon: Bot, label: 'AI Agent', path: '/ai-agent' },
        { icon: Settings, label: 'Site Config', path: '/site-config' },
    ];

    return (
        <motion.aside
            initial={false}
            animate={{ width: isOpen ? 280 : 80 }}
            className="fixed left-0 top-0 h-screen bg-white border-r border-dark-200 z-50 flex flex-col shadow-xl shadow-dark-900/5 transition-all duration-300"
        >
            {/* Header */}
            <div className="h-20 flex items-center justify-between px-6 border-b border-dark-100">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-lg">A</span>
                    </div>
                    {isOpen && (
                        <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="font-heading font-bold text-xl text-dark-900 whitespace-nowrap"
                        >
                            Admin Panel
                        </motion.span>
                    )}
                </div>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="p-1.5 rounded-lg hover:bg-dark-50 text-dark-400 hover:text-dark-900 transition-colors"
                >
                    {isOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto custom-scrollbar">
                {menuItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={clsx(
                                "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative",
                                isActive
                                    ? "bg-violet-50 text-violet-700"
                                    : "text-dark-500 hover:bg-dark-50 hover:text-dark-900"
                            )}
                        >
                            <item.icon
                                size={22}
                                className={clsx(
                                    "transition-colors flex-shrink-0",
                                    isActive ? "text-violet-600" : "text-dark-400 group-hover:text-dark-600"
                                )}
                            />
                            {isOpen && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="font-medium whitespace-nowrap"
                                >
                                    {item.label}
                                </motion.span>
                            )}
                            {!isOpen && (
                                <div className="absolute left-full ml-4 px-2 py-1 bg-dark-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                                    {item.label}
                                </div>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-dark-100">
                <button className={clsx(
                    "flex items-center gap-3 w-full px-3 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors",
                    !isOpen && "justify-center"
                )}>
                    <LogOut size={22} className="flex-shrink-0" />
                    {isOpen && (
                        <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="font-medium whitespace-nowrap"
                        >
                            Logout
                        </motion.span>
                    )}
                </button>
            </div>
        </motion.aside>
    );
};

export default Sidebar;
