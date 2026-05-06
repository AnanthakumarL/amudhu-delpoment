import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';

const ADMIN_USER_KEY = 'admin_user';

const readStoredUser = () => {
  try {
    const raw = localStorage.getItem(ADMIN_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = useMemo(() => {
    const from = location.state?.from?.pathname;
    return typeof from === 'string' && from.length > 0 ? from : '/dashboard';
  }, [location.state]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      identifier: '',
      password: '',
    },
  });

  useEffect(() => {
    const user = readStoredUser();
    if (user) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const onSubmit = async (values) => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const res = await authAPI.login(values);
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(res.data));
      toast.success('Logged in');
      navigate(redirectTo, { replace: true });
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        'Invalid credentials';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md card p-8">
        <h1 className="text-2xl font-bold text-dark-900">Admin Login</h1>
        <p className="mt-1 text-sm text-dark-600">Sign in to access the dashboard.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="label">Identifier</label>
            <input
              className="input-field"
              placeholder="Email / username"
              autoComplete="username"
              {...register('identifier', {
                required: 'Identifier is required',
                minLength: { value: 3, message: 'Minimum 3 characters' },
              })}
            />
            {errors.identifier && (
              <p className="mt-1 text-sm text-red-600">{errors.identifier.message}</p>
            )}
          </div>

          <div>
            <label className="label">Password</label>
            <input
              className="input-field"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 4, message: 'Minimum 4 characters' },
              })}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>

          <button className="btn-primary w-full" type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
