import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { siteConfigAPI } from '../services/api';
import { Save, Loader2, Settings, Globe, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';

const SiteConfig = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await siteConfigAPI.get();
      reset(response.data);
    } catch (error) {
      toast.error('Failed to load site configuration');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      await siteConfigAPI.update(data);
      toast.success('Site configuration updated successfully!');
    } catch (error) {
      toast.error('Failed to update site configuration');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <div className="p-3 bg-violet-100 text-violet-600 rounded-xl">
          <Settings className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-bold font-heading text-dark-900">Site Configuration</h1>
          <p className="text-dark-500 mt-1">Manage global settings for your store</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-dark-100 overflow-hidden">
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-8">
          {/* General Info */}
          <div>
            <h3 className="text-lg font-bold text-dark-900 mb-4 flex items-center gap-2 border-b border-dark-100 pb-2">
              <Globe className="w-5 h-5 text-dark-400" />
              General Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="label">Company/Store Name</label>
                <input
                  type="text"
                  {...register('company_name', { required: 'Company name is required' })}
                  className="input-field"
                  placeholder="e.g. My Amazing Store"
                />
                {errors.company_name && (
                  <p className="text-red-500 text-sm mt-1">{errors.company_name.message}</p>
                )}
              </div>

              <div className="col-span-2">
                <label className="label">Logo URL</label>
                <input
                  type="url"
                  {...register('logo_url')}
                  className="input-field"
                  placeholder="https://example.com/logo.png"
                />
                <p className="text-xs text-dark-400 mt-1">Direct link to your logo image file.</p>
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div>
            <h3 className="text-lg font-bold text-dark-900 mb-4 flex items-center gap-2 border-b border-dark-100 pb-2">
              <Settings className="w-5 h-5 text-dark-400" />
              Contact Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">Contact Email</label>
                <input
                  type="email"
                  {...register('contact_email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Invalid email address'
                    }
                  })}
                  className="input-field"
                  placeholder="support@example.com"
                />
                {errors.contact_email && (
                  <p className="text-red-500 text-sm mt-1">{errors.contact_email.message}</p>
                )}
              </div>

              <div>
                <label className="label">Contact Phone</label>
                <input
                  type="tel"
                  {...register('contact_phone')}
                  className="input-field"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div className="col-span-2">
                <label className="label">Physical Address</label>
                <textarea
                  {...register('address')}
                  className="input-field"
                  rows="3"
                  placeholder="123 Store Street, City, Country"
                />
              </div>
            </div>
          </div>

          {/* Localization */}
          <div>
            <h3 className="text-lg font-bold text-dark-900 mb-4 flex items-center gap-2 border-b border-dark-100 pb-2">
              <DollarSign className="w-5 h-5 text-dark-400" />
              Localization & Pricing
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">Currency Code</label>
                <input
                  type="text"
                  {...register('currency')}
                  className="input-field uppercase"
                  placeholder="USD"
                />
              </div>

              <div>
                <label className="label">Currency Symbol</label>
                <input
                  type="text"
                  {...register('currency_symbol')}
                  className="input-field"
                  placeholder="₹"
                  defaultValue="₹"
                />
                <p className="text-xs text-dark-400 mt-1">Symbol displayed before prices (e.g., ₹, $, €)</p>
              </div>

              <div>
                <label className="label">Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('tax_rate')}
                  className="input-field"
                  placeholder="18.0"
                  defaultValue="18.0"
                />
                <p className="text-xs text-dark-400 mt-1">GST or tax percentage (e.g., 18 for 18% GST)</p>
              </div>

              <div>
                <label className="label">Free Shipping Threshold (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('free_shipping_threshold')}
                  className="input-field"
                  placeholder="500"
                  defaultValue="500"
                />
                <p className="text-xs text-dark-400 mt-1">Minimum order value for free shipping</p>
              </div>

              <div>
                <label className="label">Timezone</label>
                <input
                  type="text"
                  {...register('timezone')}
                  className="input-field"
                  placeholder="Asia/Kolkata"
                />
              </div>
            </div>
          </div>

          {/* Banner Management */}
          <div>
            <h3 className="text-lg font-bold text-dark-900 mb-4 flex items-center gap-2 border-b border-dark-100 pb-2">
              <Settings className="w-5 h-5 text-dark-400" />
              Announcement Banner
            </h3>
            <div className="space-y-4">
              <div className="flex items-center p-4 bg-violet-50 rounded-xl border border-violet-100">
                <input
                  type="checkbox"
                  {...register('banner_enabled')}
                  className="w-5 h-5 text-violet-600 border-violet-300 rounded focus:ring-violet-500"
                />
                <div className="ml-3">
                  <label className="text-sm font-bold text-violet-900 block">Enable Banner</label>
                  <p className="text-xs text-violet-700">Display announcement banner at top of storefront</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="label">Banner Text</label>
                  <input
                    type="text"
                    {...register('banner_text')}
                    className="input-field"
                    placeholder="Free shipping on orders above ₹500! 🎉"
                  />
                  <p className="text-xs text-dark-400 mt-1">Message shown in the banner</p>
                </div>

                <div>
                  <label className="label">Banner Link (optional)</label>
                  <input
                    type="url"
                    {...register('banner_link')}
                    className="input-field"
                    placeholder="https://example.com/sale"
                  />
                  <p className="text-xs text-dark-400 mt-1">URL to navigate when banner is clicked</p>
                </div>

                <div>
                  <label className="label">Banner Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      {...register('banner_color')}
                      className="w-16 h-10 rounded border border-dark-200"
                      defaultValue="#7c3aed"
                    />
                    <input
                      type="text"
                      {...register('banner_color')}
                      className="input-field flex-1"
                      placeholder="#7c3aed"
                    />
                  </div>
                  <p className="text-xs text-dark-400 mt-1">Background color for the banner</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center p-4 bg-amber-50 rounded-xl border border-amber-100">
            <input
              type="checkbox"
              {...register('maintenance_mode')}
              className="w-5 h-5 text-amber-600 border-amber-300 rounded focus:ring-amber-500"
            />
            <div className="ml-3">
              <label className="text-sm font-bold text-amber-900 block">Maintenance Mode</label>
              <p className="text-xs text-amber-700">Enable this to temporarily disable the storefront for customers.</p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-dark-100">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center space-x-2 px-8 py-3 rounded-xl"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SiteConfig;
