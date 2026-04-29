import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SiteConfig from './pages/SiteConfig';
import Products from './pages/Products';
import Orders from './pages/Orders';
import OrderDetails from './pages/OrderDetails';
import ProductionManagement from './pages/ProductionManagement';
import ProductionDetails from './pages/ProductionDetails';
import DeliveryManagement from './pages/DeliveryManagement';
import Accounts from './pages/Accounts';
import Careers from './pages/Careers';
import Applications from './pages/Applications';
import ApplicationDetails from './pages/ApplicationDetails';
import Users from './pages/Users';
import AIAgent from './pages/AIAgent';

const ADMIN_USER_KEY = 'admin_user';

const isAuthenticated = () => {
  try {
    const raw = localStorage.getItem(ADMIN_USER_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.id);
  } catch {
    return false;
  }
};

const ProtectedLayout = () => {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Layout />;
};

function App() {
  return (
    <Router>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<ProtectedLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="site-config" element={<SiteConfig />} />
          <Route path="products" element={<Products />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetails />} />
          <Route path="production-management" element={<ProductionManagement />} />
          <Route path="production-management/:id" element={<ProductionDetails />} />
          <Route path="delivery-management" element={<DeliveryManagement />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="users" element={<Users />} />
          <Route path="careers" element={<Careers />} />
          <Route path="applications" element={<Applications />} />
          <Route path="applications/:id" element={<ApplicationDetails />} />
          <Route path="ai-agent" element={<AIAgent />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
