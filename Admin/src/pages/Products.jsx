import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { productsAPI, categoriesAPI, sectionsAPI } from '../services/api';
import { Plus, Edit2, Trash2, X, Search, MoreHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, categoriesRes, sectionsRes] = await Promise.all([
        productsAPI.list(),
        categoriesAPI.list(),
        sectionsAPI.list(),
      ]);
      setProducts(productsRes.data.data || []);
      setCategories(categoriesRes.data.data || []);
      setSections(sectionsRes.data.data || []);
    } catch (error) {
      toast.error('Failed to load data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchData();
      return;
    }

    try {
      const response = await productsAPI.search(searchQuery);
      setProducts(response.data || []);
    } catch (error) {
      toast.error('Search failed');
      console.error(error);
    }
  };

  const openModal = (product = null) => {
    setEditingProduct(product);
    setImageFile(null);
    if (product) {
      reset(product);
    } else {
      reset({
        name: '',
        description: '',
        price: 0,
        compare_at_price: 0,
        category_id: '',
        section_id: '',
        inventory_quantity: 0,
        is_active: true,
        featured: false,
        attributes: {}
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
    setImageFile(null);
    reset();
  };

  const onSubmit = async (data) => {
    try {
      // Normalize optional relations
      data.category_id = data.category_id ? data.category_id : null;
      data.section_id = data.section_id ? data.section_id : null;

      // Convert numeric fields
      data.price = parseFloat(data.price);
      data.compare_at_price = data.compare_at_price ? parseFloat(data.compare_at_price) : null;
      data.inventory_quantity = parseInt(data.inventory_quantity);

      if (editingProduct) {
        await productsAPI.update(editingProduct.id, data);

        if (imageFile) {
          await productsAPI.uploadImage(editingProduct.id, imageFile);
        }
        toast.success('Product updated successfully!');
      } else {
        if (!imageFile) {
          toast.error('Please upload a product image');
          return;
        }
        await productsAPI.createWithImage(data, imageFile);
        toast.success('Product created successfully!');
      }
      closeModal();
      fetchData();
    } catch (error) {
      toast.error('Failed to save product');
      console.error(error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      await productsAPI.delete(id);
      toast.success('Product deleted successfully!');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete product');
      console.error(error);
    }
  };

  const getCategoryName = (categoryId) => {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : '-';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-heading text-dark-900">Products</h1>
          <p className="text-dark-500 mt-1">Manage your product catalog</p>
        </div>
        <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-dark-100 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2.5 bg-dark-50 border border-dark-200 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
          />
          <Search className="absolute left-3 top-3 h-5 w-5 text-dark-400" />
        </div>
        <div className="flex gap-2">
          <button onClick={handleSearch} className="px-4 py-2.5 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium">Search</button>
          <button onClick={() => { setSearchQuery(''); fetchData(); }} className="px-4 py-2.5 bg-white border border-dark-200 text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium">Clear</button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-dark-100">
            <thead className="bg-dark-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Stock</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-dark-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-100">
              {products.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-16 text-center text-dark-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-dark-50 rounded-full flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 text-dark-300" />
                      </div>
                      <p className="text-lg font-medium text-dark-900">No products found</p>
                      <p className="text-sm mt-1">Try adjusting your search or add a new product.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <motion.tr
                    key={product.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-dark-50/50 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-dark-100 border border-dark-200 overflow-hidden flex items-center justify-center">
                          {product.image_url ? (
                            <img src={product.image_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs text-dark-400">No img</span>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-dark-900">{product.name}</div>
                          <div className="text-xs text-dark-500 truncate max-w-[200px]">
                            {product.description?.substring(0, 50)}...
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700">
                        {getCategoryName(product.category_id)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-dark-900">₹{product.price.toFixed(2)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={clsx(
                        "text-sm font-medium",
                        product.inventory_quantity > 0 ? "text-dark-700" : "text-red-600"
                      )}>
                        {product.inventory_quantity} units
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={clsx(
                          "px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded-full",
                          product.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-dark-100 text-dark-600'
                        )}>
                          {product.is_active ? 'Active' : 'Draft'}
                        </span>
                        {product.featured && (
                          <span className="px-2 py-0.5 inline-flex text-[10px] leading-3 font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                            Featured
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openModal(product)}
                          className="p-1.5 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-dark-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="flex justify-between items-center p-6 border-b border-dark-100">
                <h2 className="text-xl font-bold font-heading text-dark-900">
                  {editingProduct ? 'Edit Product' : 'New Product'}
                </h2>
                <button onClick={closeModal} className="p-2 text-dark-400 hover:text-dark-600 hover:bg-dark-50 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <form id="product-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="col-span-2">
                      <label className="label">Product Name</label>
                      <input
                        type="text"
                        {...register('name', { required: 'Name is required' })}
                        className="input-field"
                        placeholder="e.g. Premium Cotton T-Shirt"
                      />
                      {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
                    </div>

                    <div>
                      <label className="label">Category (Optional)</label>
                      <div className="relative">
                        <select
                          {...register('category_id')}
                          className="input-field appearance-none"
                        >
                          <option value="">No category</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>{category.name}</option>
                          ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-dark-400">
                          <MoreHorizontal className="w-4 h-4 transform rotate-90" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="label">Section (Optional)</label>
                      <div className="relative">
                        <select
                          {...register('section_id')}
                          className="input-field appearance-none"
                        >
                          <option value="">No section</option>
                          {sections.map((section) => (
                            <option key={section.id} value={section.id}>{section.name}</option>
                          ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-dark-400">
                          <MoreHorizontal className="w-4 h-4 transform rotate-90" />
                        </div>
                      </div>
                    </div>

                    <div className="col-span-2">
                      <label className="label">Description</label>
                      <textarea
                        {...register('description')}
                        className="input-field min-h-[100px]"
                        rows="3"
                        placeholder="Describe your product..."
                      />
                    </div>

                    <div>
                      <label className="label">Price (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        {...register('price', { required: 'Price is required' })}
                        className="input-field"
                        placeholder="0.00"
                      />
                      {errors.price && <p className="text-red-500 text-sm mt-1">{errors.price.message}</p>}
                    </div>

                    <div>
                      <label className="label">Original price</label>
                      <input
                        type="number"
                        step="0.01"
                        {...register('compare_at_price')}
                        className="input-field"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="label">Inventory</label>
                      <input
                        type="number"
                        {...register('inventory_quantity', { required: 'Quantity is required' })}
                        className="input-field"
                        placeholder="0"
                      />
                      {errors.inventory_quantity && <p className="text-red-500 text-sm mt-1">{errors.inventory_quantity.message}</p>}
                    </div>

                    <div className="col-span-2">
                      <label className="label">Product Image</label>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                          <label className="btn-secondary cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files && e.target.files.length > 0 ? e.target.files[0] : null;
                                setImageFile(file);
                              }}
                            />
                            Upload image
                          </label>

                          <span className="text-sm text-dark-500">
                            {imageFile ? imageFile.name : editingProduct?.image_url ? 'Current image kept' : 'No file selected'}
                          </span>
                        </div>

                        {!editingProduct && (
                          <p className="text-xs text-dark-500">Image is required for new products.</p>
                        )}
                      </div>
                    </div>

                    <div className="col-span-2 flex gap-6 p-4 bg-dark-50 rounded-xl border border-dark-100">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          {...register('is_active')}
                          className="w-5 h-5 text-violet-600 border-dark-300 rounded focus:ring-violet-500"
                        />
                        <span className="text-sm font-medium text-dark-700">Active Product</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          {...register('featured')}
                          className="w-5 h-5 text-violet-600 border-dark-300 rounded focus:ring-violet-500"
                        />
                        <span className="text-sm font-medium text-dark-700">Featured Product</span>
                      </label>
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-dark-100 bg-dark-50/50 flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" form="product-form" className="btn-primary">
                  {editingProduct ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Products;
