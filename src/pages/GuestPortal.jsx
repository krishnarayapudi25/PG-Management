import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth, db, storage } from '../services/firebase';
import { collection, query, where, getDocs, addDoc, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { calculateGuestStatus } from '../utils/billingUtils';

export default function GuestPortal() {
    const { user, userDetails, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [requestAmount, setRequestAmount] = useState('');
    const [requestNote, setRequestNote] = useState('');
    const [requestDate, setRequestDate] = useState('');
    const [requestTime, setRequestTime] = useState('');
    const [requestPeriod, setRequestPeriod] = useState('AM');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Profile Completion State
    const [missingFields, setMissingFields] = useState([]);
    const [showEditProfile, setShowEditProfile] = useState(false);
    const [profileData, setProfileData] = useState({
        fatherName: '',
        address: '',
        email: '',
    });
    const [idProofFile, setIdProofFile] = useState(null);
    const [savingProfile, setSavingProfile] = useState(false);

    // Room change request states
    const [showRoomChange, setShowRoomChange] = useState(false);
    const [rooms, setRooms] = useState([]);
    const [loadingRooms, setLoadingRooms] = useState(false);
    const [selectedFloor, setSelectedFloor] = useState('');
    const [selectedRoomId, setSelectedRoomId] = useState('');
    const [roomChangeReason, setRoomChangeReason] = useState('');
    const [pendingRoomChange, setPendingRoomChange] = useState(null);
    const [occupancyMap, setOccupancyMap] = useState({});

    useEffect(() => {
        // Set default date to today
        const today = new Date();
        setRequestDate(today.toISOString().split('T')[0]);
        setRequestTime('10:00');
    }, []);

    useEffect(() => {
        if (!authLoading) {
            if (user && user.uid) {
                fetchPayments();
            } else {
                setLoading(false);
            }
        }
    }, [user, authLoading]);

    const fetchPayments = async () => {
        setLoading(true);
        setError('');
        try {
            const q = query(
                collection(db, "payments"),
                where("userId", "==", user.uid)
            );
            const snap = await getDocs(q);
            const paymentData = snap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    amount: data.amount || 0,
                    note: data.note || '',
                    status: data.status || 'pending',
                    createdAt: data.createdAt,
                    paymentDate: data.paymentDate,
                    paymentTime: data.paymentTime,
                };
            });
            paymentData.sort((a, b) => {
                const dateA = a.createdAt?.seconds || 0;
                const dateB = b.createdAt?.seconds || 0;
                return dateB - dateA;
            });
            setPayments(paymentData);
        } catch (err) {
            console.error("Error fetching payments:", err);
            setError('Failed to load payments');
        } finally {
            setLoading(false);
        }
    };

    // Fetch rooms for room change
    const fetchRooms = async () => {
        setLoadingRooms(true);
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

    // Check for missing profile details
    useEffect(() => {
        if (userDetails) {
            const missing = [];
            if (!userDetails.fatherName) missing.push("Father's Name");
            if (!userDetails.address) missing.push("Address");
            if (!userDetails.idProofUrl) missing.push("ID Proof");

            // Check if using placeholder email (assuming placeholder format is [10digits]@hotel.com)
            const isPlaceholderEmail = user.email.match(/^\d{10}@hotel\.com$/);
            if (isPlaceholderEmail) missing.push("Valid Email Address");

            setMissingFields(missing);

            // Initialize form data
            setProfileData({
                fatherName: userDetails.fatherName || '',
                address: userDetails.address || '',
                email: isPlaceholderEmail ? '' : userDetails.email || '',
            });
        }
    }, [userDetails]);

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setSavingProfile(true);
        try {
            let idProofUrl = userDetails.idProofUrl || '';

            if (idProofFile) {
                const storageRef = ref(storage, `idProofs/${user.uid}/${idProofFile.name}`);
                await uploadBytes(storageRef, idProofFile);
                idProofUrl = await getDownloadURL(storageRef);
            }

            const updates = {
                fatherName: profileData.fatherName,
                address: profileData.address,
                idProofUrl: idProofUrl,
            };

            // If email is updated (and not placeholder), we should theoretically update auth email too, 
            // but for now let's just update Firestore specific field or assume this 'email' is for contact.
            // If the system relies on Auth email, we warn user that this doesn't change login email unless we implement verifyBeforeUpdateEmail.
            // For simplicity, let's just save it to Firestore as contactEmail if meaningful, or update the main email field if that's what we use for display.
            if (profileData.email) {
                updates.email = profileData.email;
            }

            // Once all required fields are filled (basic check)
            if (profileData.fatherName && profileData.address && idProofUrl && profileData.email) {
                updates.profileComplete = true; // Mark as complete
            }

            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, updates);

            // Close modal and refresh (context usually updates automatically if listening, or we trigger reload)
            setShowEditProfile(false);
            setSuccess('Profile updated successfully!');
            // Re-check missing is handled by useEffect on userDetails update, but userDetails comes from AuthContext
            // userDetails might need a refresh. The context usually listens to doc changes.
        } catch (error) {
            console.error('Error updating profile:', error);
            setError('Failed to update profile');
        } finally {
            setSavingProfile(false);
        }
    };

    // Check for pending room change request
    const checkPendingRoomChange = async () => {
        try {
            const q = query(
                collection(db, "roomChangeRequests"),
                where("userId", "==", user.uid),
                where("status", "==", "pending")
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
                setPendingRoomChange(snap.docs[0].data());
            }
        } catch (err) {
            console.error('Error checking room change:', err);
        }
    };

    // Submit room change request
    const handleRoomChangeRequest = async () => {
        if (!selectedRoomId) {
            setError('Please select a room');
            return;
        }

        setSubmitting(true);
        try {
            const selectedRoom = rooms.find(r => r.id === selectedRoomId);

            await addDoc(collection(db, 'roomChangeRequests'), {
                userId: user.uid,
                userName: userDetails?.fullName || 'Guest',
                userEmail: user.email,
                currentRoomId: userDetails?.roomId,
                currentRoomName: userDetails?.roomName,
                currentFloor: userDetails?.floor,
                newRoomId: selectedRoomId,
                newRoomName: selectedRoom?.roomName || '',
                newFloor: selectedFloor,
                reason: roomChangeReason,
                status: 'pending',
                createdAt: Timestamp.now(),
            });

            setSuccess('Room change request submitted! Waiting for admin approval.');
            setShowRoomChange(false);
            setSelectedFloor('');
            setSelectedRoomId('');
            setRoomChangeReason('');
            checkPendingRoomChange();
        } catch (err) {
            console.error('Error submitting room change:', err);
            setError('Failed to submit room change request');
        } finally {
            setSubmitting(false);
        }
    };

    // Get unique floors and available rooms
    const uniqueFloors = [...new Set(rooms.map(r => r.floor))].sort();
    const availableRooms = rooms
        .filter(r => r.floor === selectedFloor && r.id !== userDetails?.roomId)
        .map(r => ({
            ...r,
            occupiedBeds: occupancyMap[r.id] || 0,
            vacantBeds: r.totalBeds - (occupancyMap[r.id] || 0)
        }))
        .filter(r => r.vacantBeds > 0);

    // Fetch rooms when modal opens
    useEffect(() => {
        if (showRoomChange) {
            fetchRooms();
        }
    }, [showRoomChange]);

    // Check for pending room change on load
    useEffect(() => {
        if (user?.uid) {
            checkPendingRoomChange();
        }
    }, [user]);

    const handlePaymentRequest = async (e) => {
        e.preventDefault();
        const amount = parseFloat(requestAmount);
        if (!amount || amount <= 0) {
            setError('Please enter a valid amount');
            return;
        }
        if (!requestDate) {
            setError('Please select a date');
            return;
        }
        if (!requestTime) {
            setError('Please select a time');
            return;
        }

        setSubmitting(true);
        setError('');
        setSuccess('');
        try {
            const formattedTime = `${requestTime} ${requestPeriod}`;

            // CRITICAL: Use Firestore document ID from userDetails, not Auth UID
            // This ensures payments are linked correctly even after user deletion/re-add
            // Fallback to user.uid for backward compatibility (shouldn't happen in normal flow)
            const userDocId = userDetails?.firestoreDocId || user.uid;

            await addDoc(collection(db, "payments"), {
                userId: userDocId, // Firestore document ID (primary identifier)
                userPhone: userDetails?.phone || '', // Phone number (fallback identifier)
                userName: userDetails?.fullName || 'Guest',
                userEmail: user.email || '',
                amount: amount,
                note: requestNote || '',
                paymentDate: requestDate,
                paymentTime: formattedTime,
                status: 'pending',
                createdAt: Timestamp.now()
            });
            setRequestAmount('');
            setRequestNote('');
            setRequestDate(new Date().toISOString().split('T')[0]);
            setRequestTime('10:00');
            setRequestPeriod('AM');
            setSuccess('Payment request submitted successfully!');
            setTimeout(() => setSuccess(''), 3000);
            await fetchPayments();
        } catch (err) {
            console.error("Error submitting payment:", err);
            setError('Failed to submit request');
        } finally {
            setSubmitting(false);
        }
    };

    const handleLogout = async () => {
        try {
            await auth.signOut();
            navigate('/login');
        } catch (err) {
            console.error("Logout error:", err);
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
            if (isNaN(date.getTime())) return 'N/A';
            return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { return 'N/A'; }
    };

    const formatCurrency = (amount) => {
        return Number(amount || 0).toLocaleString('en-IN');
    };

    // Calculate subscription status (30-day cycle) using centralized logic
    const { status, daysRemaining, nextDueDate, billingStats, pendingAmount: pendingDues } = calculateGuestStatus(userDetails, payments);

    // Map to existing UI structure
    const subscriptionStatus = {
        daysRemaining,
        isExpired: status === 'overdue',
        isExpiringSoon: status === 'due-soon',
        nextPaymentDate: nextDueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        startDate: billingStats?.billingStartDate ? billingStats.billingStartDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A',
        pendingDues
    };

    const approvedPayments = payments.filter(p => p.status === 'approved');
    const pendingPayments = payments.filter(p => p.status === 'pending');
    const totalPaid = approvedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const pendingRequestsTotal = pendingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    if (authLoading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.spinner}></div>
                <p style={styles.loadingText}>Loading...</p>
            </div>
        );
    }

    if (!user) {
        return (
            <div style={styles.loadingContainer}>
                <p style={{ color: '#ef4444', marginBottom: '1rem' }}>Please login to access this page</p>
                <button onClick={() => navigate('/login')} style={styles.primaryButton}>
                    Go to Login
                </button>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Animated Background */}
            <div style={styles.bgOrb1}></div>
            <div style={styles.bgOrb2}></div>
            <div style={styles.bgOrb3}></div>

            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerContent}>
                    <div style={styles.userInfo}>
                        <div style={styles.avatar}>
                            {(userDetails?.fullName || user.email || 'G').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h1 style={styles.userName}>{userDetails?.fullName || 'Guest'}</h1>
                            <p style={styles.userMeta}>
                                <span style={styles.metaIcon}>📅</span>
                                Member since {formatDate(userDetails?.createdAt)}
                            </p>
                        </div>
                    </div>
                    <button onClick={handleLogout} style={styles.logoutBtn}>
                        <span style={styles.logoutIcon}>🚪</span>
                        <span style={styles.logoutText}>Sign Out</span>
                    </button>
                </div>
            </header>

            <main style={styles.main}>
                {/* Missing Details Banner */}
                {missingFields.length > 0 && (
                    <div style={styles.actionRequiredBanner}>
                        <div style={styles.actionBannerContent}>
                            <span style={styles.actionIcon}>⚠️</span>
                            <div>
                                <h3 style={styles.actionTitle}>Action Required: Complete Your Profile</h3>
                                <p style={styles.actionText}>
                                    Please update the following details to avoid account suspension:
                                    <span style={styles.missingList}> {missingFields.join(', ')}</span>
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowEditProfile(true)}
                            style={styles.actionBtn}
                        >
                            Update Now
                        </button>
                    </div>
                )}

                {/* Alerts */}
                {error && (
                    <div style={styles.errorAlert}>
                        <span>⚠️ {error}</span>
                        <button onClick={() => setError('')} style={styles.alertClose}>✕</button>
                    </div>
                )}
                {success && (
                    <div style={styles.successAlert}>
                        <span>✓ {success}</span>
                    </div>
                )}

                {/* Subscription Alert Banner */}
                {(subscriptionStatus.isExpired || subscriptionStatus.isExpiringSoon) && (
                    <div style={{
                        ...styles.subscriptionAlert,
                        background: subscriptionStatus.isExpired
                            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)'
                            : 'linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(251, 191, 36, 0.1) 100%)',
                        borderColor: subscriptionStatus.isExpired ? 'rgba(239, 68, 68, 0.4)' : 'rgba(251, 191, 36, 0.4)',
                    }}>
                        <div style={styles.alertContent}>
                            <span style={{
                                ...styles.alertIcon,
                                background: subscriptionStatus.isExpired ? 'rgba(239, 68, 68, 0.2)' : 'rgba(251, 191, 36, 0.2)',
                            }}>
                                {subscriptionStatus.isExpired ? '🚨' : '⚠️'}
                            </span>
                            <div>
                                <p style={{
                                    ...styles.alertTitle,
                                    color: subscriptionStatus.isExpired ? '#ef4444' : '#fbbf24'
                                }}>
                                    {subscriptionStatus.isExpired ? 'Payment Overdue!' : 'Payment Due Soon!'}
                                </p>
                                <p style={styles.alertMessage}>
                                    {subscriptionStatus.isExpired
                                        ? `Your stay period has ended. Please pay ₹${formatCurrency(subscriptionStatus.pendingDues)} to continue.`
                                        : `Only ${subscriptionStatus.daysRemaining} day${subscriptionStatus.daysRemaining !== 1 ? 's' : ''} remaining. Pay before ${subscriptionStatus.nextPaymentDate} to avoid interruption.`
                                    }
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Subscription Status Card */}
                <div style={styles.subscriptionCard}>
                    <div style={styles.subscriptionHeader}>
                        <h3 style={styles.subscriptionTitle}>
                            <span>🏠</span> Stay Status
                        </h3>
                        <span style={{
                            ...styles.subscriptionBadge,
                            background: subscriptionStatus.isExpired
                                ? 'rgba(239, 68, 68, 0.2)'
                                : subscriptionStatus.isExpiringSoon
                                    ? 'rgba(251, 191, 36, 0.2)'
                                    : 'rgba(34, 197, 94, 0.2)',
                            color: subscriptionStatus.isExpired
                                ? '#ef4444'
                                : subscriptionStatus.isExpiringSoon
                                    ? '#fbbf24'
                                    : '#22c55e',
                        }}>
                            {subscriptionStatus.isExpired ? 'EXPIRED' : subscriptionStatus.isExpiringSoon ? 'EXPIRING SOON' : 'ACTIVE'}
                        </span>
                    </div>
                    <div style={styles.subscriptionBody}>
                        <div style={styles.daysCircle}>
                            <span style={{
                                ...styles.daysNumber,
                                color: subscriptionStatus.isExpired
                                    ? '#ef4444'
                                    : subscriptionStatus.isExpiringSoon
                                        ? '#fbbf24'
                                        : '#22c55e'
                            }}>
                                {subscriptionStatus.daysRemaining}
                            </span>
                            <span style={styles.daysLabel}>days left</span>
                        </div>
                        <div style={styles.subscriptionDetails}>
                            <div style={styles.subscriptionRow}>
                                <span style={styles.subscriptionDetailLabel}>Started</span>
                                <span style={styles.subscriptionDetailValue}>{subscriptionStatus.startDate || 'N/A'}</span>
                            </div>
                            <div style={styles.subscriptionRow}>
                                <span style={styles.subscriptionDetailLabel}>Next Payment</span>
                                <span style={styles.subscriptionDetailValue}>{subscriptionStatus.nextPaymentDate || 'N/A'}</span>
                            </div>
                            <div style={styles.subscriptionRow}>
                                <span style={styles.subscriptionDetailLabel}>Cycle</span>
                                <span style={styles.subscriptionDetailValue}>30 Days</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div style={styles.statsGrid}>
                    {/* Profile Card */}
                    <div style={styles.profileCard}>
                        <h3 style={styles.cardTitle}>
                            <span style={styles.cardIcon}>👤</span> Profile
                        </h3>
                        <div style={styles.profileItem}>
                            <span style={styles.profileLabel}>Father's Name</span>
                            <span style={styles.profileValue}>{userDetails?.fatherName || 'N/A'}</span>
                        </div>
                        <div style={styles.profileItem}>
                            <span style={styles.profileLabel}>Phone</span>
                            <span style={styles.profileValue}>{userDetails?.phone || 'N/A'}</span>
                        </div>
                        <div style={styles.profileItem}>
                            <span style={styles.profileLabel}>Address</span>
                            <span style={styles.profileValue}>{userDetails?.address || 'N/A'}</span>
                        </div>
                    </div>

                    {/* Total Paid Card */}
                    <div style={styles.statCard}>
                        <div style={styles.statHeader}>
                            <span style={styles.statLabel}>Total Paid</span>
                            <div style={styles.statIconGreen}>✓</div>
                        </div>
                        <p style={styles.statValueGreen}>₹{formatCurrency(totalPaid)}</p>
                        <p style={styles.statMeta}>{approvedPayments.length} approved payments</p>
                    </div>

                    {/* Pending Card */}
                    <div style={styles.statCardAmber}>
                        <div style={styles.statHeader}>
                            <span style={styles.statLabel}>Pending Requests</span>
                            <div style={styles.statIconAmber}>⏳</div>
                        </div>
                        <p style={styles.statValueAmber}>₹{formatCurrency(pendingRequestsTotal)}</p>
                        <p style={styles.statMeta}>{pendingPayments.length} awaiting approval</p>
                    </div>

                    {/* Monthly Fee Card - Set by Admin */}
                    <div style={styles.statCardRed}>
                        <div style={styles.statHeader}>
                            <span style={styles.statLabel}>Monthly Fee</span>
                            <div style={styles.statIconRed}>💰</div>
                        </div>
                        <p style={styles.statValueRed}>₹{formatCurrency(userDetails?.monthlyFee || userDetails?.pendingDues || 0)}</p>
                        <p style={styles.statMeta}>Your monthly rent</p>
                    </div>
                </div>

                {/* Current Room Card */}
                <div style={styles.roomInfoCard}>
                    <div style={styles.roomInfoHeader}>
                        <h3 style={styles.roomInfoTitle}>🏠 Your Room</h3>
                        {pendingRoomChange ? (
                            <span style={styles.pendingBadge}>⏳ Change Pending</span>
                        ) : (
                            <button
                                onClick={() => setShowRoomChange(true)}
                                style={styles.changeRoomBtn}
                            >
                                🔄 Request Change
                            </button>
                        )}
                    </div>
                    <div style={styles.roomInfoContent}>
                        <div style={styles.roomInfoItem}>
                            <span style={styles.roomInfoLabel}>Room</span>
                            <span style={styles.roomInfoValue}>{userDetails?.roomName || 'Not assigned'}</span>
                        </div>
                        <div style={styles.roomInfoItem}>
                            <span style={styles.roomInfoLabel}>Floor</span>
                            <span style={styles.roomInfoValue}>{userDetails?.floor || 'N/A'}</span>
                        </div>
                    </div>
                    {pendingRoomChange && (
                        <div style={styles.pendingChangeInfo}>
                            <p>📍 Requested: <strong>{pendingRoomChange.newRoomName}</strong> on {pendingRoomChange.newFloor}</p>
                            <p style={styles.pendingChangeNote}>Waiting for admin approval</p>
                        </div>
                    )}
                </div>

                {/* Room Change Modal */}
                {showRoomChange && (
                    <div style={styles.modal}>
                        <div style={styles.modalContent}>
                            <h3 style={styles.modalTitle}>🔄 Request Room Change</h3>

                            <div style={styles.currentRoomInfo}>
                                <p>Current Room: <strong>{userDetails?.roomName}</strong> ({userDetails?.floor})</p>
                            </div>

                            {loadingRooms ? (
                                <div style={styles.loadingText}>Loading available rooms...</div>
                            ) : (
                                <>
                                    <div style={styles.inputGroup}>
                                        <label style={styles.inputLabel}>Select Floor</label>
                                        <select
                                            value={selectedFloor}
                                            onChange={(e) => {
                                                setSelectedFloor(e.target.value);
                                                setSelectedRoomId('');
                                            }}
                                            style={styles.select}
                                        >
                                            <option value="">Choose a floor</option>
                                            {uniqueFloors.map(floor => (
                                                <option key={floor} value={floor}>{floor}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {selectedFloor && availableRooms.length > 0 && (
                                        <div style={styles.inputGroup}>
                                            <label style={styles.inputLabel}>Select New Room</label>
                                            <div style={styles.roomGrid}>
                                                {availableRooms.map(room => (
                                                    <div
                                                        key={room.id}
                                                        onClick={() => setSelectedRoomId(room.id)}
                                                        style={{
                                                            ...styles.roomOption,
                                                            ...(selectedRoomId === room.id ? styles.roomOptionSelected : {})
                                                        }}
                                                    >
                                                        <div style={styles.roomOptionName}>{room.roomName}</div>
                                                        <div style={styles.roomOptionDetails}>{room.sharingType}-Sharing</div>
                                                        <div style={styles.roomOptionBeds}>🛏️ {room.vacantBeds} available</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {selectedFloor && availableRooms.length === 0 && (
                                        <p style={styles.noRoomsText}>No vacant rooms on this floor</p>
                                    )}

                                    <div style={styles.inputGroup}>
                                        <label style={styles.inputLabel}>Reason (Optional)</label>
                                        <textarea
                                            value={roomChangeReason}
                                            onChange={(e) => setRoomChangeReason(e.target.value)}
                                            placeholder="Why do you want to change room?"
                                            style={styles.textarea}
                                            rows={3}
                                        />
                                    </div>
                                </>
                            )}

                            <div style={styles.modalActions}>
                                <button
                                    onClick={() => {
                                        setShowRoomChange(false);
                                        setSelectedFloor('');
                                        setSelectedRoomId('');
                                        setRoomChangeReason('');
                                    }}
                                    style={styles.cancelBtn}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRoomChangeRequest}
                                    disabled={!selectedRoomId || submitting}
                                    style={{
                                        ...styles.submitModalBtn,
                                        opacity: !selectedRoomId || submitting ? 0.5 : 1
                                    }}
                                >
                                    {submitting ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit Profile Modal */}
                {showEditProfile && (
                    <div style={styles.modal} onClick={() => setShowEditProfile(false)}>
                        <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                            <h3 style={styles.modalTitle}>
                                ✏️ Complete Profile
                            </h3>
                            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                                Please update the missing details below.
                            </p>
                            <form onSubmit={handleUpdateProfile} style={styles.form}>
                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>Father's Name *</label>
                                    <input
                                        type="text"
                                        value={profileData.fatherName}
                                        onChange={(e) => setProfileData({ ...profileData, fatherName: e.target.value })}
                                        placeholder="Enter father's name"
                                        style={styles.input}
                                        required
                                    />
                                </div>
                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>Complete Permanent Address *</label>
                                    <textarea
                                        value={profileData.address}
                                        onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                                        placeholder="Enter your full address"
                                        style={styles.textarea}
                                        rows={3}
                                        required
                                    />
                                </div>

                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>Email Address *</label>
                                    <input
                                        type="email"
                                        value={profileData.email}
                                        onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                                        placeholder="Enter your valid email"
                                        style={styles.input}
                                        required
                                    />
                                    {user.email.match(/^\d{10}@hotel\.com$/) && (
                                        <p style={{ color: '#fbbf24', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                            ⚠️ Currently using temporary email. Please update to a real email.
                                        </p>
                                    )}
                                </div>

                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>
                                        ID Proof (Aadhar/Voter ID) {userDetails?.idProofUrl ? '(Uploaded ✔️)' : '*'}
                                    </label>
                                    <input
                                        type="file"
                                        onChange={(e) => setIdProofFile(e.target.files[0])}
                                        style={styles.input}
                                        accept="image/*,.pdf"
                                        required={!userDetails?.idProofUrl}
                                    />
                                </div>

                                <div style={styles.modalActions}>
                                    <button
                                        type="button"
                                        onClick={() => setShowEditProfile(false)}
                                        style={styles.cancelBtn}
                                        disabled={savingProfile}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        style={styles.submitModalBtn}
                                        disabled={savingProfile}
                                    >
                                        {savingProfile ? 'Saving...' : '💾 Save Profile'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Payment Request Form */}
                <div style={styles.formCard}>
                    <h3 style={styles.formTitle}>
                        <span style={styles.formIcon}>💸</span> Raise Payment Request
                    </h3>
                    <form onSubmit={handlePaymentRequest} style={styles.form}>
                        <div className="formRow" style={styles.formRow}>
                            <div style={styles.inputGroup}>
                                <label style={styles.inputLabel}>Amount (₹) *</label>
                                <input
                                    type="number"
                                    value={requestAmount}
                                    onChange={(e) => setRequestAmount(e.target.value)}
                                    placeholder="Enter amount"
                                    style={styles.input}
                                    min="1"
                                    required
                                />
                            </div>
                            <div style={styles.inputGroup}>
                                <label style={styles.inputLabel}>Date *</label>
                                <input
                                    type="date"
                                    value={requestDate}
                                    onChange={(e) => setRequestDate(e.target.value)}
                                    style={styles.input}
                                    required
                                />
                            </div>
                        </div>
                        <div className="formRow" style={styles.formRow}>
                            <div style={styles.inputGroup}>
                                <label style={styles.inputLabel}>Time *</label>
                                <input
                                    type="time"
                                    value={requestTime}
                                    onChange={(e) => setRequestTime(e.target.value)}
                                    style={styles.input}
                                    required
                                />
                            </div>
                            <div style={styles.inputGroup}>
                                <label style={styles.inputLabel}>AM/PM *</label>
                                <div style={styles.periodToggle}>
                                    <button
                                        type="button"
                                        onClick={() => setRequestPeriod('AM')}
                                        style={{
                                            ...styles.periodBtn,
                                            ...(requestPeriod === 'AM' ? styles.periodBtnActive : {})
                                        }}
                                    >
                                        AM
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRequestPeriod('PM')}
                                        style={{
                                            ...styles.periodBtn,
                                            ...(requestPeriod === 'PM' ? styles.periodBtnActive : {})
                                        }}
                                    >
                                        PM
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div style={styles.inputGroup}>
                            <label style={styles.inputLabel}>Note (Optional)</label>
                            <input
                                type="text"
                                value={requestNote}
                                onChange={(e) => setRequestNote(e.target.value)}
                                placeholder="e.g., Room rent for January"
                                style={styles.input}
                            />
                        </div>
                        <button type="submit" disabled={submitting} style={styles.submitBtn}>
                            {submitting ? (
                                <span style={styles.btnLoading}>⏳ Submitting...</span>
                            ) : (
                                <span>🚀 Submit Request</span>
                            )}
                        </button>
                    </form>
                </div>

                {/* Payment History */}
                <div style={styles.historyCard}>
                    <h3 style={styles.historyTitle}>
                        <span style={styles.historyIcon}>📜</span> Payment History
                    </h3>

                    {loading ? (
                        <div style={styles.loadingBox}>
                            <div style={styles.spinnerSmall}></div>
                            <p style={styles.loadingText}>Loading payments...</p>
                        </div>
                    ) : payments.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={styles.emptyIcon}>💳</div>
                            <p style={styles.emptyText}>No payment history found</p>
                            <p style={styles.emptySubtext}>Submit your first payment request above</p>
                        </div>
                    ) : (
                        <div style={styles.paymentList}>
                            {payments.map((payment) => (
                                <div
                                    key={payment.id}
                                    style={{
                                        ...styles.paymentItem,
                                        ...(payment.status === 'approved' ? styles.paymentApproved :
                                            payment.status === 'rejected' ? styles.paymentRejected :
                                                styles.paymentPending)
                                    }}
                                >
                                    <div style={styles.paymentLeft}>
                                        <div style={{
                                            ...styles.paymentStatusIcon,
                                            background: payment.status === 'approved' ? 'rgba(34, 197, 94, 0.2)' :
                                                payment.status === 'rejected' ? 'rgba(239, 68, 68, 0.2)' :
                                                    'rgba(251, 191, 36, 0.2)'
                                        }}>
                                            {payment.status === 'approved' ? '✓' :
                                                payment.status === 'rejected' ? '✕' : '⏳'}
                                        </div>
                                        <div>
                                            <p style={styles.paymentAmount}>₹{formatCurrency(payment.amount)}</p>
                                            <p style={styles.paymentNote}>{payment.note || 'No note'}</p>
                                            {payment.paymentDate && (
                                                <p style={styles.paymentDateTime}>
                                                    📅 {payment.paymentDate} {payment.paymentTime && `• 🕐 ${payment.paymentTime}`}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div style={styles.paymentRight}>
                                        <span style={{
                                            ...styles.paymentStatus,
                                            color: payment.status === 'approved' ? '#22c55e' :
                                                payment.status === 'rejected' ? '#ef4444' : '#fbbf24'
                                        }}>
                                            {payment.status.toUpperCase()}
                                        </span>
                                        <span style={styles.paymentDate}>{formatDate(payment.createdAt)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Footer */}
            <footer style={styles.footer}>
                <p>🏨 Hotel Management System • Guest Portal</p>
            </footer>

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
                * { box-sizing: border-box; }
                input:focus, select:focus { outline: none; border-color: #818cf8 !important; box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.2); }
                button:hover:not(:disabled) { transform: translateY(-2px); }
                button:active:not(:disabled) { transform: translateY(0); }
                input[type="date"]::-webkit-calendar-picker-indicator,
                input[type="time"]::-webkit-calendar-picker-indicator {
                    filter: invert(1);
                    cursor: pointer;
                }
                @media (max-width: 600px) {
                    .formRow { grid-template-columns: 1fr !important; }
                }
            `}</style>
        </div>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
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
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(14, 165, 233, 0.15) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'pulse 6s ease-in-out infinite',
        pointerEvents: 'none',
    },
    loadingContainer: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
    },
    spinner: {
        width: '50px',
        height: '50px',
        border: '4px solid rgba(129, 140, 248, 0.2)',
        borderTop: '4px solid #818cf8',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '1rem',
    },
    spinnerSmall: {
        width: '30px',
        height: '30px',
        border: '3px solid rgba(129, 140, 248, 0.2)',
        borderTop: '3px solid #818cf8',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        margin: '0 auto 1rem',
    },
    loadingText: {
        color: '#94a3b8',
        fontSize: '0.9rem',
        textAlign: 'center',
        padding: '1rem',
    },
    header: {
        background: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
        padding: '1rem',
        position: 'sticky',
        top: 0,
        zIndex: 50,
    },
    headerContent: {
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
    },
    userInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
    },
    avatar: {
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '1.25rem',
        fontWeight: 'bold',
        boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
    },
    userName: {
        color: 'white',
        fontSize: '1.1rem',
        fontWeight: '700',
        margin: 0,
    },
    userMeta: {
        color: '#94a3b8',
        fontSize: '0.75rem',
        margin: '0.25rem 0 0',
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
    },
    metaIcon: {
        fontSize: '0.7rem',
    },
    logoutBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        color: '#f87171',
        padding: '0.5rem 1rem',
        borderRadius: '12px',
        fontSize: '0.85rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    logoutIcon: {
        fontSize: '1rem',
    },
    logoutText: {},
    main: {
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '1.5rem 1rem',
        position: 'relative',
        zIndex: 10,
    },
    errorAlert: {
        background: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1.5rem',
        color: '#fca5a5',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.9rem',
    },
    successAlert: {
        background: 'rgba(34, 197, 94, 0.15)',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1.5rem',
        color: '#86efac',
        fontSize: '0.9rem',
    },
    alertClose: {
        background: 'none',
        border: 'none',
        color: '#fca5a5',
        cursor: 'pointer',
        fontSize: '1rem',
    },
    subscriptionAlert: {
        borderRadius: '16px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
        border: '1px solid',
    },
    alertContent: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '1rem',
    },
    alertIcon: {
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.5rem',
        flexShrink: 0,
    },
    alertTitle: {
        fontSize: '1.1rem',
        fontWeight: '700',
        margin: '0 0 0.25rem',
    },
    alertMessage: {
        color: '#94a3b8',
        fontSize: '0.9rem',
        margin: 0,
    },
    subscriptionCard: {
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(30, 41, 59, 0.6) 100%)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '20px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
    },
    subscriptionHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.25rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
    },
    subscriptionTitle: {
        color: 'white',
        fontSize: '1.1rem',
        fontWeight: '600',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },
    subscriptionBadge: {
        padding: '0.375rem 0.875rem',
        borderRadius: '20px',
        fontSize: '0.7rem',
        fontWeight: '700',
        letterSpacing: '0.05em',
    },
    subscriptionBody: {
        display: 'flex',
        alignItems: 'center',
        gap: '2rem',
        flexWrap: 'wrap',
    },
    daysCircle: {
        width: '120px',
        height: '120px',
        borderRadius: '50%',
        background: 'rgba(15, 23, 42, 0.6)',
        border: '3px solid rgba(99, 102, 241, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    daysNumber: {
        fontSize: '2.5rem',
        fontWeight: '800',
    },
    daysLabel: {
        color: '#94a3b8',
        fontSize: '0.8rem',
        marginTop: '-0.25rem',
    },
    subscriptionDetails: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
    },
    subscriptionRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5rem 0',
        borderBottom: '1px solid rgba(99, 102, 241, 0.1)',
    },
    subscriptionDetailLabel: {
        color: '#94a3b8',
        fontSize: '0.85rem',
    },
    subscriptionDetailValue: {
        color: 'white',
        fontSize: '0.95rem',
        fontWeight: '600',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: '1rem',
        marginBottom: '1.5rem',
    },
    profileCard: {
        background: 'rgba(30, 41, 59, 0.6)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '20px',
        padding: '1.5rem',
    },
    cardTitle: {
        color: 'white',
        fontSize: '1rem',
        fontWeight: '600',
        margin: '0 0 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },
    cardIcon: {
        fontSize: '1.2rem',
    },
    profileItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '0.75rem 0',
        borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
        gap: '0.5rem',
        flexWrap: 'wrap',
    },
    profileLabel: {
        color: '#94a3b8',
        fontSize: '0.85rem',
        flexShrink: 0,
    },
    profileValue: {
        color: 'white',
        fontSize: '0.9rem',
        fontWeight: '500',
        textAlign: 'right',
        wordBreak: 'break-word',
        flex: 1,
        minWidth: 0,
    },
    statCard: {
        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(30, 41, 59, 0.6) 100%)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        borderRadius: '20px',
        padding: '1.5rem',
    },
    statCardAmber: {
        background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(30, 41, 59, 0.6) 100%)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(251, 191, 36, 0.3)',
        borderRadius: '20px',
        padding: '1.5rem',
    },
    statHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.5rem',
    },
    statLabel: {
        color: '#94a3b8',
        fontSize: '0.8rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },
    statIconGreen: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: 'rgba(34, 197, 94, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#22c55e',
        fontSize: '1rem',
    },
    statIconAmber: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: 'rgba(251, 191, 36, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fbbf24',
        fontSize: '1rem',
    },
    statValueGreen: {
        color: '#22c55e',
        fontSize: '2rem',
        fontWeight: '700',
        margin: '0.5rem 0',
    },
    statValueAmber: {
        color: '#fbbf24',
        fontSize: '2rem',
        fontWeight: '700',
        margin: '0.5rem 0',
    },
    statMeta: {
        color: '#64748b',
        fontSize: '0.8rem',
        margin: 0,
    },
    statCardRed: {
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(30, 41, 59, 0.6) 100%)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '20px',
        padding: '1.5rem',
    },
    statIconRed: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: 'rgba(239, 68, 68, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ef4444',
        fontSize: '1rem',
    },
    statValueRed: {
        color: '#ef4444',
        fontSize: '2rem',
        fontWeight: '700',
        margin: '0.5rem 0',
    },
    formCard: {
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '20px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
    },
    formTitle: {
        color: 'white',
        fontSize: '1.1rem',
        fontWeight: '600',
        margin: '0 0 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },
    formIcon: {
        fontSize: '1.3rem',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
    },
    formRow: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1rem',
    },
    inputGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
    },
    inputLabel: {
        color: '#94a3b8',
        fontSize: '0.8rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },
    input: {
        width: '100%',
        background: 'rgba(15, 23, 42, 0.6)',
        border: '2px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '12px',
        padding: '0.875rem 1rem',
        color: 'white',
        fontSize: '1rem',
        transition: 'all 0.2s',
    },
    periodToggle: {
        display: 'flex',
        gap: '0.5rem',
    },
    periodBtn: {
        flex: 1,
        padding: '0.875rem 1rem',
        background: 'rgba(15, 23, 42, 0.6)',
        border: '2px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '12px',
        color: '#94a3b8',
        fontSize: '0.9rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    periodBtnActive: {
        background: 'rgba(99, 102, 241, 0.3)',
        borderColor: '#6366f1',
        color: 'white',
    },
    submitBtn: {
        width: '100%',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        border: 'none',
        borderRadius: '12px',
        padding: '1rem',
        color: 'white',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
        marginTop: '0.5rem',
    },
    btnLoading: {
        opacity: 0.7,
    },
    historyCard: {
        background: 'rgba(30, 41, 59, 0.6)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '20px',
        padding: '1.5rem',
    },
    historyTitle: {
        color: 'white',
        fontSize: '1.1rem',
        fontWeight: '600',
        margin: '0 0 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },
    historyIcon: {
        fontSize: '1.2rem',
    },
    loadingBox: {
        textAlign: 'center',
        padding: '2rem',
    },
    emptyState: {
        textAlign: 'center',
        padding: '3rem 1rem',
        border: '2px dashed rgba(99, 102, 241, 0.2)',
        borderRadius: '16px',
    },
    emptyIcon: {
        fontSize: '3rem',
        marginBottom: '1rem',
        opacity: 0.4,
    },
    emptyText: {
        color: '#94a3b8',
        fontSize: '1rem',
        margin: '0 0 0.5rem',
    },
    emptySubtext: {
        color: '#64748b',
        fontSize: '0.85rem',
        margin: 0,
    },
    paymentList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
    },
    paymentItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem',
        borderRadius: '14px',
        transition: 'all 0.2s',
    },
    paymentApproved: {
        background: 'rgba(34, 197, 94, 0.1)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
    },
    paymentRejected: {
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
    },
    paymentPending: {
        background: 'rgba(251, 191, 36, 0.1)',
        border: '1px solid rgba(251, 191, 36, 0.2)',
    },
    paymentLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
    },
    paymentStatusIcon: {
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1rem',
        flexShrink: 0,
    },
    paymentAmount: {
        color: 'white',
        fontSize: '1.1rem',
        fontWeight: '700',
        margin: 0,
    },
    paymentNote: {
        color: '#94a3b8',
        fontSize: '0.8rem',
        margin: '0.25rem 0 0',
    },
    paymentDateTime: {
        color: '#64748b',
        fontSize: '0.75rem',
        margin: '0.25rem 0 0',
    },
    paymentRight: {
        textAlign: 'right',
    },
    paymentStatus: {
        display: 'block',
        fontSize: '0.7rem',
        fontWeight: '700',
        letterSpacing: '0.05em',
    },
    paymentDate: {
        color: '#64748b',
        fontSize: '0.75rem',
    },
    footer: {
        textAlign: 'center',
        padding: '1.5rem',
        color: '#64748b',
        fontSize: '0.85rem',
        borderTop: '1px solid rgba(99, 102, 241, 0.1)',
    },
    primaryButton: {
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        border: 'none',
        borderRadius: '12px',
        padding: '0.75rem 1.5rem',
        color: 'white',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: 'pointer',
    },
    // Action Banner Styles
    actionRequiredBanner: {
        background: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid rgba(239, 68, 68, 0.4)',
        borderRadius: '16px',
        padding: '1.25rem',
        marginBottom: '2rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        backdropFilter: 'blur(10px)',
    },
    actionBannerContent: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '1rem',
        flex: 1,
    },
    actionIcon: {
        fontSize: '2rem',
    },
    actionTitle: {
        color: '#ef4444',
        fontSize: '1.1rem',
        fontWeight: '700',
        marginBottom: '0.5rem',
        marginTop: 0,
    },
    actionText: {
        color: '#f87171',
        fontSize: '0.9rem',
        margin: 0,
        lineHeight: 1.5,
    },
    missingList: {
        color: 'white',
        fontWeight: '600',
        background: 'rgba(239, 68, 68, 0.2)',
        padding: '0.1rem 0.4rem',
        borderRadius: '4px',
    },
    actionBtn: {
        background: '#ef4444',
        color: 'white',
        border: 'none',
        borderRadius: '10px',
        padding: '0.6rem 1.25rem',
        fontSize: '0.95rem',
        fontWeight: '600',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
        whiteSpace: 'nowrap',
    },
    // Room change styles
    roomInfoCard: {
        background: 'rgba(30, 41, 59, 0.6)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '20px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
    },
    roomInfoHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        gap: '0.5rem',
    },
    roomInfoTitle: {
        color: 'white',
        fontSize: '1.1rem',
        fontWeight: '600',
        margin: 0,
    },
    changeRoomBtn: {
        background: 'rgba(99, 102, 241, 0.2)',
        border: '1px solid rgba(99, 102, 241, 0.4)',
        borderRadius: '10px',
        padding: '0.5rem 1rem',
        color: '#818cf8',
        fontSize: '0.85rem',
        fontWeight: '600',
        cursor: 'pointer',
    },
    pendingBadge: {
        background: 'rgba(251, 191, 36, 0.2)',
        border: '1px solid rgba(251, 191, 36, 0.4)',
        borderRadius: '10px',
        padding: '0.5rem 1rem',
        color: '#fbbf24',
        fontSize: '0.85rem',
        fontWeight: '600',
    },
    roomInfoContent: {
        display: 'flex',
        gap: '2rem',
        flexWrap: 'wrap',
    },
    roomInfoItem: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
    },
    roomInfoLabel: {
        color: '#94a3b8',
        fontSize: '0.8rem',
    },
    roomInfoValue: {
        color: '#22c55e',
        fontSize: '1.1rem',
        fontWeight: '700',
    },
    pendingChangeInfo: {
        marginTop: '1rem',
        padding: '0.75rem',
        background: 'rgba(251, 191, 36, 0.1)',
        borderRadius: '10px',
        border: '1px solid rgba(251, 191, 36, 0.2)',
    },
    pendingChangeNote: {
        color: '#94a3b8',
        fontSize: '0.8rem',
        margin: '0.25rem 0 0',
    },
    modal: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
    },
    modalContent: {
        background: 'rgba(30, 41, 59, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '20px',
        padding: '1.5rem',
        width: '100%',
        maxWidth: '500px',
        maxHeight: '90vh',
        overflowY: 'auto',
    },
    modalTitle: {
        color: 'white',
        fontSize: '1.25rem',
        fontWeight: '700',
        margin: '0 0 1rem',
    },
    currentRoomInfo: {
        background: 'rgba(99, 102, 241, 0.1)',
        padding: '0.75rem',
        borderRadius: '10px',
        marginBottom: '1rem',
        color: '#c7d2fe',
        fontSize: '0.9rem',
    },
    select: {
        width: '100%',
        background: 'rgba(15, 23, 42, 0.8)',
        border: '2px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '12px',
        padding: '0.875rem 1rem',
        color: 'white',
        fontSize: '1rem',
    },
    roomGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        gap: '0.75rem',
    },
    roomOption: {
        background: 'rgba(15, 23, 42, 0.6)',
        border: '2px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '12px',
        padding: '0.75rem',
        cursor: 'pointer',
        textAlign: 'center',
    },
    roomOptionSelected: {
        border: '2px solid #22c55e',
        background: 'rgba(34, 197, 94, 0.15)',
    },
    roomOptionName: {
        color: 'white',
        fontSize: '0.95rem',
        fontWeight: '700',
    },
    roomOptionDetails: {
        color: '#94a3b8',
        fontSize: '0.75rem',
    },
    roomOptionBeds: {
        color: '#22c55e',
        fontSize: '0.75rem',
        marginTop: '0.25rem',
    },
    noRoomsText: {
        color: '#f87171',
        fontSize: '0.9rem',
        textAlign: 'center',
        padding: '1rem',
    },
    textarea: {
        width: '100%',
        background: 'rgba(15, 23, 42, 0.6)',
        border: '2px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '12px',
        padding: '0.75rem',
        color: 'white',
        fontSize: '0.95rem',
        resize: 'vertical',
    },
    modalActions: {
        display: 'flex',
        gap: '0.75rem',
        marginTop: '1.5rem',
    },
    cancelBtn: {
        flex: 1,
        background: 'rgba(100, 116, 139, 0.2)',
        border: '1px solid rgba(100, 116, 139, 0.3)',
        borderRadius: '12px',
        padding: '0.75rem',
        color: '#94a3b8',
        fontSize: '0.95rem',
        fontWeight: '600',
        cursor: 'pointer',
    },
    submitModalBtn: {
        flex: 1,
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        border: 'none',
        borderRadius: '12px',
        padding: '0.75rem',
        color: 'white',
        fontSize: '0.95rem',
        fontWeight: '600',
        cursor: 'pointer',
    },

};
