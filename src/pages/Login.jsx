import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export default function Login() {
    const navigate = useNavigate();
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            let loginEmail = userId;

            // Check if input is a phone number (all digits)
            // If it is, convert it to the placeholder email format
            const phoneRegex = /^\d{10}$/;
            if (phoneRegex.test(userId)) {
                loginEmail = `${userId}@hotel.com`;
            }

            const userCredential = await signInWithEmailAndPassword(auth, loginEmail, password);

            // Check if user is deleted in Firestore
            const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));

            if (userDoc.exists() && userDoc.data().deleted) {
                // User is marked as deleted - sign them out
                await signOut(auth);
                setError('This account has been deleted. Please contact the administrator.');
                setLoading(false);
                return;
            }

            // Navigation will be handled by ProtectedRoute based on role
            navigate('/guest');
        } catch (err) {
            console.error('Login error:', err);

            // Fallback: Check if we can find the user by phone number in Firestore
            // This handles cases where the email is not standard (e.g. unique timestamp email from fallback creation)
            const phoneRegex = /^\d{10}$/;
            let fallbackSuccess = false;

            if ((err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email' || err.code === 'auth/invalid-credential') && phoneRegex.test(userId)) {
                try {
                    const q = query(collection(db, 'users'), where('phone', '==', userId));
                    const querySnapshot = await getDocs(q);

                    if (!querySnapshot.empty) {
                        const userData = querySnapshot.docs[0].data();
                        const actualEmail = userData.email;
                        const defaultEmail = `${userId}@hotel.com`;

                        // If we found a user and their email is different from what we guessed
                        if (actualEmail && actualEmail !== defaultEmail) {
                            // Try logging in with the retrieved email
                            const userCredential = await signInWithEmailAndPassword(auth, actualEmail, password);

                            // Check deleted status for this user too
                            const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
                            if (userDoc.exists() && userDoc.data().deleted) {
                                await signOut(auth);
                                setError('This account has been deleted. Please contact the administrator.');
                                setLoading(false);
                                return;
                            }

                            fallbackSuccess = true;
                            navigate('/guest');
                            return; // Success!
                        }
                    }
                } catch (fallbackErr) {
                    console.error("Fallback login failed:", fallbackErr);
                    // Continue to show original error
                }
            }

            if (!fallbackSuccess) {
                if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email' || err.code === 'auth/invalid-credential') {
                    setError('No account found with this Phone Number or Email');
                } else if (err.code === 'auth/wrong-password') {
                    setError('Incorrect password');
                } else if (err.code === 'auth/too-many-requests') {
                    setError('Too many failed attempts. Please try again later');
                } else {
                    setError('Failed to sign in. Please try again');
                }
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            {/* Animated Background */}
            <div style={styles.bgOrb1}></div>
            <div style={styles.bgOrb2}></div>
            <div style={styles.bgOrb3}></div>

            <div style={styles.content}>
                {/* Logo & Header */}
                <div style={styles.header}>
                    <div style={styles.logoContainer}>
                        <div style={styles.logo}>🏨</div>
                        <div style={styles.logoGlow}></div>
                    </div>
                    <h1 style={styles.title}>Welcome Back</h1>
                    <p style={styles.subtitle}>Sign in to your account to continue</p>
                </div>

                {/* Login Card */}
                <div style={styles.card}>
                    {error && (
                        <div style={styles.errorAlert}>
                            <span>⚠️ {error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={styles.form}>
                        <div style={styles.inputGroup}>
                            <label style={styles.label}>User ID (Phone / Email)</label>
                            <div style={styles.inputWrapper}>
                                <span style={styles.inputIcon}>�</span>
                                <input
                                    type="text"
                                    value={userId}
                                    onChange={(e) => setUserId(e.target.value)}
                                    placeholder="Enter mobile number or email"
                                    style={styles.input}
                                    required
                                />
                            </div>
                        </div>

                        <div style={styles.inputGroup}>
                            <label style={styles.label}>Password</label>
                            <div style={styles.inputWrapper}>
                                <span style={styles.inputIcon}>🔒</span>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    style={styles.input}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={styles.showPasswordBtn}
                                >
                                    {showPassword ? '👁️' : '👁️‍🗨️'}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={styles.submitBtn}
                        >
                            {loading ? (
                                <span style={styles.btnContent}>
                                    <span style={styles.spinnerSmall}></span>
                                    Signing in...
                                </span>
                            ) : (
                                <span style={styles.btnContent}>
                                    🚀 Sign In
                                </span>
                            )}
                        </button>
                    </form>

                    <div style={styles.divider}>
                        <span style={styles.dividerLine}></span>
                        <span style={styles.dividerText}>or</span>
                        <span style={styles.dividerLine}></span>
                    </div>

                    <p style={styles.signupText}>
                        Don't have an account?{' '}
                        <Link to="/signup" style={styles.signupLink}>
                            Create Account
                        </Link>
                    </p>
                </div>

                {/* Footer */}
                <p style={styles.footer}>
                    🏨 Hotel Management System
                </p>
            </div>

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0) rotate(0deg); }
                    50% { transform: translateY(-20px) rotate(5deg); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 0.4; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.05); }
                }
                @keyframes glow {
                    0%, 100% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.4); }
                    50% { box-shadow: 0 0 40px rgba(99, 102, 241, 0.8); }
                }
                * { box-sizing: border-box; }
                input:focus { outline: none; border-color: #818cf8 !important; box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.2); }
                button:hover:not(:disabled) { transform: translateY(-2px); }
                button:active:not(:disabled) { transform: translateY(0); }
                a { text-decoration: none; }
            `}</style>
        </div>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        position: 'relative',
        overflow: 'hidden',
    },
    bgOrb1: {
        position: 'fixed',
        top: '-20%',
        right: '-10%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'float 8s ease-in-out infinite',
        pointerEvents: 'none',
    },
    bgOrb2: {
        position: 'fixed',
        bottom: '-20%',
        left: '-10%',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(236, 72, 153, 0.2) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'float 10s ease-in-out infinite reverse',
        pointerEvents: 'none',
    },
    bgOrb3: {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(14, 165, 233, 0.15) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'pulse 6s ease-in-out infinite',
        pointerEvents: 'none',
    },
    content: {
        width: '100%',
        maxWidth: '420px',
        position: 'relative',
        zIndex: 10,
    },
    header: {
        textAlign: 'center',
        marginBottom: '2rem',
    },
    logoContainer: {
        position: 'relative',
        display: 'inline-block',
        marginBottom: '1.5rem',
    },
    logo: {
        width: '80px',
        height: '80px',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
        borderRadius: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '2.5rem',
        boxShadow: '0 8px 30px rgba(99, 102, 241, 0.4)',
        animation: 'glow 3s ease-in-out infinite',
    },
    logoGlow: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '120px',
        height: '120px',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)',
        borderRadius: '50%',
        zIndex: -1,
    },
    title: {
        color: 'white',
        fontSize: '2rem',
        fontWeight: '800',
        margin: '0 0 0.5rem',
        background: 'linear-gradient(135deg, #ffffff 0%, #c7d2fe 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
    },
    subtitle: {
        color: '#94a3b8',
        fontSize: '1rem',
        margin: 0,
    },
    card: {
        background: 'rgba(30, 41, 59, 0.6)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '24px',
        padding: '2rem',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
    },
    errorAlert: {
        background: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1.5rem',
        color: '#fca5a5',
        fontSize: '0.9rem',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
    },
    inputGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
    },
    label: {
        color: '#94a3b8',
        fontSize: '0.85rem',
        fontWeight: '500',
    },
    inputWrapper: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
    },
    inputIcon: {
        position: 'absolute',
        left: '1rem',
        fontSize: '1rem',
        pointerEvents: 'none',
    },
    input: {
        width: '100%',
        background: 'rgba(15, 23, 42, 0.6)',
        border: '2px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '14px',
        padding: '1rem 1rem 1rem 3rem',
        color: 'white',
        fontSize: '1rem',
        transition: 'all 0.2s',
    },
    showPasswordBtn: {
        position: 'absolute',
        right: '1rem',
        background: 'none',
        border: 'none',
        fontSize: '1rem',
        cursor: 'pointer',
        padding: '0.25rem',
    },
    submitBtn: {
        width: '100%',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        border: 'none',
        borderRadius: '14px',
        padding: '1rem',
        color: 'white',
        fontSize: '1.1rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
        marginTop: '0.5rem',
    },
    btnContent: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
    },
    spinnerSmall: {
        width: '20px',
        height: '20px',
        border: '3px solid rgba(255, 255, 255, 0.2)',
        borderTop: '3px solid white',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },
    divider: {
        display: 'flex',
        alignItems: 'center',
        margin: '1.5rem 0',
    },
    dividerLine: {
        flex: 1,
        height: '1px',
        background: 'rgba(99, 102, 241, 0.2)',
    },
    dividerText: {
        color: '#64748b',
        fontSize: '0.85rem',
        padding: '0 1rem',
    },
    signupText: {
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: '0.95rem',
        margin: 0,
    },
    signupLink: {
        color: '#818cf8',
        fontWeight: '600',
        transition: 'color 0.2s',
    },
    footer: {
        textAlign: 'center',
        color: '#64748b',
        fontSize: '0.85rem',
        marginTop: '2rem',
    },
};
