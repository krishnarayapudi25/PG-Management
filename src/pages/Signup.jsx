import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, Timestamp, collection, getDocs, query } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../services/firebase';

export default function Signup() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Form fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [fatherName, setFatherName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [idProof, setIdProof] = useState(null);
    const [idProofPreview, setIdProofPreview] = useState('');

    // Room selection
    const [rooms, setRooms] = useState([]);
    const [loadingRooms, setLoadingRooms] = useState(true);
    const [selectedFloor, setSelectedFloor] = useState('');
    const [selectedRoomId, setSelectedRoomId] = useState('');
    const [occupancyMap, setOccupancyMap] = useState({});

    // Fetch available rooms on mount
    useEffect(() => {
        const fetchRooms = async () => {
            try {
                const roomsSnap = await getDocs(collection(db, 'rooms'));
                const roomsData = roomsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Fetch users to calculate occupancy
                const usersSnap = await getDocs(collection(db, 'users'));
                const occupancy = {};
                usersSnap.docs.forEach(doc => {
                    const userData = doc.data();
                    if (userData.roomId && userData.accountStatus !== 'rejected') {
                        occupancy[userData.roomId] = (occupancy[userData.roomId] || 0) + 1;
                    }
                });

                setOccupancyMap(occupancy);
                setRooms(roomsData);
            } catch (err) {
                console.error('Error fetching rooms:', err);
            } finally {
                setLoadingRooms(false);
            }
        };
        fetchRooms();
    }, []);

    // Get unique floors
    const uniqueFloors = [...new Set(rooms.map(r => r.floor))].sort();

    // Get rooms for selected floor with availability
    const availableRooms = rooms
        .filter(r => r.floor === selectedFloor)
        .map(r => ({
            ...r,
            occupiedBeds: occupancyMap[r.id] || 0,
            vacantBeds: r.totalBeds - (occupancyMap[r.id] || 0)
        }))
        .filter(r => r.vacantBeds > 0);

    const handleIdProofChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                setError('File size should be less than 5MB');
                return;
            }
            setIdProof(file);
            setIdProofPreview(URL.createObjectURL(file));
        }
    };

    const validateStep1 = () => {
        if (!phone || !password || !confirmPassword) {
            setError('Please fill all required fields');
            return false;
        }
        if (phone.length !== 10 || !/^\d+$/.test(phone)) {
            setError('Please enter a valid 10-digit phone number');
            return false;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return false;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return false;
        }
        setError('');
        return true;
    };

    const validateStep2 = () => {
        if (!fullName || !fatherName || !address || !selectedRoomId) {
            setError('Please fill all required fields and select a room');
            return false;
        }
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateStep2()) return;

        setLoading(true);
        setError('');

        try {
            // Use provided email or generate placeholder from phone
            const signupEmail = email || `${phone}@hotel.com`;

            // Create auth user
            const userCredential = await createUserWithEmailAndPassword(auth, signupEmail, password);
            const user = userCredential.user;

            // Upload ID proof if provided
            let idProofUrl = '';
            if (idProof) {
                const storageRef = ref(storage, `idProofs/${user.uid}/${idProof.name}`);
                await uploadBytes(storageRef, idProof);
                idProofUrl = await getDownloadURL(storageRef);
            }

            // Create user document
            await setDoc(doc(db, 'users', user.uid), {
                fullName,
                fatherName,
                email: signupEmail,
                phone, // Phone is now captured in step 1 but saved here
                address,
                idProofUrl,
                roomId: selectedRoomId, // Store selected room ID
                roomName: rooms.find(r => r.id === selectedRoomId)?.roomName || '',
                floor: selectedFloor,
                role: 'guest',
                accountStatus: 'pending',
                createdAt: Timestamp.now(),
            });

            // Navigate to pending page
            navigate('/pending');
        } catch (err) {
            console.error('Signup error:', err);
            if (err.code === 'auth/email-already-in-use') {
                setError('An account with this email already exists');
            } else if (err.code === 'auth/invalid-email') {
                setError('Invalid email address');
            } else if (err.code === 'auth/weak-password') {
                setError('Password is too weak');
            } else {
                setError('Failed to create account. Please try again');
            }
        } finally {
            setLoading(false);
        }
    };

    const nextStep = () => {
        if (step === 1 && validateStep1()) {
            setStep(2);
        }
    };

    const prevStep = () => {
        setStep(1);
        setError('');
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
                    </div>
                    <h1 style={styles.title}>Create Account</h1>
                    <p style={styles.subtitle}>Join us and experience premium hospitality</p>
                </div>

                {/* Progress Indicator */}
                <div style={styles.progress}>
                    <div style={styles.progressStep}>
                        <div style={{
                            ...styles.progressDot,
                            ...(step >= 1 ? styles.progressDotActive : {})
                        }}>1</div>
                        <span style={styles.progressLabel}>Account</span>
                    </div>
                    <div style={{
                        ...styles.progressLine,
                        ...(step >= 2 ? styles.progressLineActive : {})
                    }}></div>
                    <div style={styles.progressStep}>
                        <div style={{
                            ...styles.progressDot,
                            ...(step >= 2 ? styles.progressDotActive : {})
                        }}>2</div>
                        <span style={styles.progressLabel}>Profile</span>
                    </div>
                </div>

                {/* Signup Card */}
                <div style={styles.card}>
                    {error && (
                        <div style={styles.errorAlert}>
                            <span>⚠️ {error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={styles.form}>
                        {/* Step 1: Account Details */}
                        {step === 1 && (
                            <div style={styles.stepContent}>
                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>Phone Number (User ID) *</label>
                                    <div style={styles.inputWrapper}>
                                        <span style={styles.inputIcon}>📱</span>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="Enter 10-digit mobile number"
                                            style={styles.input}
                                            maxLength="10"
                                            required
                                        />
                                    </div>
                                </div>

                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>Email Address (Optional)</label>
                                    <div style={styles.inputWrapper}>
                                        <span style={styles.inputIcon}>📧</span>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="Enter email (optional)"
                                            style={styles.input}
                                        />
                                    </div>
                                </div>

                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>Password *</label>
                                    <div style={styles.inputWrapper}>
                                        <span style={styles.inputIcon}>🔒</span>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Create a password"
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

                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>Confirm Password *</label>
                                    <div style={styles.inputWrapper}>
                                        <span style={styles.inputIcon}>🔐</span>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Confirm your password"
                                            style={styles.input}
                                            required
                                        />
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={nextStep}
                                    style={styles.nextBtn}
                                >
                                    Continue →
                                </button>
                            </div>
                        )}

                        {/* Step 2: Profile Details */}
                        {step === 2 && (
                            <div style={styles.stepContent}>
                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>Full Name *</label>
                                    <div style={styles.inputWrapper}>
                                        <span style={styles.inputIcon}>👤</span>
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="Enter your full name"
                                            style={styles.input}
                                            required
                                        />
                                    </div>
                                </div>

                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>Father's Name *</label>
                                    <div style={styles.inputWrapper}>
                                        <span style={styles.inputIcon}>👨</span>
                                        <input
                                            type="text"
                                            value={fatherName}
                                            onChange={(e) => setFatherName(e.target.value)}
                                            placeholder="Enter father's name"
                                            style={styles.input}
                                            required
                                        />
                                    </div>
                                </div>

                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>Address *</label>
                                    <div style={styles.inputWrapper}>
                                        <span style={styles.inputIcon}>📍</span>
                                        <input
                                            type="text"
                                            value={address}
                                            onChange={(e) => setAddress(e.target.value)}
                                            placeholder="Enter your address"
                                            style={styles.input}
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Room Selection Section */}
                                <div style={styles.roomSelectionSection}>
                                    <h4 style={styles.roomSelectionTitle}>🏠 Select Your Room *</h4>

                                    {loadingRooms ? (
                                        <div style={styles.roomLoading}>Loading available rooms...</div>
                                    ) : rooms.length === 0 ? (
                                        <div style={styles.noRooms}>No rooms available. Please contact admin.</div>
                                    ) : (
                                        <>
                                            <div style={styles.inputGroup}>
                                                <label style={styles.label}>Floor *</label>
                                                <select
                                                    value={selectedFloor}
                                                    onChange={(e) => {
                                                        setSelectedFloor(e.target.value);
                                                        setSelectedRoomId('');
                                                    }}
                                                    style={styles.select}
                                                >
                                                    <option value="">Select a floor</option>
                                                    {uniqueFloors.map(floor => (
                                                        <option key={floor} value={floor}>{floor}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {selectedFloor && (
                                                <div style={styles.inputGroup}>
                                                    <label style={styles.label}>Room *</label>
                                                    {availableRooms.length === 0 ? (
                                                        <div style={styles.noRooms}>No vacant rooms on this floor</div>
                                                    ) : (
                                                        <div style={styles.roomGrid}>
                                                            {availableRooms.map(room => (
                                                                <div
                                                                    key={room.id}
                                                                    onClick={() => setSelectedRoomId(room.id)}
                                                                    style={{
                                                                        ...styles.roomCard,
                                                                        ...(selectedRoomId === room.id ? styles.roomCardSelected : {})
                                                                    }}
                                                                >
                                                                    <div style={styles.roomName}>{room.roomName}</div>
                                                                    <div style={styles.roomDetails}>
                                                                        {room.sharingType}-Sharing
                                                                    </div>
                                                                    <div style={styles.roomBeds}>
                                                                        🛏️ {room.vacantBeds} bed(s) available
                                                                    </div>
                                                                    <div style={styles.roomRent}>
                                                                        ₹{room.rentPerBed?.toLocaleString()}/bed
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>ID Proof (Optional)</label>
                                    <div style={styles.fileUpload}>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleIdProofChange}
                                            style={styles.fileInput}
                                            id="idProof"
                                        />
                                        <label htmlFor="idProof" style={styles.fileLabel}>
                                            {idProofPreview ? (
                                                <img src={idProofPreview} alt="ID Preview" style={styles.filePreview} />
                                            ) : (
                                                <div style={styles.filePlaceholder}>
                                                    <span style={styles.fileIcon}>📄</span>
                                                    <span>Click to upload ID proof</span>
                                                    <span style={styles.fileHint}>JPG, PNG (Max 5MB)</span>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div style={styles.buttonGroup}>
                                    <button
                                        type="button"
                                        onClick={prevStep}
                                        style={styles.backBtn}
                                    >
                                        ← Back
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        style={styles.submitBtn}
                                    >
                                        {loading ? (
                                            <span style={styles.btnContent}>
                                                <span style={styles.spinnerSmall}></span>
                                                Creating...
                                            </span>
                                        ) : (
                                            <span>🚀 Create Account</span>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </form>

                    <div style={styles.divider}>
                        <span style={styles.dividerLine}></span>
                        <span style={styles.dividerText}>or</span>
                        <span style={styles.dividerLine}></span>
                    </div>

                    <p style={styles.loginText}>
                        Already have an account?{' '}
                        <Link to="/login" style={styles.loginLink}>
                            Sign In
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
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 0.8; }
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
        maxWidth: '480px',
        position: 'relative',
        zIndex: 10,
    },
    header: {
        textAlign: 'center',
        marginBottom: '1.5rem',
    },
    logoContainer: {
        display: 'inline-block',
        marginBottom: '1rem',
    },
    logo: {
        width: '70px',
        height: '70px',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
        borderRadius: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '2rem',
        boxShadow: '0 8px 30px rgba(99, 102, 241, 0.4)',
        animation: 'glow 3s ease-in-out infinite',
    },
    title: {
        color: 'white',
        fontSize: '1.75rem',
        fontWeight: '800',
        margin: '0 0 0.5rem',
        background: 'linear-gradient(135deg, #ffffff 0%, #c7d2fe 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
    },
    subtitle: {
        color: '#94a3b8',
        fontSize: '0.95rem',
        margin: 0,
    },
    progress: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '1.5rem',
        gap: '0.5rem',
    },
    progressStep: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.25rem',
    },
    progressDot: {
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        background: 'rgba(99, 102, 241, 0.2)',
        border: '2px solid rgba(99, 102, 241, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
        fontSize: '0.9rem',
        fontWeight: '600',
        transition: 'all 0.3s',
    },
    progressDotActive: {
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        border: '2px solid #818cf8',
        color: 'white',
        boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
    },
    progressLine: {
        width: '60px',
        height: '3px',
        background: 'rgba(99, 102, 241, 0.2)',
        borderRadius: '2px',
        marginBottom: '1.25rem',
        transition: 'all 0.3s',
    },
    progressLineActive: {
        background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)',
    },
    progressLabel: {
        color: '#64748b',
        fontSize: '0.75rem',
        fontWeight: '500',
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
    },
    stepContent: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
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
        padding: '0.875rem 1rem 0.875rem 3rem',
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
    fileUpload: {
        position: 'relative',
    },
    fileInput: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        opacity: 0,
        cursor: 'pointer',
    },
    fileLabel: {
        display: 'block',
        background: 'rgba(15, 23, 42, 0.6)',
        border: '2px dashed rgba(99, 102, 241, 0.3)',
        borderRadius: '14px',
        padding: '1.5rem',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    filePlaceholder: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
        color: '#94a3b8',
        fontSize: '0.9rem',
    },
    fileIcon: {
        fontSize: '2rem',
    },
    fileHint: {
        fontSize: '0.75rem',
        color: '#64748b',
    },
    filePreview: {
        maxWidth: '100%',
        maxHeight: '150px',
        borderRadius: '8px',
    },
    buttonGroup: {
        display: 'flex',
        gap: '1rem',
        marginTop: '0.5rem',
    },
    backBtn: {
        flex: 1,
        background: 'rgba(99, 102, 241, 0.1)',
        border: '2px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '14px',
        padding: '0.875rem',
        color: '#818cf8',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    nextBtn: {
        width: '100%',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        border: 'none',
        borderRadius: '14px',
        padding: '1rem',
        color: 'white',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
        marginTop: '0.5rem',
    },
    submitBtn: {
        flex: 2,
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        border: 'none',
        borderRadius: '14px',
        padding: '0.875rem',
        color: 'white',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
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
    loginText: {
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: '0.95rem',
        margin: 0,
    },
    loginLink: {
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
    // Room selection styles
    roomSelectionSection: {
        marginTop: '1rem',
        padding: '1rem',
        background: 'rgba(99, 102, 241, 0.1)',
        borderRadius: '14px',
        border: '1px solid rgba(99, 102, 241, 0.2)',
    },
    roomSelectionTitle: {
        color: '#c7d2fe',
        fontSize: '1rem',
        fontWeight: '600',
        margin: '0 0 1rem 0',
    },
    select: {
        width: '100%',
        background: 'rgba(15, 23, 42, 0.8)',
        border: '2px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '12px',
        padding: '0.875rem 1rem',
        color: 'white',
        fontSize: '1rem',
        cursor: 'pointer',
    },
    roomLoading: {
        color: '#94a3b8',
        fontSize: '0.9rem',
        textAlign: 'center',
        padding: '1rem',
    },
    noRooms: {
        color: '#f87171',
        fontSize: '0.9rem',
        textAlign: 'center',
        padding: '1rem',
        background: 'rgba(239, 68, 68, 0.1)',
        borderRadius: '8px',
    },
    roomGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '0.75rem',
    },
    roomCard: {
        background: 'rgba(15, 23, 42, 0.6)',
        border: '2px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '12px',
        padding: '1rem',
        cursor: 'pointer',
        transition: 'all 0.2s',
        textAlign: 'center',
    },
    roomCardSelected: {
        border: '2px solid #22c55e',
        background: 'rgba(34, 197, 94, 0.15)',
        boxShadow: '0 0 15px rgba(34, 197, 94, 0.3)',
    },
    roomName: {
        color: 'white',
        fontSize: '1rem',
        fontWeight: '700',
        marginBottom: '0.25rem',
    },
    roomDetails: {
        color: '#94a3b8',
        fontSize: '0.8rem',
    },
    roomBeds: {
        color: '#22c55e',
        fontSize: '0.8rem',
        marginTop: '0.5rem',
    },
    roomRent: {
        color: '#fbbf24',
        fontSize: '0.85rem',
        fontWeight: '600',
        marginTop: '0.25rem',
    },
};
