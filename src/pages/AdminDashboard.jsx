import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, auth } from '../services/firebase';
import { collection, query, getDocs, doc, updateDoc, deleteDoc, Timestamp, where } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import PropertyManager from '../components/PropertyManager';
import { calculateGuestStatus } from '../utils/billingUtils';

export default function AdminDashboard() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('overview');
    const [pendingUsers, setPendingUsers] = useState([]);
    const [activeUsers, setActiveUsers] = useState([]);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewingImage, setViewingImage] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [editingDues, setEditingDues] = useState({});
    const [savingDues, setSavingDues] = useState({});
    const [selectedUser, setSelectedUser] = useState(null);
    const [guestSearch, setGuestSearch] = useState('');
    const [monthlyFeeInput, setMonthlyFeeInput] = useState({});
    const [roomChangeRequests, setRoomChangeRequests] = useState([]);
    const [isEditingUser, setIsEditingUser] = useState(false);
    const [userEditData, setUserEditData] = useState({});
    const [externalGuestForProperty, setExternalGuestForProperty] = useState(null);

    // System Reset State
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetPassword, setResetPassword] = useState('');
    const [isResetting, setIsResetting] = useState(false);

    const handleSystemReset = async (e) => {
        e.preventDefault();
        if (!window.confirm("ARE YOU ABSOLUTELY SURE? This will wipe EVERYTHING.")) return;

        setIsResetting(true);
        try {
            // 1. Re-authenticate
            await signInWithEmailAndPassword(auth, user.email, resetPassword);

            // 2. Delete Collections
            const collections = ['rooms', 'payments', 'complaints', 'notices', 'roomChangeRequests'];
            for (const colName of collections) {
                const q = query(collection(db, colName));
                const snap = await getDocs(q);
                const deletePromises = snap.docs.map(d => deleteDoc(doc(db, colName, d.id)));
                await Promise.all(deletePromises);
            }

            // 3. Delete Users (except admin)
            const usersQ = query(collection(db, 'users'));
            const usersSnap = await getDocs(usersQ);
            const userDeletes = usersSnap.docs
                .filter(d => d.data().role !== 'admin')
                .map(d => deleteDoc(doc(db, 'users', d.id)));
            await Promise.all(userDeletes);

            alert('System Reset Successful! All data has been cleared.');
            setShowResetModal(false);
            setResetPassword('');
            fetchData();
        } catch (error) {
            console.error(error);
            alert('Reset Failed: ' + (error.code === 'auth/invalid-credential' ? 'Incorrect Password' : error.message));
        } finally {
            setIsResetting(false);
        }
    };

    // Lock body scroll when modal is open
    useEffect(() => {
        if (selectedUser) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [selectedUser]);

    // Filter guests based on search query
    const filteredGuests = useMemo(() => activeUsers.filter(user => {
        if (!guestSearch.trim()) return true;
        const query = guestSearch.toLowerCase();

        // Helper to safely search string fields
        const safeSearch = (val) => (val || '').toString().toLowerCase().includes(query);

        return (
            safeSearch(user.fullName) ||
            safeSearch(user.email) ||
            (user.phone || '').includes(query) ||
            safeSearch(user.fatherName) ||
            safeSearch(user.address) ||
            safeSearch(user.roomName) ||
            safeSearch(user.floor)
        );
    }), [activeUsers, guestSearch]);

    const getUserPayments = (userId, userPhone = null) => {
        // CRITICAL FIX: Smart payment matching with fallback logic
        // This handles cases where userId might not match due to user deletion/re-add
        return payments.filter(p => {
            // Primary match: By Firestore document ID
            if (p.userId === userId) return true;

            // Fallback match: By phone number (if available)
            if (userPhone && p.userPhone && p.userPhone === userPhone) return true;

            return false;
        });
    };

    const safeDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
            if (isNaN(date.getTime())) return 'N/A';
            return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e) { return 'N/A'; }
    };

    const safeTime = (timestamp) => {
        if (!timestamp) return '';
        try {
            const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
            if (isNaN(date.getTime())) return '';
            return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        } catch (e) { return ''; }
    };

    useEffect(() => {
        if (user) fetchData();
    }, [user]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const usersQuery = query(collection(db, "users"));
            const usersSnap = await getDocs(usersQuery);
            const usersData = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setPendingUsers(usersData.filter(u => u.accountStatus === 'pending' && u.role === 'guest' && !u.deleted));
            setActiveUsers(usersData.filter(u => u.role === 'guest' && u.accountStatus !== 'pending' && !u.deleted).sort((a, b) => {
                const roomA = parseInt(a.roomName) || 0;
                const roomB = parseInt(b.roomName) || 0;
                if (roomA !== roomB) return roomA - roomB;
                return (a.floor || '').localeCompare(b.floor || '');
            }));

            const paymentsQuery = query(collection(db, "payments"));
            const paymentsSnap = await getDocs(paymentsQuery);

            // Enrich payments with user details
            const paymentsData = paymentsSnap.docs.map(doc => {
                const data = doc.data();
                const user = usersData.find(u => u.id === data.userId) ||
                    usersData.find(u => u.phone === data.userPhone);

                return {
                    id: doc.id,
                    ...data,
                    userName: user ? user.fullName : (data.userName || 'Unknown Guest')
                };
            });

            paymentsData.sort((a, b) => {
                const dateA = a.createdAt?.seconds || 0;
                const dateB = b.createdAt?.seconds || 0;
                return dateB - dateA;
            });

            setPayments(paymentsData);

            // Fetch room change requests
            const roomChangeSnap = await getDocs(collection(db, "roomChangeRequests"));
            const roomChangeData = roomChangeSnap.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(r => r.status === 'pending')
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setRoomChangeRequests(roomChangeData);
        } catch (error) {
            console.error("Error fetching admin data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateUserDetails = async (e) => {
        e.preventDefault();
        try {
            // Check if phone number is being changed
            if (userEditData.phone !== selectedUser.phone) {
                // Check for duplicate phone number
                const phoneQuery = query(
                    collection(db, "users"),
                    where("phone", "==", userEditData.phone)
                );
                const phoneSnapshot = await getDocs(phoneQuery);

                if (!phoneSnapshot.empty) {
                    alert("Failed to update guest details\n\nThis phone number is already registered with another user. Please use a different phone number.");
                    return;
                }
            }

            const userRef = doc(db, "users", selectedUser.id);
            const updates = {
                fullName: userEditData.fullName,
                phone: userEditData.phone,
                email: userEditData.email,
                fatherName: userEditData.fatherName,
                address: userEditData.address,
                monthlyFee: parseFloat(userEditData.monthlyFee) || 0,
                alternativePhone: userEditData.alternativePhone,
            };

            if (userEditData.joiningDate) {
                updates.createdAt = Timestamp.fromDate(new Date(userEditData.joiningDate));
            }

            await updateDoc(userRef, updates);

            setSelectedUser({ ...selectedUser, ...updates });
            setIsEditingUser(false);
            fetchData();
            alert("User updated successfully!");
        } catch (error) {
            console.error(error);
            alert("Failed to update guest details\n\n" + error.message);
        }
    };

    const handleDeleteUser = async (e, userToDelete) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete ${userToDelete.fullName}? You can re-add them later with the same phone number.`)) {
            try {
                // Soft delete: Mark as deleted instead of removing document
                await updateDoc(doc(db, "users", userToDelete.id), {
                    deleted: true,
                    deletedAt: Timestamp.now(),
                    accountStatus: 'deleted'
                });
                fetchData();
                if (selectedUser && selectedUser.id === userToDelete.id) {
                    setSelectedUser(null);
                }
                alert("User deleted successfully.");
            } catch (error) {
                console.error("Error deleting user:", error);
                alert("Failed to delete user: " + error.message);
            }
        }
    };

    const handleApproval = async (userId, approve) => {
        if (approve) {
            const fee = monthlyFeeInput[userId];
            if (!fee || parseFloat(fee) <= 0) {
                alert('Please enter a valid monthly fee before approving');
                return;
            }
        }

        try {
            const userRef = doc(db, "users", userId);
            const updateData = {
                accountStatus: approve ? 'active' : 'rejected'
            };

            if (approve) {
                updateData.monthlyFee = parseFloat(monthlyFeeInput[userId]);
                updateData.lastPaymentDate = new Date(); // Start 30-day cycle from approval
            }

            await updateDoc(userRef, updateData);
            setMonthlyFeeInput(prev => ({ ...prev, [userId]: '' }));
            fetchData();
        } catch (error) {
            console.error("Error updating user status:", error);
        }
    };

    const handlePaymentAction = async (paymentId, status) => {
        try {
            const paymentRef = doc(db, "payments", paymentId);
            await updateDoc(paymentRef, { status });
            fetchData();
        } catch (error) {
            console.error("Error updating payment:", error);
        }
    };

    const handleDuesChange = (userId, value) => {
        setEditingDues(prev => ({ ...prev, [userId]: value }));
    };

    const handleUpdateDues = async (userId, currentDues) => {
        const newDues = editingDues[userId];
        if (newDues === undefined || newDues === '') return;

        const amount = parseFloat(newDues);
        if (isNaN(amount) || amount < 0) {
            alert('Please enter a valid amount');
            return;
        }

        setSavingDues(prev => ({ ...prev, [userId]: true }));
        try {
            const userRef = doc(db, "users", userId);
            await updateDoc(userRef, {
                monthlyFee: amount
            });
            // Update local state
            setActiveUsers(prev => prev.map(u =>
                u.id === userId ? { ...u, monthlyFee: amount } : u
            ));
            setEditingDues(prev => ({ ...prev, [userId]: undefined }));
        } catch (error) {
            console.error("Error updating monthly fee:", error);
            alert('Failed to update monthly fee');
        } finally {
            setSavingDues(prev => ({ ...prev, [userId]: false }));
        }
    };

    // Handle room change request approval/rejection
    const handleRoomChangeAction = async (request, approve) => {
        try {
            if (approve) {
                // Update user's room
                const userRef = doc(db, "users", request.userId);
                await updateDoc(userRef, {
                    roomId: request.newRoomId,
                    roomName: request.newRoomName,
                    floor: request.newFloor,
                });
            }

            // Update request status
            const requestRef = doc(db, "roomChangeRequests", request.id);
            await updateDoc(requestRef, {
                status: approve ? 'approved' : 'rejected'
            });

            fetchData();
        } catch (error) {
            console.error("Error handling room change:", error);
            alert('Failed to process room change request');
        }
    };

    const handleLogout = () => {
        auth.signOut();
        window.location.href = '/login';
    };

    const approvedPayments = useMemo(() => payments.filter(p => p.status === 'approved'), [payments]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getPaymentDate = (payment) => {
        if (!payment.createdAt) return new Date(0);
        return payment.createdAt.seconds ? new Date(payment.createdAt.seconds * 1000) : new Date(payment.createdAt);
    };

    const todayRevenue = useMemo(() => approvedPayments
        .filter(p => getPaymentDate(p) >= today)
        .reduce((sum, p) => sum + (p.amount || 0), 0), [approvedPayments]);

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 7);
    const weekRevenue = useMemo(() => approvedPayments
        .filter(p => getPaymentDate(p) >= weekStart)
        .reduce((sum, p) => sum + (p.amount || 0), 0), [approvedPayments]);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthRevenue = useMemo(() => approvedPayments
        .filter(p => getPaymentDate(p) >= monthStart)
        .reduce((sum, p) => sum + (p.amount || 0), 0), [approvedPayments]);

    const yearStart = new Date(today.getFullYear(), 0, 1);
    const yearRevenue = useMemo(() => approvedPayments
        .filter(p => getPaymentDate(p) >= yearStart)
        .reduce((sum, p) => sum + (p.amount || 0), 0), [approvedPayments]);

    const pendingPayments = useMemo(() => payments.filter(p => p.status === 'pending'), [payments]);

    const selectedDatePayments = useMemo(() => payments.filter(p => {
        const pDate = getPaymentDate(p);
        const filterDate = new Date(selectedDate);
        return p.status === 'approved' &&
            pDate.getDate() === filterDate.getDate() &&
            pDate.getMonth() === filterDate.getMonth() &&
            pDate.getFullYear() === filterDate.getFullYear();
    }), [payments, selectedDate]);

    const selectedDateTotal = useMemo(() => selectedDatePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0), [selectedDatePayments]);

    const formatCurrency = (amount) => Number(amount || 0).toLocaleString('en-IN');

    // Payment due filter state
    const [paymentDueFilter, setPaymentDueFilter] = useState('all');
    const [paymentDueSearch, setPaymentDueSearch] = useState('');

    // Calculate payment due status for each active user
    // Calculate payment due status for each active user
    const getPaymentDueStatus = (user) => {
        const userPayments = getUserPayments(user.id, user.phone);
        const { status, pendingAmount, daysRemaining, nextDueDate } = calculateGuestStatus(user, userPayments);

        return {
            daysRemaining,
            status,
            dueDate: nextDueDate,
            pendingAmount
        };
    };

    // Get users with payment due info
    const usersWithDueStatus = useMemo(() => activeUsers
        .filter(u => u.accountStatus === 'active')
        .map(u => {
            const dueInfo = getPaymentDueStatus(u);
            return { ...u, dueInfo };
        })
        .sort((a, b) => a.dueInfo.daysRemaining - b.dueInfo.daysRemaining), [activeUsers, payments]);

    // Filter users by payment due status and search query
    const filteredDueUsers = useMemo(() => usersWithDueStatus.filter(u => {
        let statusMatch = false;
        if (paymentDueFilter === 'all') statusMatch = u.dueInfo.status !== 'ok';
        else if (paymentDueFilter === 'overdue') statusMatch = u.dueInfo.status === 'overdue';
        else if (paymentDueFilter === 'due-soon') statusMatch = u.dueInfo.status === 'due-soon';

        if (!statusMatch) return false;

        if (!paymentDueSearch.trim()) return true;
        return (u.fullName || '').toLowerCase().includes(paymentDueSearch.toLowerCase());
    }), [usersWithDueStatus, paymentDueFilter, paymentDueSearch]);

    // Count for badges
    const overdueCount = useMemo(() => usersWithDueStatus.filter(u => u.dueInfo.status === 'overdue').length, [usersWithDueStatus]);
    const dueSoonCount = useMemo(() => usersWithDueStatus.filter(u => u.dueInfo.status === 'due-soon').length, [usersWithDueStatus]);


    const tabs = [
        { id: 'overview', label: '📊 Overview', count: null },
        { id: 'property', label: '🏠 Property', count: null },
        { id: 'pending', label: '⏳ Pending', count: pendingUsers.length },
        { id: 'active', label: '👥 Guests', count: activeUsers.length },
        { id: 'payments', label: '💳 Payments', count: pendingPayments.length },
    ];

    return (
        <div style={styles.container}>
            {/* Animated Background */}
            <div style={styles.bgOrb1}></div>
            <div style={styles.bgOrb2}></div>
            <div style={styles.bgOrb3}></div>

            {/* Image Modal */}
            {viewingImage && (
                <div style={styles.modal} onClick={() => setViewingImage(null)}>
                    <img src={viewingImage} style={styles.modalImage} alt="Full View" />
                    <button style={styles.modalClose}>✕</button>
                </div>
            )}

            {/* Guest Detail Modal */}
            {selectedUser && (
                <div style={styles.modal} onClick={() => { setSelectedUser(null); setIsEditingUser(false); }}>
                    <div style={styles.guestModal} onClick={(e) => e.stopPropagation()}>

                        {isEditingUser ? (
                            <form onSubmit={handleUpdateUserDetails} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h3 style={styles.modalTitle}>✏️ Edit Guest Details</h3>
                                    <button type="button" onClick={() => setIsEditingUser(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <label style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Full Name</label>
                                        <input
                                            type="text"
                                            value={userEditData.fullName || ''}
                                            onChange={e => setUserEditData({ ...userEditData, fullName: e.target.value })}
                                            required
                                            style={styles.monthlyFeeInput}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <label style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Phone</label>
                                        <input
                                            type="tel"
                                            value={userEditData.phone || ''}
                                            onChange={e => setUserEditData({ ...userEditData, phone: e.target.value })}
                                            required
                                            maxLength="10"
                                            style={styles.monthlyFeeInput}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <label style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Alt Phone</label>
                                        <input
                                            type="tel"
                                            value={userEditData.alternativePhone || ''}
                                            onChange={e => setUserEditData({ ...userEditData, alternativePhone: e.target.value })}
                                            style={styles.monthlyFeeInput}
                                            placeholder="Optional"
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <label style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Email</label>
                                        <input
                                            type="email"
                                            value={userEditData.email || ''}
                                            onChange={e => setUserEditData({ ...userEditData, email: e.target.value })}
                                            style={styles.monthlyFeeInput}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <label style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Father's Name</label>
                                        <input
                                            type="text"
                                            value={userEditData.fatherName || ''}
                                            onChange={e => setUserEditData({ ...userEditData, fatherName: e.target.value })}
                                            style={styles.monthlyFeeInput}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <label style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Monthly Fee</label>
                                        <input
                                            type="number"
                                            value={userEditData.monthlyFee || ''}
                                            onChange={e => setUserEditData({ ...userEditData, monthlyFee: e.target.value })}
                                            style={styles.monthlyFeeInput}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Address</label>
                                    <textarea
                                        value={userEditData.address || ''}
                                        onChange={e => setUserEditData({ ...userEditData, address: e.target.value })}
                                        style={{ ...styles.monthlyFeeInput, minHeight: '80px', resize: 'vertical' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Joining Date</label>
                                    <input
                                        type="date"
                                        value={userEditData.joiningDate || ''}
                                        onChange={e => setUserEditData({ ...userEditData, joiningDate: e.target.value })}
                                        style={styles.monthlyFeeInput}
                                    />
                                </div>

                                <div style={styles.actionBtns}>
                                    <button type="button" onClick={() => setIsEditingUser(false)} style={styles.rejectBtn}>Cancel</button>
                                    <button type="submit" style={styles.approveBtn}>💾 Save Changes</button>
                                </div>
                            </form>
                        ) : (
                            <>
                                <button style={styles.modalCloseBtn} onClick={() => setSelectedUser(null)}>✕</button>

                                {/* Header */}
                                <div className="guestModalHeader" style={styles.guestModalHeader}>
                                    <div className="guestModalAvatar" style={styles.guestModalAvatar}>
                                        {selectedUser.fullName?.charAt(0) || '?'}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <h2 style={styles.guestModalName}>{selectedUser.fullName}</h2>
                                        <p style={styles.guestModalEmail}>{selectedUser.email}</p>
                                        <span style={{
                                            ...styles.guestModalStatus,
                                            background: selectedUser.accountStatus === 'active' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                            color: selectedUser.accountStatus === 'active' ? '#22c55e' : '#ef4444'
                                        }}>{selectedUser.accountStatus?.toUpperCase()}</span>
                                    </div>
                                    <div>
                                        <button
                                            onClick={() => {
                                                setIsEditingUser(true);
                                                let joinDateStr = '';
                                                try {
                                                    const d = selectedUser.createdAt?.toDate ? selectedUser.createdAt.toDate() : new Date(selectedUser.createdAt);
                                                    if (!isNaN(d)) joinDateStr = d.toISOString().split('T')[0];
                                                } catch (e) { }

                                                setUserEditData({
                                                    fullName: selectedUser.fullName,
                                                    phone: selectedUser.phone,
                                                    email: selectedUser.email,
                                                    fatherName: selectedUser.fatherName,
                                                    address: selectedUser.address,
                                                    monthlyFee: selectedUser.monthlyFee,
                                                    alternativePhone: selectedUser.alternativePhone,
                                                    joiningDate: joinDateStr
                                                });
                                            }}
                                            style={{
                                                background: 'rgba(99, 102, 241, 0.1)',
                                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                                color: '#818cf8', borderRadius: '8px', padding: '0.5rem 1rem',
                                                cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600'
                                            }}
                                        >
                                            ✏️ Edit
                                        </button>
                                    </div>
                                </div>

                                {/* Profile Details */}
                                <div style={styles.guestModalSection}>
                                    <h3 style={styles.guestModalSectionTitle}>👤 Profile Details</h3>
                                    <div className="guestModalGrid" style={styles.guestModalGrid}>
                                        <div style={styles.guestModalItem}>
                                            <span style={styles.guestModalLabel}>Father's Name</span>
                                            <span style={styles.guestModalValue}>{selectedUser.fatherName || 'N/A'}</span>
                                        </div>
                                        <div style={styles.guestModalItem}>
                                            <span style={styles.guestModalLabel}>Phone</span>
                                            <span style={styles.guestModalValue}>{selectedUser.phone || 'N/A'}</span>
                                        </div>
                                        {selectedUser.alternativePhone && (
                                            <div style={styles.guestModalItem}>
                                                <span style={styles.guestModalLabel}>Alt Phone</span>
                                                <span style={styles.guestModalValue}>{selectedUser.alternativePhone}</span>
                                            </div>
                                        )}
                                        <div style={styles.guestModalItem}>
                                            <span style={styles.guestModalLabel}>Address</span>
                                            <span style={styles.guestModalValue}>{selectedUser.address || 'N/A'}</span>
                                        </div>
                                        <div style={styles.guestModalItem}>
                                            <span style={styles.guestModalLabel}>Joined</span>
                                            <span style={styles.guestModalValue}>{safeDate(selectedUser.createdAt)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Cache payments for this user — computed once instead of 5 times */}
                                {(() => {
                                    const selectedUserPayments = getUserPayments(selectedUser.id, selectedUser.phone);
                                    const pendingTotal = selectedUserPayments.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0);
                                    const approvedTotal = selectedUserPayments.filter(p => p.status === 'approved').reduce((sum, p) => sum + (p.amount || 0), 0);
                                    return (
                                        <>
                                            {/* Financial Summary */}
                                            <div style={styles.guestModalSection}>
                                                <h3 style={styles.guestModalSectionTitle}>💰 Financial Summary</h3>
                                                <div className="guestModalStats" style={styles.guestModalStats}>
                                                    <div style={styles.guestModalStat}>
                                                        <span style={styles.guestModalStatValue}>
                                                            ₹{formatCurrency(pendingTotal)}
                                                        </span>
                                                        <span style={styles.guestModalStatLabel}>Pending Amount</span>
                                                    </div>
                                                    <div style={{ ...styles.guestModalStat, borderColor: '#22c55e' }}>
                                                        <span style={{ ...styles.guestModalStatValue, color: '#22c55e' }}>
                                                            ₹{formatCurrency(approvedTotal)}
                                                        </span>
                                                        <span style={styles.guestModalStatLabel}>Total Paid</span>
                                                    </div>
                                                    <div style={{ ...styles.guestModalStat, borderColor: '#fbbf24' }}>
                                                        <span style={{ ...styles.guestModalStatValue, color: '#fbbf24' }}>
                                                            ₹{formatCurrency(pendingTotal)}
                                                        </span>
                                                        <span style={styles.guestModalStatLabel}>Pending</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ID Proof */}
                                            {(selectedUser.idProofUrl || selectedUser.idProofBase64) && (
                                                <div style={styles.guestModalSection}>
                                                    <h3 style={styles.guestModalSectionTitle}>📄 ID Proof</h3>
                                                    <img
                                                        src={selectedUser.idProofUrl || selectedUser.idProofBase64}
                                                        style={styles.guestModalIdProof}
                                                        alt="ID Proof"
                                                        onClick={() => setViewingImage(selectedUser.idProofUrl || selectedUser.idProofBase64)}
                                                    />
                                                </div>
                                            )}

                                            {/* Payment History */}
                                            <div style={styles.guestModalSection}>
                                                <h3 style={styles.guestModalSectionTitle}>📜 Payment History ({selectedUserPayments.length})</h3>
                                                {selectedUserPayments.length === 0 ? (
                                                    <p style={styles.guestModalEmpty}>No payment records found</p>
                                                ) : (
                                                    <div style={styles.guestModalPayments}>
                                                        {selectedUserPayments.map(payment => (
                                                            <div key={payment.id} style={{
                                                                ...styles.guestModalPayment,
                                                                borderLeftColor: payment.status === 'approved' ? '#22c55e' :
                                                                    payment.status === 'rejected' ? '#ef4444' : '#fbbf24'
                                                            }}>
                                                                <div style={styles.guestModalPaymentTop}>
                                                                    <span style={styles.guestModalPaymentAmount}>₹{formatCurrency(payment.amount)}</span>
                                                                    <span style={{
                                                                        ...styles.guestModalPaymentStatus,
                                                                        color: payment.status === 'approved' ? '#22c55e' :
                                                                            payment.status === 'rejected' ? '#ef4444' : '#fbbf24'
                                                                    }}>{payment.status?.toUpperCase()}</span>
                                                                </div>
                                                                <div style={styles.guestModalPaymentMeta}>
                                                                    <span>📅 {safeDate(payment.createdAt)}</span>
                                                                    {payment.paymentDate && <span>• Scheduled: {payment.paymentDate} {payment.paymentTime}</span>}
                                                                </div>
                                                                {payment.note && <p style={styles.guestModalPaymentNote}>"{payment.note}"</p>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    );
                                })()}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerContent}>
                    <div style={styles.headerLeft}>
                        <div style={styles.logoIcon}>🛡️</div>
                        <div>
                            <h1 style={styles.headerTitle}>Admin Dashboard</h1>
                            <p style={styles.headerSubtitle}>Manage your hotel operations</p>
                        </div>
                    </div>
                    <button onClick={handleLogout} style={styles.logoutBtn}>
                        <span>🚪</span> Sign Out
                    </button>
                </div>
            </header>

            {/* Tab Navigation */}
            <nav style={styles.tabNav}>
                <div style={styles.tabContainer}>
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                ...styles.tabBtn,
                                ...(activeTab === tab.id ? styles.tabBtnActive : {})
                            }}
                        >
                            {tab.label}
                            {tab.count !== null && (
                                <span style={{
                                    ...styles.tabBadge,
                                    ...(activeTab === tab.id ? styles.tabBadgeActive : {})
                                }}>{tab.count}</span>
                            )}
                        </button>
                    ))}
                </div>
            </nav>

            <main style={styles.main}>
                {loading ? (
                    <div style={styles.loadingContainer}>
                        <div style={styles.spinner}></div>
                        <p style={styles.loadingText}>Loading dashboard data...</p>
                    </div>
                ) : (
                    <>
                        {/* OVERVIEW TAB */}
                        {activeTab === 'overview' && (
                            <div style={styles.tabContent}>
                                {/* Upcoming Payments Due Section - AT TOP */}
                                <div style={{ ...styles.paymentDueCard, marginTop: 0, marginBottom: '1.5rem' }}>
                                    <div style={styles.paymentDueHeader}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                            <h3 style={styles.cardTitle}>🔔 Upcoming Payments Due</h3>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Search Name..."
                                                    value={paymentDueSearch}
                                                    onChange={(e) => setPaymentDueSearch(e.target.value)}
                                                    style={{
                                                        background: 'rgba(30, 41, 59, 0.6)',
                                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                                        borderRadius: '6px',
                                                        padding: '0.4rem 0.75rem',
                                                        color: 'white',
                                                        fontSize: '0.85rem',
                                                        width: '180px',
                                                        outline: 'none'
                                                    }}
                                                />
                                                {paymentDueSearch && (
                                                    <button
                                                        onClick={() => setPaymentDueSearch('')}
                                                        style={{
                                                            position: 'absolute',
                                                            right: '8px',
                                                            top: '50%',
                                                            transform: 'translateY(-50%)',
                                                            background: 'none',
                                                            border: 'none',
                                                            color: '#94a3b8',
                                                            cursor: 'pointer',
                                                            fontSize: '0.8rem'
                                                        }}
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div style={styles.dueFilterBtns}>
                                            <button
                                                onClick={() => setPaymentDueFilter('all')}
                                                style={{
                                                    ...styles.dueFilterBtn,
                                                    ...(paymentDueFilter === 'all' ? styles.dueFilterBtnActive : {})
                                                }}
                                            >
                                                All ({overdueCount + dueSoonCount})
                                            </button>
                                            <button
                                                onClick={() => setPaymentDueFilter('overdue')}
                                                style={{
                                                    ...styles.dueFilterBtn,
                                                    ...styles.dueFilterBtnRed,
                                                    ...(paymentDueFilter === 'overdue' ? styles.dueFilterBtnRedActive : {})
                                                }}
                                            >
                                                🚨 Overdue ({overdueCount})
                                            </button>
                                            <button
                                                onClick={() => setPaymentDueFilter('due-soon')}
                                                style={{
                                                    ...styles.dueFilterBtn,
                                                    ...styles.dueFilterBtnYellow,
                                                    ...(paymentDueFilter === 'due-soon' ? styles.dueFilterBtnYellowActive : {})
                                                }}
                                            >
                                                ⚠️ Due in 5 Days ({dueSoonCount})
                                            </button>
                                        </div>
                                    </div>

                                    {filteredDueUsers.length === 0 ? (
                                        <div style={styles.emptyState}>
                                            <p>✅ No payments due at the moment!</p>
                                        </div>
                                    ) : (
                                        <div style={styles.dueUsersList}>
                                            {/* Group By Room Logic */}
                                            {Object.entries(filteredDueUsers.reduce((groups, user) => {
                                                const roomKey = user.roomName ? `${user.roomName} (${user.floor || 'GF'})` : 'Unassigned';
                                                if (!groups[roomKey]) groups[roomKey] = [];
                                                groups[roomKey].push(user);
                                                return groups;
                                            }, {})).sort((a, b) => {
                                                // Extract room number for numeric sort
                                                const roomA = parseInt(a[0].split(' ')[0]) || 0;
                                                const roomB = parseInt(b[0].split(' ')[0]) || 0;

                                                if (roomA !== roomB) return roomA - roomB;

                                                // Fallback to string sort if numbers match or are invalid
                                                return a[0].localeCompare(b[0]);
                                            }).map(([roomName, usersInRoom]) => (
                                                <div key={roomName} style={{ marginBottom: '1rem' }}>
                                                    <h4 style={{
                                                        color: '#94a3b8',
                                                        fontSize: '0.85rem',
                                                        fontWeight: '600',
                                                        marginBottom: '0.75rem',
                                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                        paddingBottom: '0.25rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem'
                                                    }}>
                                                        🏠 {roomName} <span style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '400' }}>{usersInRoom.length} Due</span>
                                                    </h4>
                                                    {usersInRoom.map(userData => (
                                                        <div
                                                            key={userData.id}
                                                            style={{
                                                                ...styles.dueUserCard,
                                                                marginBottom: '0.75rem',
                                                                borderLeftColor: userData.dueInfo.status === 'overdue' ? '#ef4444' : '#fbbf24',
                                                                background: userData.dueInfo.status === 'overdue'
                                                                    ? 'linear-gradient(to right, rgba(239, 68, 68, 0.05), rgba(30, 41, 59, 0.6))'
                                                                    : 'linear-gradient(to right, rgba(251, 191, 36, 0.05), rgba(30, 41, 59, 0.6))',
                                                            }}
                                                        >
                                                            <div style={styles.dueUserInfo}>
                                                                <div style={{
                                                                    ...styles.dueUserAvatar,
                                                                    background: userData.dueInfo.status === 'overdue'
                                                                        ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                                                                        : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
                                                                }}>
                                                                    {userData.fullName?.charAt(0) || '?'}
                                                                </div>
                                                                <div>
                                                                    <h4
                                                                        style={{
                                                                            ...styles.dueUserName,
                                                                            cursor: 'pointer',
                                                                            textDecoration: 'underline',
                                                                            textDecorationColor: 'rgba(255,255,255,0.3)',
                                                                            textUnderlineOffset: '3px'
                                                                        }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setExternalGuestForProperty(userData);
                                                                            setActiveTab('property');
                                                                        }}
                                                                        title="View Guest Details"
                                                                    >
                                                                        {userData.fullName}
                                                                    </h4>
                                                                    <p style={styles.dueUserPhone}>
                                                                        <a
                                                                            href={`tel:${userData.phone}`}
                                                                            style={{ color: '#94a3b8', textDecoration: 'none' }}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            📱 {userData.phone}
                                                                        </a>
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div style={styles.dueStatusBox}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                    <span style={{
                                                                        ...styles.dueBadge,
                                                                        background: userData.dueInfo.status === 'overdue'
                                                                            ? 'rgba(239, 68, 68, 0.2)'
                                                                            : 'rgba(251, 191, 36, 0.2)',
                                                                        color: userData.dueInfo.status === 'overdue' ? '#ef4444' : '#fbbf24',
                                                                        marginBottom: '0.25rem'
                                                                    }}>
                                                                        {userData.dueInfo.status === 'overdue'
                                                                            ? '🚨 OVERDUE'
                                                                            : `⚠️ Due in ${userData.dueInfo.daysRemaining} Days`}
                                                                    </span>
                                                                    <span style={styles.dueDateText}>
                                                                        Due: {userData.dueInfo.dueDate?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                                                    </span>
                                                                </div>
                                                                {userData.dueInfo.pendingAmount > 0 && (
                                                                    <span style={{
                                                                        fontSize: '1.1rem',
                                                                        fontWeight: '700',
                                                                        color: '#ef4444',
                                                                        marginTop: '0.25rem'
                                                                    }}>
                                                                        ₹{formatCurrency(userData.dueInfo.pendingAmount)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Room Change Requests Section */}
                                {roomChangeRequests.length > 0 && (
                                    <div style={{ ...styles.paymentDueCard, marginBottom: '1.5rem' }}>
                                        <div style={styles.paymentDueHeader}>
                                            <h3 style={styles.cardTitle}>🔄 Room Change Requests</h3>
                                            <span style={styles.requestCountBadge}>{roomChangeRequests.length} pending</span>
                                        </div>
                                        <div style={styles.dueUsersList}>
                                            {roomChangeRequests.map(request => (
                                                <div key={request.id} style={styles.roomChangeCard}>
                                                    <div style={styles.roomChangeInfo}>
                                                        <div style={styles.roomChangeUser}>
                                                            <strong>{request.userName}</strong>
                                                            <span style={styles.roomChangeEmail}>{request.userEmail}</span>
                                                        </div>
                                                        <div style={styles.roomChangeDetails}>
                                                            <span style={styles.roomChangeFrom}>{request.currentRoomName} ({request.currentFloor})</span>
                                                            <span style={styles.roomChangeArrow}>→</span>
                                                            <span style={styles.roomChangeTo}>{request.newRoomName} ({request.newFloor})</span>
                                                        </div>
                                                        {request.reason && (
                                                            <p style={styles.roomChangeReason}>📝 {request.reason}</p>
                                                        )}
                                                    </div>
                                                    <div style={styles.roomChangeActions}>
                                                        <button
                                                            onClick={() => handleRoomChangeAction(request, true)}
                                                            style={styles.roomChangeApprove}
                                                        >
                                                            ✓ Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleRoomChangeAction(request, false)}
                                                            style={styles.roomChangeReject}
                                                        >
                                                            ✕ Reject
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Revenue Cards */}
                                <div style={styles.statsGrid}>
                                    <div style={{ ...styles.statCard, ...styles.statCardGreen }}>
                                        <div style={styles.statIcon}>📈</div>
                                        <div>
                                            <p style={styles.statLabel}>Today's Revenue</p>
                                            <p style={{ ...styles.statValue, color: '#22c55e' }}>₹{formatCurrency(todayRevenue)}</p>
                                            <p style={styles.statMeta}>{new Date().toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div style={{ ...styles.statCard, ...styles.statCardBlue }}>
                                        <div style={styles.statIcon}>📅</div>
                                        <div>
                                            <p style={styles.statLabel}>This Week</p>
                                            <p style={{ ...styles.statValue, color: '#3b82f6' }}>₹{formatCurrency(weekRevenue)}</p>
                                            <p style={styles.statMeta}>Last 7 days</p>
                                        </div>
                                    </div>
                                    <div style={{ ...styles.statCard, ...styles.statCardPurple }}>
                                        <div style={styles.statIcon}>📆</div>
                                        <div>
                                            <p style={styles.statLabel}>This Month</p>
                                            <p style={{ ...styles.statValue, color: '#a855f7' }}>₹{formatCurrency(monthRevenue)}</p>
                                            <p style={styles.statMeta}>{new Date().toLocaleString('default', { month: 'long' })}</p>
                                        </div>
                                    </div>
                                    <div style={{ ...styles.statCard, ...styles.statCardAmber }}>
                                        <div style={styles.statIcon}>🎯</div>
                                        <div>
                                            <p style={styles.statLabel}>Total Year</p>
                                            <p style={{ ...styles.statValue, color: '#f59e0b' }}>₹{formatCurrency(yearRevenue)}</p>
                                            <p style={styles.statMeta}>{new Date().getFullYear()}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Quick Stats */}
                                <div style={styles.quickStats}>
                                    <div style={styles.quickStatCard}>
                                        <div style={{ ...styles.quickStatIcon, background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24' }}>⏳</div>
                                        <div>
                                            <p style={styles.quickStatValue}>{pendingUsers.length}</p>
                                            <p style={styles.quickStatLabel}>Pending Approvals</p>
                                        </div>
                                    </div>
                                    <div style={styles.quickStatCard}>
                                        <div style={{ ...styles.quickStatIcon, background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8' }}>👥</div>
                                        <div>
                                            <p style={styles.quickStatValue}>{activeUsers.length}</p>
                                            <p style={styles.quickStatLabel}>Active Guests</p>
                                        </div>
                                    </div>
                                    <div style={styles.quickStatCard}>
                                        <div style={{ ...styles.quickStatIcon, background: 'rgba(236, 72, 153, 0.2)', color: '#ec4899' }}>💳</div>
                                        <div>
                                            <p style={styles.quickStatValue}>{pendingPayments.length}</p>
                                            <p style={styles.quickStatLabel}>Pending Payments</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Date Filter */}
                                <div style={styles.dateFilterCard}>
                                    <div style={styles.dateFilterHeader}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                            <h3 style={styles.cardTitle}>📅 Payments by Date</h3>
                                            <div style={{
                                                background: 'rgba(34, 197, 94, 0.1)',
                                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                                borderRadius: '8px',
                                                padding: '0.25rem 0.75rem',
                                                color: '#22c55e',
                                                fontWeight: '600',
                                                fontSize: '0.9rem'
                                            }}>
                                                Total Collected: ₹{formatCurrency(selectedDateTotal)}
                                            </div>
                                        </div>
                                        <input
                                            type="date"
                                            value={selectedDate}
                                            onChange={(e) => setSelectedDate(e.target.value)}
                                            style={styles.dateInput}
                                        />
                                    </div>
                                    {selectedDatePayments.length > 0 ? (
                                        <div style={styles.tableWrapper}>
                                            <table style={styles.table}>
                                                <thead>
                                                    <tr>
                                                        <th style={styles.th}>Guest</th>
                                                        <th style={styles.th}>Amount</th>
                                                        <th style={styles.th}>Time</th>
                                                        <th style={styles.th}>Note</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {selectedDatePayments.map(p => (
                                                        <tr key={p.id} style={styles.tr}>
                                                            <td style={styles.td}>{p.userName}</td>
                                                            <td style={{ ...styles.td, color: '#22c55e', fontWeight: '700' }}>₹{formatCurrency(p.amount)}</td>
                                                            <td style={styles.td}>{safeTime(p.createdAt)}</td>
                                                            <td style={{ ...styles.td, opacity: 0.7 }}>{p.note || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div style={styles.emptyState}>
                                            <p>No revenue recorded for this date.</p>
                                        </div>
                                    )}
                                </div>

                                {/* Danger Zone */}
                                <div style={{ ...styles.paymentDueCard, marginTop: '2rem', border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.05)' }}>
                                    <div style={{ ...styles.paymentDueHeader, borderBottom: '1px solid rgba(239, 68, 68, 0.2)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                                        <h3 style={{ ...styles.cardTitle, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            🛡️ DANGER ZONE
                                        </h3>
                                    </div>
                                    <div style={{ padding: '0 1rem 1rem' }}>
                                        <p style={{ color: '#f87171', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: '1.5' }}>
                                            <b>WARNING:</b> This action will permanently delete <strong>ALL DATA</strong> including all Guests, Rooms, Floors, Payments, and Complaints.
                                            Only your Admin account will remain. This cannot be undone.
                                        </p>
                                        <button
                                            onClick={() => setShowResetModal(true)}
                                            style={{
                                                background: '#dc2626', color: 'white', border: 'none', padding: '0.75rem 1.5rem',
                                                borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', width: '100%',
                                                boxShadow: '0 4px 6px rgba(220, 38, 38, 0.3)', transition: 'all 0.2s',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                            }}
                                        >
                                            ⚠️ FACTORY RESET SYSTEM
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PROPERTY TAB */}
                        {activeTab === 'property' && (
                            <div style={styles.tabContent}>
                                <h2 style={styles.sectionTitle}>🏠 Property Management</h2>
                                <PropertyManager
                                    externalGuestToOpen={externalGuestForProperty}
                                    onExternalGuestHandled={() => setExternalGuestForProperty(null)}
                                />
                            </div>
                        )}

                        {/* PENDING TAB */}
                        {activeTab === 'pending' && (
                            <div style={styles.tabContent}>
                                <h2 style={styles.sectionTitle}>⏳ Pending Approvals</h2>
                                {pendingUsers.length === 0 ? (
                                    <div style={styles.emptyStateLarge}>
                                        <span style={styles.emptyIcon}>✅</span>
                                        <p>All caught up! No pending signups.</p>
                                    </div>
                                ) : (
                                    <div style={styles.userGrid}>
                                        {pendingUsers.map(userData => (
                                            <div key={userData.id} style={styles.userCard}>
                                                <div style={styles.userCardHeader}>
                                                    <div style={styles.userAvatar}>
                                                        {userData.fullName?.charAt(0) || '?'}
                                                    </div>
                                                    <div>
                                                        <h4 style={styles.userName}>{userData.fullName}</h4>
                                                        <p style={styles.userEmail}>{userData.email}</p>
                                                    </div>
                                                    <span style={styles.statusBadgePending}>Pending</span>
                                                </div>
                                                <div style={styles.userDetails}>
                                                    <p><span>👨</span> {userData.fatherName}</p>
                                                    <p><span>📱</span> {userData.phone}</p>
                                                    <p><span>📍</span> {userData.address}</p>
                                                    <p style={styles.userJoined}>Joined: {safeDate(userData.createdAt)}</p>
                                                </div>
                                                {(userData.idProofUrl || userData.idProofBase64) && (
                                                    <div
                                                        style={styles.idProofThumb}
                                                        onClick={() => setViewingImage(userData.idProofUrl || userData.idProofBase64)}
                                                    >
                                                        <img src={userData.idProofUrl || userData.idProofBase64} style={styles.idProofImg} alt="ID" />
                                                        <div style={styles.idProofOverlay}>👁️ View ID</div>
                                                    </div>
                                                )}

                                                {/* Monthly Fee Input - Required before approval */}
                                                <div style={styles.monthlyFeeSection}>
                                                    <label style={styles.monthlyFeeLabel}>💰 Monthly Fee (₹) *</label>
                                                    <input
                                                        type="number"
                                                        placeholder="Enter monthly fee"
                                                        value={monthlyFeeInput[userData.id] || ''}
                                                        onChange={(e) => setMonthlyFeeInput(prev => ({ ...prev, [userData.id]: e.target.value }))}
                                                        style={styles.monthlyFeeInput}
                                                        min="0"
                                                    />
                                                </div>

                                                <div style={styles.actionBtns}>
                                                    <button
                                                        onClick={() => handleApproval(userData.id, true)}
                                                        style={{
                                                            ...styles.approveBtn,
                                                            opacity: !monthlyFeeInput[userData.id] ? 0.5 : 1
                                                        }}
                                                    >
                                                        ✓ Approve
                                                    </button>
                                                    <button
                                                        onClick={() => handleApproval(userData.id, false)}
                                                        style={styles.rejectBtn}
                                                    >
                                                        ✕ Reject
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ACTIVE GUESTS TAB */}
                        {activeTab === 'active' && (
                            <div style={styles.tabContent}>
                                <div style={styles.sectionHeader}>
                                    <h2 style={styles.sectionTitle}>👥 Active Guests</h2>
                                    <div style={styles.searchBox}>
                                        <span style={styles.searchIcon}>🔍</span>
                                        <input
                                            type="text"
                                            placeholder="Search by name, room, floor..."
                                            value={guestSearch}
                                            onChange={(e) => setGuestSearch(e.target.value)}
                                            style={styles.searchInput}
                                        />
                                        {guestSearch && (
                                            <button
                                                onClick={() => setGuestSearch('')}
                                                style={styles.searchClear}
                                            >✕</button>
                                        )}
                                    </div>
                                </div>

                                {guestSearch && (
                                    <p style={styles.searchResults}>
                                        Found {filteredGuests.length} of {activeUsers.length} guests
                                    </p>
                                )}

                                {filteredGuests.length === 0 ? (
                                    <div style={styles.emptyStateLarge}>
                                        <span style={styles.emptyIcon}>{guestSearch ? '🔍' : '👤'}</span>
                                        <p>{guestSearch ? `No guests found for "${guestSearch}"` : 'No active guests yet.'}</p>
                                    </div>
                                ) : (
                                    <div style={styles.userGrid}>
                                        {filteredGuests.map(userData => (
                                            <div key={userData.id} style={{ ...styles.userCard, cursor: 'pointer' }} onClick={() => setSelectedUser(userData)}>
                                                <div style={styles.userCardHeader}>
                                                    <div style={styles.userAvatar}>
                                                        {userData.fullName?.charAt(0) || '?'}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <h4 style={styles.userName}>{userData.fullName}</h4>
                                                        <p style={styles.userEmail}>{userData.email}</p>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                                                        <span style={{
                                                            ...styles.statusBadge,
                                                            ...(userData.accountStatus === 'active' ? styles.statusBadgeActive : styles.statusBadgeRejected)
                                                        }}>{userData.accountStatus}</span>
                                                        <button
                                                            onClick={(e) => handleDeleteUser(e, userData)}
                                                            style={{
                                                                background: 'rgba(239, 68, 68, 0.1)',
                                                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                                                borderRadius: '6px',
                                                                color: '#ef4444',
                                                                padding: '4px 8px',
                                                                cursor: 'pointer',
                                                                fontSize: '0.8rem',
                                                                marginTop: '4px'
                                                            }}
                                                            title="Delete User"
                                                        >
                                                            🗑️ Delete
                                                        </button>
                                                    </div>
                                                </div>
                                                <div style={styles.userDetails}>
                                                    <p><span>👨</span> {userData.fatherName}</p>
                                                    <p><span>📱</span> {userData.phone}</p>
                                                    <p><span>📍</span> {userData.address}</p>
                                                    <p style={styles.userJoined}>Joined: {safeDate(userData.createdAt)}</p>
                                                </div>

                                                {/* Monthly Fee Section */}
                                                <div style={styles.duesSection} onClick={(e) => e.stopPropagation()}>
                                                    <div style={styles.duesHeader}>
                                                        <span style={styles.duesLabel}>💰 Monthly Fee</span>
                                                        <span style={styles.currentDues}>₹{formatCurrency(userData.monthlyFee || userData.pendingDues || 0)}</span>
                                                    </div>
                                                    <div style={styles.duesInputRow}>
                                                        <input
                                                            type="number"
                                                            placeholder="Set new amount"
                                                            value={editingDues[userData.id] ?? ''}
                                                            onChange={(e) => handleDuesChange(userData.id, e.target.value)}
                                                            style={styles.duesInput}
                                                            min="0"
                                                        />
                                                        <button
                                                            onClick={() => handleUpdateDues(userData.id, userData.pendingDues)}
                                                            disabled={savingDues[userData.id] || editingDues[userData.id] === undefined || editingDues[userData.id] === ''}
                                                            style={{
                                                                ...styles.duesUpdateBtn,
                                                                opacity: (savingDues[userData.id] || editingDues[userData.id] === undefined || editingDues[userData.id] === '') ? 0.5 : 1
                                                            }}
                                                        >
                                                            {savingDues[userData.id] ? '⏳' : '✓ Update'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* View Details Button */}
                                                <button style={styles.viewDetailsBtn}>
                                                    👁️ View Full Details
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* PAYMENTS TAB */}
                        {activeTab === 'payments' && (
                            <div style={styles.tabContent}>
                                <h2 style={styles.sectionTitle}>💳 Payment Requests</h2>
                                {payments.length === 0 ? (
                                    <div style={styles.emptyStateLarge}>
                                        <span style={styles.emptyIcon}>💳</span>
                                        <p>No payment records found.</p>
                                    </div>
                                ) : (
                                    <div style={styles.paymentList}>
                                        {payments.map(payment => (
                                            <div key={payment.id} style={{
                                                ...styles.paymentCard,
                                                ...(payment.status === 'approved' ? styles.paymentCardApproved :
                                                    payment.status === 'rejected' ? styles.paymentCardRejected :
                                                        styles.paymentCardPending)
                                            }}>
                                                <div style={styles.paymentLeft}>
                                                    <div style={{
                                                        ...styles.paymentIcon,
                                                        background: payment.status === 'approved' ? 'rgba(34, 197, 94, 0.2)' :
                                                            payment.status === 'rejected' ? 'rgba(239, 68, 68, 0.2)' :
                                                                'rgba(251, 191, 36, 0.2)'
                                                    }}>
                                                        {payment.status === 'approved' ? '✓' :
                                                            payment.status === 'rejected' ? '✕' : '⏳'}
                                                    </div>
                                                    <div>
                                                        <p style={styles.paymentAmount}>₹{formatCurrency(payment.amount)}</p>
                                                        <p style={styles.paymentUser}>From: <span>{payment.userName}</span></p>
                                                        <p style={styles.paymentMeta}>
                                                            {safeDate(payment.createdAt)} • {safeTime(payment.createdAt)}
                                                        </p>
                                                        {payment.paymentDate && (
                                                            <p style={styles.paymentScheduled}>
                                                                📅 Scheduled: {payment.paymentDate} {payment.paymentTime && `at ${payment.paymentTime}`}
                                                            </p>
                                                        )}
                                                        {payment.note && <p style={styles.paymentNote}>"{payment.note}"</p>}
                                                    </div>
                                                </div>
                                                <div style={styles.paymentRight}>
                                                    {payment.status === 'pending' ? (
                                                        <div style={styles.paymentActions}>
                                                            <button
                                                                onClick={() => handlePaymentAction(payment.id, 'approved')}
                                                                style={styles.approveBtn}
                                                            >
                                                                ✓ Approve
                                                            </button>
                                                            <button
                                                                onClick={() => handlePaymentAction(payment.id, 'rejected')}
                                                                style={styles.rejectBtn}
                                                            >
                                                                ✕ Reject
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span style={{
                                                            ...styles.paymentStatusBadge,
                                                            color: payment.status === 'approved' ? '#22c55e' : '#ef4444',
                                                            background: payment.status === 'approved' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                                                        }}>
                                                            {payment.status.toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>

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
                button:hover:not(:disabled) { opacity: 0.9; }
                input:focus { outline: none; border-color: #818cf8 !important; }
                input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1); cursor: pointer; }
                
                @media (max-width: 600px) {
                    .guestModalGrid { grid-template-columns: 1fr !important; }
                    .guestModalStats { grid-template-columns: 1fr !important; }
                    .guestModalHeader { flex-direction: column; text-align: center; }
                    .guestModalAvatar { margin: 0 auto; }
                }
            `}</style>
            {showResetModal && (
                <div style={styles.modal} onClick={() => setShowResetModal(false)}>
                    <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <h3 style={{ ...styles.modalTitle, color: '#ef4444' }}>⚠️ Confirm Factory Reset</h3>
                        <p style={{ marginBottom: '1.5rem', color: '#cbd5e1' }}>
                            Enter your Admin Password to confirm permanent deletion of all system data.
                        </p>
                        <form onSubmit={handleSystemReset}>
                            <input
                                type="password"
                                placeholder="Admin Password"
                                value={resetPassword}
                                onChange={e => setResetPassword(e.target.value)}
                                style={{
                                    width: '100%', padding: '1rem', background: '#1e293b', border: '1px solid #ef4444',
                                    borderRadius: '8px', color: 'white', marginBottom: '1.5rem', outline: 'none'
                                }}
                                autoFocus
                            />
                            <div style={styles.modalActions}>
                                <button type="button" onClick={() => setShowResetModal(false)} style={styles.cancelBtn}>Cancel</button>
                                <button
                                    type="submit"
                                    disabled={isResetting}
                                    style={{ ...styles.submitBtn, background: '#ef4444', opacity: isResetting ? 0.7 : 1 }}
                                >
                                    {isResetting ? 'DELETING EVERYTHING...' : '💣 DELETE EVERYTHING'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
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
        position: 'fixed', top: '-20%', right: '-10%', width: '500px', height: '500px',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)',
        borderRadius: '50%', animation: 'float 8s ease-in-out infinite', pointerEvents: 'none', zIndex: 0,
    },
    bgOrb2: {
        position: 'fixed', bottom: '-20%', left: '-10%', width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(236, 72, 153, 0.2) 0%, transparent 70%)',
        borderRadius: '50%', animation: 'float 10s ease-in-out infinite reverse', pointerEvents: 'none', zIndex: 0,
    },
    bgOrb3: {
        position: 'fixed', top: '50%', left: '50%', width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(14, 165, 233, 0.15) 0%, transparent 70%)',
        borderRadius: '50%', animation: 'pulse 6s ease-in-out infinite', pointerEvents: 'none', zIndex: 0,
    },
    modal: {
        position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.9)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', cursor: 'pointer',
        paddingTop: '2rem', overflow: 'hidden',
    },
    modalImage: { maxWidth: '90%', maxHeight: '90vh', borderRadius: '16px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' },
    modalClose: {
        position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.1)',
        border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: 'white',
        fontSize: '1.25rem', cursor: 'pointer',
    },
    header: {
        background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(99, 102, 241, 0.2)', padding: '1rem',
        position: 'sticky', top: 0, zIndex: 50,
    },
    headerContent: {
        maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
    logoIcon: {
        width: '48px', height: '48px', borderRadius: '14px',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem',
        boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
    },
    headerTitle: { color: 'white', fontSize: '1.4rem', fontWeight: '700', margin: 0 },
    headerSubtitle: { color: '#94a3b8', fontSize: '0.9rem', margin: 0 },
    logoutBtn: {
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
        color: '#f87171', padding: '0.5rem 1rem', borderRadius: '12px',
        fontSize: '0.95rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s',
    },
    tabNav: {
        background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(99, 102, 241, 0.1)', padding: '0.75rem 1rem',
        position: 'sticky', top: '81px', zIndex: 40, overflowX: 'auto',
    },
    tabContainer: {
        maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '0.5rem',
    },
    tabBtn: {
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)',
        color: '#94a3b8', padding: '0.625rem 1rem', borderRadius: '10px',
        fontSize: '0.95rem', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
    },
    tabBtnActive: {
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        border: '1px solid transparent', color: 'white',
        boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
    },
    tabBadge: {
        background: 'rgba(255,255,255,0.1)', padding: '0.125rem 0.5rem', borderRadius: '10px', fontSize: '0.85rem',
    },
    tabBadgeActive: { background: 'rgba(255,255,255,0.2)' },
    main: {
        maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 1rem', position: 'relative', zIndex: 10,
    },
    loadingContainer: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem',
    },
    spinner: {
        width: '50px', height: '50px', border: '4px solid rgba(129, 140, 248, 0.2)',
        borderTop: '4px solid #818cf8', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '1rem',
    },
    loadingText: { color: '#94a3b8', fontSize: '0.9rem' },
    tabContent: {},
    statsGrid: {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem',
    },
    statCard: {
        background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '20px', padding: '1.5rem',
        display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid transparent',
    },
    statCardGreen: { borderLeftColor: '#22c55e' },
    statCardBlue: { borderLeftColor: '#3b82f6' },
    statCardPurple: { borderLeftColor: '#a855f7' },
    statCardAmber: { borderLeftColor: '#f59e0b' },
    statIcon: { fontSize: '2.5rem' },
    statLabel: { color: '#94a3b8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 },
    statValue: { fontSize: '1.9rem', fontWeight: '700', margin: '0.25rem 0 0' },
    statMeta: { color: '#64748b', fontSize: '0.85rem', margin: '0.25rem 0 0' },
    quickStats: {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem',
    },
    quickStatCard: {
        background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '16px', padding: '1.25rem',
        display: 'flex', alignItems: 'center', gap: '1rem',
    },
    quickStatIcon: { width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' },
    quickStatValue: { color: 'white', fontSize: '1.6rem', fontWeight: '700', margin: 0 },
    quickStatLabel: { color: '#94a3b8', fontSize: '0.9rem', margin: 0 },
    dateFilterCard: {
        background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '20px', padding: '1.5rem',
    },
    dateFilterHeader: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(99, 102, 241, 0.1)',
    },
    cardTitle: { color: 'white', fontSize: '1.1rem', fontWeight: '600', margin: 0 },
    dateInput: {
        background: 'rgba(15, 23, 42, 0.6)', border: '2px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '10px', padding: '0.5rem 1rem', color: 'white', fontSize: '0.9rem',
    },
    tableWrapper: { overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', color: '#94a3b8', fontSize: '0.8rem', padding: '0.75rem 1rem', borderBottom: '1px solid rgba(99, 102, 241, 0.1)' },
    tr: { borderBottom: '1px solid rgba(99, 102, 241, 0.05)' },
    td: { padding: '0.75rem 1rem', color: '#e2e8f0', fontSize: '0.9rem' },
    emptyState: { textAlign: 'center', padding: '2rem', color: '#64748b' },
    paymentDueCard: {
        background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '20px', padding: '1.5rem',
        marginTop: '1.5rem',
    },
    paymentDueHeader: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
        marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(99, 102, 241, 0.1)',
        gap: '1rem',
    },
    dueFilterBtns: {
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
    },
    dueFilterBtn: {
        background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)',
        color: '#94a3b8', padding: '0.5rem 1rem', borderRadius: '8px',
        fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s',
    },
    dueFilterBtnActive: {
        background: 'rgba(99, 102, 241, 0.3)', borderColor: '#6366f1', color: 'white',
    },
    dueFilterBtnRed: {
        background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171',
    },
    dueFilterBtnRedActive: {
        background: 'rgba(239, 68, 68, 0.3)', borderColor: '#ef4444', color: '#ef4444',
    },
    dueFilterBtnYellow: {
        background: 'rgba(251, 191, 36, 0.1)', borderColor: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24',
    },
    dueFilterBtnYellowActive: {
        background: 'rgba(251, 191, 36, 0.3)', borderColor: '#fbbf24', color: '#fbbf24',
    },
    dueUsersList: {
        display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '400px', overflowY: 'auto',
    },
    dueUserCard: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
        padding: '1rem', borderRadius: '12px', borderLeft: '4px solid', gap: '1rem',
    },
    dueUserInfo: {
        display: 'flex', alignItems: 'center', gap: '0.75rem',
    },
    dueUserAvatar: {
        width: '42px', height: '42px', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontSize: '1rem', fontWeight: 'bold', flexShrink: 0,
    },
    dueUserName: { color: 'white', fontSize: '1.05rem', fontWeight: '600', margin: 0 },
    dueUserPhone: { color: '#94a3b8', fontSize: '0.9rem', margin: '0.25rem 0 0' },
    dueStatusBox: {
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem',
    },
    dueBadge: {
        padding: '0.375rem 0.75rem', borderRadius: '8px',
        fontSize: '0.85rem', fontWeight: '700',
    },
    dueDateText: {
        color: '#64748b', fontSize: '0.85rem',
    },
    emptyStateLarge: {
        textAlign: 'center', padding: '4rem 2rem',
        background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(10px)',
        border: '2px dashed rgba(99, 102, 241, 0.2)', borderRadius: '20px', color: '#64748b',
    },
    emptyIcon: { fontSize: '4rem', display: 'block', marginBottom: '1rem', opacity: 0.4 },
    sectionHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.5rem',
    },
    sectionTitle: { color: 'white', fontSize: '1.35rem', fontWeight: '600', margin: 0 },
    searchBox: {
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(15, 23, 42, 0.6)',
        border: '2px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '12px',
        padding: '0.5rem 1rem',
        minWidth: '280px',
    },
    searchIcon: {
        marginRight: '0.5rem',
        fontSize: '1rem',
    },
    searchInput: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        color: 'white',
        fontSize: '1rem',
        outline: 'none',
    },
    searchClear: {
        background: 'rgba(99, 102, 241, 0.2)',
        border: 'none',
        borderRadius: '50%',
        width: '24px',
        height: '24px',
        color: '#94a3b8',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.8rem',
    },
    searchResults: {
        color: '#94a3b8',
        fontSize: '0.85rem',
        marginBottom: '1rem',
    },
    userGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' },
    userCard: {
        background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '20px', padding: '1.25rem',
    },
    userCardHeader: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' },
    userAvatar: {
        width: '48px', height: '48px', borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontSize: '1.25rem', fontWeight: 'bold',
    },
    userName: { color: 'white', fontSize: '1.1rem', fontWeight: '600', margin: 0 },
    userEmail: { color: '#94a3b8', fontSize: '0.9rem', margin: 0 },
    statusBadge: {
        marginLeft: 'auto', padding: '0.25rem 0.75rem', borderRadius: '8px',
        fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase',
    },
    statusBadgePending: {
        marginLeft: 'auto', padding: '0.25rem 0.75rem', borderRadius: '8px',
        fontSize: '0.7rem', fontWeight: '600', textTransform: 'uppercase',
        background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24',
    },
    statusBadgeActive: { background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' },
    statusBadgeRejected: { background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' },
    userDetails: { color: '#94a3b8', fontSize: '0.95rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', wordBreak: 'break-word', overflow: 'hidden' },
    userJoined: { marginTop: '0.5rem', color: '#64748b', fontSize: '0.75rem' },
    idProofThumb: {
        marginTop: '1rem', height: '80px', borderRadius: '12px', overflow: 'hidden',
        position: 'relative', cursor: 'pointer', background: 'rgba(15, 23, 42, 0.6)',
    },
    idProofImg: { width: '100%', height: '100%', objectFit: 'cover' },
    idProofOverlay: {
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontSize: '0.85rem', opacity: 0, transition: 'opacity 0.2s',
    },
    monthlyFeeSection: {
        marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(99, 102, 241, 0.1)',
    },
    monthlyFeeLabel: {
        color: '#f59e0b', fontSize: '0.9rem', fontWeight: '600', display: 'block', marginBottom: '0.5rem',
    },
    monthlyFeeInput: {
        width: '100%', background: 'rgba(15, 23, 42, 0.6)', border: '2px solid rgba(245, 158, 11, 0.3)',
        borderRadius: '10px', padding: '0.75rem 1rem', color: 'white', fontSize: '1rem',
    },
    actionBtns: { display: 'flex', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(99, 102, 241, 0.1)' },
    approveBtn: {
        flex: 1, background: 'rgba(34, 197, 94, 0.2)', border: '1px solid rgba(34, 197, 94, 0.3)',
        color: '#22c55e', padding: '0.625rem', borderRadius: '10px',
        fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s',
    },
    rejectBtn: {
        flex: 1, background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)',
        color: '#ef4444', padding: '0.625rem', borderRadius: '10px',
        fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s',
    },
    paymentList: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
    paymentCard: {
        background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(10px)',
        borderRadius: '16px', padding: '1.25rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
    },
    paymentCardApproved: { border: '1px solid rgba(34, 197, 94, 0.3)' },
    paymentCardRejected: { border: '1px solid rgba(239, 68, 68, 0.3)' },
    paymentCardPending: { border: '1px solid rgba(251, 191, 36, 0.3)' },
    paymentLeft: { display: 'flex', alignItems: 'center', gap: '1rem' },
    paymentIcon: {
        width: '48px', height: '48px', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0,
    },
    paymentAmount: { color: 'white', fontSize: '1.25rem', fontWeight: '700', margin: 0 },
    paymentUser: { color: '#94a3b8', fontSize: '0.85rem', margin: '0.25rem 0 0' },
    paymentMeta: { color: '#64748b', fontSize: '0.75rem', margin: '0.25rem 0 0' },
    paymentScheduled: { color: '#818cf8', fontSize: '0.75rem', margin: '0.25rem 0 0' },
    paymentNote: { color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic', margin: '0.5rem 0 0' },
    paymentRight: {},
    paymentActions: { display: 'flex', gap: '0.5rem' },
    paymentStatusBadge: {
        padding: '0.375rem 0.875rem', borderRadius: '8px',
        fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.05em',
    },
    duesSection: {
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid rgba(99, 102, 241, 0.1)',
    },
    duesHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.75rem',
        flexWrap: 'wrap',
        gap: '0.5rem',
    },
    duesLabel: {
        color: '#94a3b8',
        fontSize: '0.85rem',
        fontWeight: '500',
    },
    currentDues: {
        color: '#f59e0b',
        fontSize: '1.25rem',
        fontWeight: '700',
        wordBreak: 'break-word',
    },
    duesInputRow: {
        display: 'flex',
        gap: '0.5rem',
    },
    duesInput: {
        flex: 1,
        background: 'rgba(15, 23, 42, 0.6)',
        border: '2px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '10px',
        padding: '0.625rem 0.75rem',
        color: 'white',
        fontSize: '0.9rem',
    },
    duesUpdateBtn: {
        background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
        border: 'none',
        borderRadius: '10px',
        padding: '0.625rem 1rem',
        color: '#0f172a',
        fontSize: '0.85rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    viewDetailsBtn: {
        width: '100%',
        marginTop: '1rem',
        background: 'rgba(99, 102, 241, 0.1)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '10px',
        padding: '0.75rem',
        color: '#818cf8',
        fontSize: '0.9rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    modalCloseBtn: {
        position: 'absolute',
        top: '1rem',
        right: '1rem',
        background: 'rgba(239, 68, 68, 0.2)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '50%',
        width: '40px',
        height: '40px',
        color: '#ef4444',
        fontSize: '1.25rem',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    guestModal: {
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '24px',
        padding: '1.5rem',
        maxWidth: '600px',
        width: '95%',
        maxHeight: 'calc(100vh - 4rem)',
        overflowY: 'auto',
        position: 'relative',
        cursor: 'default',
    },
    guestModalHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '1.5rem',
        paddingBottom: '1.5rem',
        borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
    },
    guestModalAvatar: {
        width: '70px',
        height: '70px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '2rem',
        fontWeight: 'bold',
        flexShrink: 0,
    },
    guestModalName: {
        color: 'white',
        fontSize: '1.5rem',
        fontWeight: '700',
        margin: 0,
    },
    guestModalEmail: {
        color: '#94a3b8',
        fontSize: '0.9rem',
        margin: '0.25rem 0 0.5rem',
    },
    guestModalStatus: {
        display: 'inline-block',
        padding: '0.25rem 0.75rem',
        borderRadius: '8px',
        fontSize: '0.7rem',
        fontWeight: '600',
    },
    guestModalSection: {
        marginBottom: '1.5rem',
    },
    guestModalSectionTitle: {
        color: 'white',
        fontSize: '1rem',
        fontWeight: '600',
        marginBottom: '1rem',
    },
    guestModalGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
    },
    guestModalItem: {
        background: 'rgba(30, 41, 59, 0.5)',
        borderRadius: '12px',
        padding: '1rem',
    },
    guestModalLabel: {
        display: 'block',
        color: '#64748b',
        fontSize: '0.75rem',
        textTransform: 'uppercase',
        marginBottom: '0.25rem',
    },
    guestModalValue: {
        color: 'white',
        fontSize: '0.95rem',
        fontWeight: '500',
        wordBreak: 'break-word',
    },
    guestModalStats: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.75rem',
    },
    guestModalStat: {
        background: 'rgba(30, 41, 59, 0.5)',
        borderRadius: '12px',
        padding: '1rem',
        textAlign: 'center',
        borderBottom: '3px solid #ef4444',
    },
    guestModalStatValue: {
        display: 'block',
        color: '#ef4444',
        fontSize: '1.25rem',
        fontWeight: '700',
    },
    guestModalStatLabel: {
        color: '#64748b',
        fontSize: '0.7rem',
        textTransform: 'uppercase',
        marginTop: '0.25rem',
    },
    guestModalIdProof: {
        width: '100%',
        maxHeight: '200px',
        objectFit: 'cover',
        borderRadius: '12px',
        cursor: 'pointer',
    },
    guestModalEmpty: {
        color: '#64748b',
        fontSize: '0.9rem',
        textAlign: 'center',
        padding: '1.5rem',
        background: 'rgba(30, 41, 59, 0.5)',
        borderRadius: '12px',
    },
    guestModalPayments: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        maxHeight: '300px',
        overflowY: 'auto',
    },
    guestModalPayment: {
        background: 'rgba(30, 41, 59, 0.5)',
        borderRadius: '12px',
        padding: '1rem',
        borderLeft: '4px solid #fbbf24',
    },
    guestModalPaymentTop: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.5rem',
    },
    guestModalPaymentAmount: {
        color: 'white',
        fontSize: '1.1rem',
        fontWeight: '700',
    },
    guestModalPaymentStatus: {
        fontSize: '0.7rem',
        fontWeight: '700',
    },
    guestModalPaymentMeta: {
        color: '#64748b',
        fontSize: '0.8rem',
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
    },
    guestModalPaymentNote: {
        color: '#94a3b8',
        fontSize: '0.85rem',
        fontStyle: 'italic',
        marginTop: '0.5rem',
        marginBottom: 0,
    },
    // Room change request styles
    requestCountBadge: {
        background: 'rgba(99, 102, 241, 0.2)',
        border: '1px solid rgba(99, 102, 241, 0.4)',
        borderRadius: '10px',
        padding: '0.5rem 1rem',
        color: '#818cf8',
        fontSize: '0.85rem',
        fontWeight: '600',
    },
    roomChangeCard: {
        background: 'rgba(99, 102, 241, 0.1)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '12px',
        padding: '1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
    },
    roomChangeInfo: {
        flex: 1,
        minWidth: '200px',
    },
    roomChangeUser: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        color: 'white',
        marginBottom: '0.5rem',
    },
    roomChangeEmail: {
        color: '#94a3b8',
        fontSize: '0.8rem',
    },
    roomChangeDetails: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap',
    },
    roomChangeFrom: {
        background: 'rgba(239, 68, 68, 0.2)',
        color: '#f87171',
        padding: '0.25rem 0.5rem',
        borderRadius: '6px',
        fontSize: '0.85rem',
    },
    roomChangeArrow: {
        color: '#64748b',
        fontSize: '1rem',
    },
    roomChangeTo: {
        background: 'rgba(34, 197, 94, 0.2)',
        color: '#22c55e',
        padding: '0.25rem 0.5rem',
        borderRadius: '6px',
        fontSize: '0.85rem',
    },
    roomChangeReason: {
        color: '#94a3b8',
        fontSize: '0.8rem',
        margin: '0.5rem 0 0',
    },
    roomChangeActions: {
        display: 'flex',
        gap: '0.5rem',
    },
    roomChangeApprove: {
        background: 'rgba(34, 197, 94, 0.2)',
        border: '1px solid rgba(34, 197, 94, 0.4)',
        color: '#22c55e',
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        fontSize: '0.85rem',
        fontWeight: '600',
        cursor: 'pointer',
    },
    roomChangeReject: {
        background: 'rgba(239, 68, 68, 0.2)',
        border: '1px solid rgba(239, 68, 68, 0.4)',
        color: '#f87171',
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        fontSize: '0.85rem',
        fontWeight: '600',
        cursor: 'pointer',
    },
};
