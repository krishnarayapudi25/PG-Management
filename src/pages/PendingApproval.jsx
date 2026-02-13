import { useNavigate } from 'react-router-dom';
import { auth } from '../services/firebase';

export default function PendingApproval() {
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await auth.signOut();
            navigate('/login');
        } catch (err) {
            console.error('Logout error:', err);
        }
    };

    return (
        <div style={styles.container}>
            {/* Animated Background */}
            <div style={styles.bgOrb1}></div>
            <div style={styles.bgOrb2}></div>
            <div style={styles.bgOrb3}></div>

            <div style={styles.content}>
                {/* Animated Icon */}
                <div style={styles.iconContainer}>
                    <div style={styles.iconRing}></div>
                    <div style={styles.iconRing2}></div>
                    <div style={styles.icon}>⏳</div>
                </div>

                <h1 style={styles.title}>Approval Pending</h1>
                <p style={styles.subtitle}>Your account is being reviewed</p>

                <div style={styles.card}>
                    <div style={styles.step}>
                        <div style={styles.stepIconDone}>✓</div>
                        <div style={styles.stepContent}>
                            <p style={styles.stepTitle}>Account Created</p>
                            <p style={styles.stepDesc}>Your registration was successful</p>
                        </div>
                    </div>

                    <div style={styles.stepLine}></div>

                    <div style={styles.step}>
                        <div style={styles.stepIconActive}>
                            <span style={styles.stepSpinner}></span>
                        </div>
                        <div style={styles.stepContent}>
                            <p style={styles.stepTitle}>Under Review</p>
                            <p style={styles.stepDesc}>Admin is verifying your details</p>
                        </div>
                    </div>

                    <div style={styles.stepLine}></div>

                    <div style={styles.step}>
                        <div style={styles.stepIconPending}>3</div>
                        <div style={styles.stepContent}>
                            <p style={styles.stepTitlePending}>Access Granted</p>
                            <p style={styles.stepDesc}>You'll get full access once approved</p>
                        </div>
                    </div>
                </div>

                <div style={styles.infoCard}>
                    <span style={styles.infoIcon}>💡</span>
                    <div>
                        <p style={styles.infoTitle}>What happens next?</p>
                        <p style={styles.infoText}>
                            Once the admin approves your account, you'll receive full access to the Guest Portal.
                            This usually takes 24-48 hours.
                        </p>
                    </div>
                </div>

                <button onClick={handleLogout} style={styles.logoutBtn}>
                    <span>🚪</span> Sign Out
                </button>

                <p style={styles.footer}>🏨 Hotel Management System</p>
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
                    50% { opacity: 0.8; transform: scale(1.1); }
                }
                @keyframes ripple {
                    0% { transform: scale(0.8); opacity: 1; }
                    100% { transform: scale(2); opacity: 0; }
                }
                * { box-sizing: border-box; }
                button:hover { opacity: 0.9; transform: translateY(-2px); }
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
        background: 'radial-gradient(circle, rgba(251, 191, 36, 0.3) 0%, transparent 70%)',
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
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%)',
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
        background: 'radial-gradient(circle, rgba(236, 72, 153, 0.15) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'pulse 6s ease-in-out infinite',
        pointerEvents: 'none',
    },
    content: {
        width: '100%',
        maxWidth: '480px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 10,
    },
    iconContainer: {
        position: 'relative',
        width: '120px',
        height: '120px',
        margin: '0 auto 2rem',
    },
    iconRing: {
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        border: '3px solid rgba(251, 191, 36, 0.3)',
        animation: 'ripple 2s ease-in-out infinite',
    },
    iconRing2: {
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        border: '3px solid rgba(251, 191, 36, 0.3)',
        animation: 'ripple 2s ease-in-out infinite 0.5s',
    },
    icon: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '2.5rem',
        boxShadow: '0 8px 30px rgba(251, 191, 36, 0.4)',
    },
    title: {
        color: 'white',
        fontSize: '2rem',
        fontWeight: '800',
        margin: '0 0 0.5rem',
        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
    },
    subtitle: {
        color: '#94a3b8',
        fontSize: '1.1rem',
        margin: '0 0 2rem',
    },
    card: {
        background: 'rgba(30, 41, 59, 0.6)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(251, 191, 36, 0.2)',
        borderRadius: '24px',
        padding: '2rem',
        marginBottom: '1.5rem',
        textAlign: 'left',
    },
    step: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '1rem',
    },
    stepIconDone: {
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '1rem',
        fontWeight: 'bold',
        flexShrink: 0,
        boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)',
    },
    stepIconActive: {
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 4px 15px rgba(251, 191, 36, 0.4)',
    },
    stepSpinner: {
        width: '20px',
        height: '20px',
        border: '3px solid rgba(255, 255, 255, 0.3)',
        borderTop: '3px solid white',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },
    stepIconPending: {
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: 'rgba(99, 102, 241, 0.2)',
        border: '2px solid rgba(99, 102, 241, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
        fontSize: '0.9rem',
        fontWeight: 'bold',
        flexShrink: 0,
    },
    stepContent: {
        paddingTop: '0.25rem',
    },
    stepTitle: {
        color: 'white',
        fontSize: '1rem',
        fontWeight: '600',
        margin: 0,
    },
    stepTitlePending: {
        color: '#64748b',
        fontSize: '1rem',
        fontWeight: '600',
        margin: 0,
    },
    stepDesc: {
        color: '#94a3b8',
        fontSize: '0.85rem',
        margin: '0.25rem 0 0',
    },
    stepLine: {
        width: '2px',
        height: '30px',
        background: 'rgba(99, 102, 241, 0.2)',
        marginLeft: '19px',
        marginTop: '0.5rem',
        marginBottom: '0.5rem',
    },
    infoCard: {
        background: 'rgba(99, 102, 241, 0.1)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '16px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '1rem',
        textAlign: 'left',
    },
    infoIcon: {
        fontSize: '1.5rem',
    },
    infoTitle: {
        color: 'white',
        fontSize: '0.95rem',
        fontWeight: '600',
        margin: '0 0 0.25rem',
    },
    infoText: {
        color: '#94a3b8',
        fontSize: '0.85rem',
        margin: 0,
        lineHeight: 1.5,
    },
    logoutBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        color: '#f87171',
        padding: '0.75rem 1.5rem',
        borderRadius: '12px',
        fontSize: '0.95rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    footer: {
        color: '#64748b',
        fontSize: '0.85rem',
        marginTop: '2rem',
    },
};
