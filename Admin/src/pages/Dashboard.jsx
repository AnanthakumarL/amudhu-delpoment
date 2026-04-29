import { useState, useEffect, useMemo, useRef } from 'react';
import { ordersAPI, productsAPI } from '../services/api';
import { Package, ShoppingCart, TrendingUp, IndianRupee, ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    totalProducts: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(null); // 'YYYY-MM-DD'
  const isFetchingRef = useRef(false);

  useEffect(() => {
    fetchDashboardData();
    const intervalId = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(intervalId);
  }, []);

  const safeToNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const formatDateTime = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  };

  const toDateKey = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const fetchDashboardData = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const [orderStats, products, recentOrdersRes] = await Promise.all([
        ordersAPI.statistics(),
        productsAPI.list({ page: 1, page_size: 1 }),
        ordersAPI.list({ page: 1, page_size: 5 }),
      ]);
      setStats({
        totalOrders: safeToNumber(orderStats.data.total_orders),
        totalRevenue: safeToNumber(orderStats.data.total_revenue),
        totalProducts: safeToNumber(products.data.total),
      });
      setRecentOrders(recentOrdersRes.data.data || []);

      // Fetch ALL orders across pages for the calendar (backend caps page_size at 100)
      const collected = [];
      const firstPage = await ordersAPI.list({ page: 1, page_size: 100 });
      collected.push(...(firstPage.data.data || []));
      const totalPages = safeToNumber(firstPage.data.total_pages) || 1;
      for (let p = 2; p <= Math.min(totalPages, 20); p++) {
        const pageRes = await ordersAPI.list({ page: p, page_size: 100 });
        collected.push(...(pageRes.data.data || []));
      }
      setAllOrders(collected);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  // ─── Calendar derived data ────────────────────────────────────────────────
  const ordersByDate = useMemo(() => {
    const map = new Map();
    for (const o of allOrders) {
      if (o.status === 'cancelled') continue;
      const key = toDateKey(o.delivery_datetime);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(o);
    }
    return map;
  }, [allOrders]);

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarMonth]);

  const monthLabel = calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const todayKey = toDateKey(new Date());
  const selectedOrders = selectedDate ? (ordersByDate.get(selectedDate) || []) : [];

  const goPrevMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  const goNextMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));

  const statCards = [
    { title: 'Total Revenue', value: `₹${(stats.totalRevenue || 0).toFixed(2)}`, icon: IndianRupee, bg: 'bg-emerald-50', text: 'text-emerald-700' },
    { title: 'Total Orders', value: stats.totalOrders, icon: ShoppingCart, bg: 'bg-violet-50', text: 'text-violet-700' },
    { title: 'Products', value: stats.totalProducts, icon: Package, bg: 'bg-blue-50', text: 'text-blue-700' },
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-heading text-dark-900">Dashboard Overview</h1>
        <p className="text-dark-500 mt-2">Welcome back! Here's what's happening with your store today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {statCards.map((stat, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white p-6 rounded-2xl shadow-sm border border-dark-100 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-dark-500">{stat.title}</p>
                <p className="text-2xl font-bold text-dark-900 mt-2">{stat.value}</p>
              </div>
              <div className={`${stat.bg} ${stat.text} p-3 rounded-xl`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-xs text-dark-400">
              <TrendingUp className="w-3 h-3 mr-1 text-emerald-500" />
              <span className="text-emerald-500 font-medium mr-1">+12%</span>
              <span>from last month</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Activity */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-dark-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-dark-900">Recent Activity</h2>
            <button className="text-sm text-violet-600 hover:text-violet-700 font-medium">View All</button>
          </div>
          <div className="space-y-4">
            {recentOrders.length === 0 ? (
              <div className="text-sm text-dark-500">No recent orders yet.</div>
            ) : (
              recentOrders.map((order) => (
                <div
                  key={order.id || order.order_number}
                  className="flex items-center gap-4 p-3 hover:bg-dark-50 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
                    <ShoppingCart size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark-900 truncate">
                      New order #{order.order_number || '—'}
                    </p>
                    <p className="text-xs text-dark-500 truncate">
                      {formatDateTime(order.created_at)}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-dark-900">₹{safeToNumber(order.total).toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Delivery Calendar */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-dark-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-violet-600" />
              <h2 className="text-lg font-bold text-dark-900">Delivery Calendar</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={goPrevMonth} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-600">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-dark-900 min-w-[120px] text-center">{monthLabel}</span>
              <button onClick={goNextMonth} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-600">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-dark-500 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((date, idx) => {
              if (!date) return <div key={idx} />;
              const key = toDateKey(date);
              const count = ordersByDate.get(key)?.length || 0;
              const isToday = key === todayKey;
              const isSelected = key === selectedDate;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(isSelected ? null : key)}
                  className={[
                    'relative aspect-square rounded-lg text-sm flex items-start justify-start p-1.5 transition-colors border',
                    isSelected ? 'bg-violet-600 text-white border-violet-600' :
                      count > 0 ? 'bg-violet-50 text-violet-900 border-violet-200 hover:bg-violet-100' :
                      'bg-white text-dark-700 border-dark-100 hover:bg-dark-50',
                    isToday && !isSelected ? 'ring-2 ring-violet-400' : '',
                  ].join(' ')}
                >
                  <span className="font-medium">{date.getDate()}</span>
                  {count > 0 && (
                    <span className={[
                      'absolute bottom-1 right-1 min-w-[18px] h-[18px] px-1 text-[10px] rounded-full font-bold flex items-center justify-center',
                      isSelected ? 'bg-white text-emerald-700' : 'bg-emerald-500 text-white',
                    ].join(' ')}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-dark-500">Click a date to view deliveries scheduled for that day.</p>
        </div>
      </div>

      {/* Selected date deliveries panel */}
      {selectedDate && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-dark-100"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-dark-900">
                Deliveries on {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h2>
              <p className="text-sm text-dark-500 mt-1">
                {selectedOrders.length} order{selectedOrders.length === 1 ? '' : 's'} scheduled
              </p>
            </div>
            <button
              onClick={() => setSelectedDate(null)}
              className="text-sm text-dark-500 hover:text-dark-900 font-medium"
            >
              Close
            </button>
          </div>

          {selectedOrders.length === 0 ? (
            <div className="py-8 text-center text-sm text-dark-500">
              No deliveries scheduled for this date.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedOrders.map((order) => (
                <div
                  key={order.id || order.order_number}
                  className="p-4 border border-dark-100 rounded-xl hover:border-violet-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
                        <ShoppingCart size={14} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-dark-900">#{order.order_number || '—'}</p>
                        <p className="text-xs text-dark-500">{order.customer_name || 'Customer'}</p>
                      </div>
                    </div>
                    <span className={[
                      'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase',
                      order.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                        order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        order.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700',
                    ].join(' ')}>
                      {order.status || 'pending'}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-dark-600">
                    <div className="flex items-start gap-1.5">
                      <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>{formatDateTime(order.delivery_datetime)}</span>
                    </div>
                    {order.shipping_address && (
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{order.shipping_address}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-dark-100 flex items-center justify-between">
                    <span className="text-xs text-dark-500">
                      {(order.items?.length || 0)} item{(order.items?.length || 0) === 1 ? '' : 's'}
                    </span>
                    <span className="text-sm font-bold text-dark-900">₹{safeToNumber(order.total).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default Dashboard;
