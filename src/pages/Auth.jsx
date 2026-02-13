import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { User, Lock, Upload, MapPin, Phone, Mail, Shield, Loader2, Building2, ArrowRight } from 'lucide-react';

export default function Auth() {
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [isAdminMode, setIsAdminMode] = useState(false);
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        fullName: '',
        fatherName: '',
        phone: '',
        address: '',
        secretCode: ''
    });
    const [file, setFile] = useState(null);
    const [error, setError] = useState('');

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleFileChange = (e) => {
        if (e.target.files[0]) setFile(e.target.files[0]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, formData.email, formData.password);
                navigate('/admin');
            } else {
                // Validation
                if (isAdminMode) {
                    if (formData.secretCode !== 'admin123') {
                        throw new Error("Invalid Admin Secret Code.");
                    }
                    if (!formData.fullName) {
                        throw new Error("Full Name is required.");
                    }
                } else {
                    if (!formData.fatherName || !formData.phone || !formData.address || !file) {
                        throw new Error("All fields are required for guest registration.");
                    }
                }

                // Create User
                let userCredential;
                try {
                    userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                } catch (authError) {
                    throw new Error(authError.message);
                }

                const user = userCredential.user;

                // Process ID Proof
                let idProofUrl = '';
                if (file) {
                    try {
                        const isImage = file.type.startsWith('image/');

                        if (isImage) {
                            const compressImage = (file) => {
                                return new Promise((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.readAsDataURL(file);
                                    reader.onload = (event) => {
                                        const img = new Image();
                                        img.src = event.target.result;
                                        img.onload = () => {
                                            const canvas = document.createElement('canvas');
                                            const MAX_SIZE = 800;
                                            let width = img.width;
                                            let height = img.height;

                                            if (width > height && width > MAX_SIZE) {
                                                height *= MAX_SIZE / width;
                                                width = MAX_SIZE;
                                            } else if (height > MAX_SIZE) {
                                                width *= MAX_SIZE / height;
                                                height = MAX_SIZE;
                                            }

                                            canvas.width = width;
                                            canvas.height = height;
                                            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                                            resolve(canvas.toDataURL('image/jpeg', 0.7));
                                        };
                                        img.onerror = reject;
                                    };
                                    reader.onerror = reject;
                                });
                            };
                            idProofUrl = await compressImage(file);
                        } else {
                            idProofUrl = await new Promise((resolve, reject) => {
                                const reader = new FileReader();
                                reader.readAsDataURL(file);
                                reader.onload = () => resolve(reader.result);
                                reader.onerror = reject;
                            });
                        }
                    } catch (fileError) {
                        throw new Error("Failed to process ID Proof.");
                    }
                }

                // Determine Role
                const role = isAdminMode ? 'admin' : 'guest';
                const accountStatus = role === 'admin' ? 'active' : 'pending';

                // Save to Firestore
                try {
                    await setDoc(doc(db, "users", user.uid), {
                        uid: user.uid,
                        email: formData.email,
                        fullName: formData.fullName,
                        fatherName: formData.fatherName,
                        phone: formData.phone,
                        address: formData.address,
                        idProofUrl,
                        role,
                        accountStatus,
                        createdAt: new Date()
                    });
                } catch (dbError) {
                    throw new Error("Failed to save data. Check Firestore setup.");
                }

                // Redirect
                if (role === 'guest') {
                    window.location.href = '/pending';
                } else {
                    navigate('/admin');
                }
            }
        } catch (err) {
            console.error(err);
            setError(err.message.replace('Firebase: ', ''));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-indigo-900/30 to-slate-900 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
            </div>

            <div className="w-full max-w-md relative z-10">
                {/* Logo/Brand */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/30">
                        <Building2 className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-indigo-200 to-white bg-clip-text text-transparent">
                        Hotel Management
                    </h1>
                    <p className="text-gray-400 text-sm mt-2">Secure Guest Management System</p>
                </div>

                {/* Auth Card */}
                <div className="backdrop-blur-xl bg-slate-800/50 border border-slate-700/50 rounded-3xl p-8 shadow-2xl">
                    {/* Tabs */}
                    <div className="flex bg-slate-900/50 rounded-xl p-1 mb-6">
                        <button
                            onClick={() => setIsLogin(true)}
                            className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all ${isLogin
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                    : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => setIsLogin(false)}
                            className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all ${!isLogin
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                    : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Register
                        </button>
                    </div>

                    {error && (
                        <div className="bg-red-500/20 text-red-300 p-4 rounded-xl mb-6 text-sm border border-red-500/30">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Email */}
                        <div className="relative group">
                            <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-400 transition-colors" />
                            <input
                                name="email"
                                type="email"
                                placeholder="Email Address"
                                required
                                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                onChange={handleChange}
                            />
                        </div>

                        {/* Password */}
                        <div className="relative group">
                            <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-400 transition-colors" />
                            <input
                                name="password"
                                type="password"
                                placeholder="Password"
                                required
                                minLength={6}
                                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                onChange={handleChange}
                            />
                        </div>

                        {/* Signup Fields */}
                        {!isLogin && (
                            <>
                                {/* Full Name */}
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-400 transition-colors" />
                                    <input
                                        name="fullName"
                                        type="text"
                                        placeholder="Full Name"
                                        required
                                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                        onChange={handleChange}
                                    />
                                </div>

                                {/* Guest-only fields */}
                                {!isAdminMode && (
                                    <>
                                        <div className="relative group">
                                            <User className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-pink-400 transition-colors" />
                                            <input
                                                name="fatherName"
                                                type="text"
                                                placeholder="Father's Name"
                                                required
                                                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 transition-all"
                                                onChange={handleChange}
                                            />
                                        </div>

                                        <div className="relative group">
                                            <Phone className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-cyan-400 transition-colors" />
                                            <input
                                                name="phone"
                                                type="tel"
                                                placeholder="Phone Number"
                                                required
                                                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                                                onChange={handleChange}
                                            />
                                        </div>

                                        <div className="relative group">
                                            <MapPin className="absolute left-4 top-4 w-5 h-5 text-gray-400 group-focus-within:text-amber-400 transition-colors" />
                                            <textarea
                                                name="address"
                                                placeholder="Permanent Address"
                                                required
                                                rows={2}
                                                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all resize-none"
                                                onChange={handleChange}
                                            />
                                        </div>

                                        <div className="relative">
                                            <input
                                                type="file"
                                                id="id-proof"
                                                className="hidden"
                                                onChange={handleFileChange}
                                                accept="image/*,.pdf"
                                            />
                                            <label
                                                htmlFor="id-proof"
                                                className="flex items-center justify-center gap-3 w-full bg-slate-900/50 border-2 border-dashed border-slate-600 hover:border-indigo-500 rounded-xl py-4 px-4 cursor-pointer transition-all group"
                                            >
                                                <Upload className="w-6 h-6 text-gray-400 group-hover:text-indigo-400 transition-colors" />
                                                <span className="text-gray-400 group-hover:text-white transition-colors">
                                                    {file ? file.name : "Upload ID Proof (Image/PDF)"}
                                                </span>
                                            </label>
                                        </div>
                                    </>
                                )}

                                {/* Admin Mode Fields */}
                                {isAdminMode && (
                                    <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Shield className="w-5 h-5 text-amber-400" />
                                            <span className="text-amber-400 font-semibold text-sm uppercase tracking-wider">Admin Registration</span>
                                        </div>
                                        <input
                                            name="secretCode"
                                            type="password"
                                            placeholder="Enter Admin Secret Code"
                                            required
                                            className="w-full bg-slate-900/50 border border-amber-500/30 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                                            onChange={handleChange}
                                        />
                                    </div>
                                )}

                                {/* Toggle Admin/Guest Mode */}
                                <button
                                    type="button"
                                    onClick={() => setIsAdminMode(!isAdminMode)}
                                    className="w-full text-center text-sm text-gray-500 hover:text-indigo-400 transition-colors py-2"
                                >
                                    {isAdminMode ? "← Register as Guest" : "Are you a Hotel Manager? Click here"}
                                </button>
                            </>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white py-4 rounded-xl font-semibold text-lg shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    {isLogin ? 'Sign In' : 'Create Account'}
                                    <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-500 text-sm mt-6">
                    Secure • Private • Reliable
                </p>
            </div>
        </div>
    );
}
