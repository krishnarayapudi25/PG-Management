import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db, firebaseConfig } from '../services/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, setDoc, Timestamp } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { calculateGuestStatus } from '../utils/billingUtils';

// Helper: Compress image to target size (max 740KB for Firestore)
const compressImage = (file, maxSizeKB = 740) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Start with original size, reduce if needed
                let quality = 0.9;
                const maxSize = maxSizeKB * 1024;

                const tryCompress = () => {
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const base64 = canvas.toDataURL('image/jpeg', quality);
                    const sizeBytes = Math.round((base64.length - 22) * 3 / 4);

                    if (sizeBytes > maxSize && quality > 0.1) {
                        quality -= 0.1;
                        tryCompress();
                    } else if (sizeBytes > maxSize && width > 400) {
                        // Reduce dimensions
                        width = Math.round(width * 0.8);
                        height = Math.round(height * 0.8);
                        quality = 0.8;
                        tryCompress();
                    } else {
                        resolve(base64);
                    }
                };
                tryCompress();
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

// Helper: Convert file to Base64
const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

export default function PropertyManager({ externalGuestToOpen, onExternalGuestHandled }) {
    const [rooms, setRooms] = useState([]);
    const [floors, setFloors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddRoom, setShowAddRoom] = useState(false);
    const [editingRoom, setEditingRoom] = useState(null);
    const [selectedFloor, setSelectedFloor] = useState('all');

    // Add Guest State
    const [showAddGuest, setShowAddGuest] = useState(false);
    const [selectedRoomForGuest, setSelectedRoomForGuest] = useState(null);
    const [guestFormData, setGuestFormData] = useState({
        fullName: '',
        phone: '',
    });
    const [idProofPreview, setIdProofPreview] = useState(null);
    const [uploadStatus, setUploadStatus] = useState(''); // '', 'selected', 'uploading', 'success'
    const [addingGuest, setAddingGuest] = useState(false);
    const [viewingGuest, setViewingGuest] = useState(null);
    const [isEditingGuest, setIsEditingGuest] = useState(false);
    const [editFormData, setEditFormData] = useState({});
    const [viewingRoomGuests, setViewingRoomGuests] = useState(null); // Room whose guests are being viewed
    const [viewingImage, setViewingImage] = useState(null); // For ID Proof Lightbox
    const [guestPayments, setGuestPayments] = useState([]); // Payment history for viewing guest
    const [showAddPayment, setShowAddPayment] = useState(false); // Toggle add payment form
    const [paymentForm, setPaymentForm] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        time: '10:00',
        timePeriod: 'AM',
        note: ''
    });
    const [addingPayment, setAddingPayment] = useState(false); // Loading state for payment submission
    const [editingPayment, setEditingPayment] = useState(null); // Payment currently being edited

    // Form state
    const [formData, setFormData] = useState({
        roomName: '',
        floor: 'Ground Floor',
        sharingType: 1,
        rentPerBed: 0,
    });

    const sharingTypes = Array.from({ length: 15 }, (_, i) => ({
        value: i + 1,
        label: i === 0 ? 'Single Room' : i === 1 ? 'Double Sharing' : i === 2 ? 'Triple Sharing' : `${i + 1} Sharing`
    }));

    const floorOptions = ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', '4th Floor', '5th Floor'];

    useEffect(() => {
        fetchRooms();
    }, []);

    // Lock body scroll when any modal is open
    useEffect(() => {
        if (viewingGuest || showAddRoom || showAddGuest || viewingRoomGuests) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [viewingGuest, showAddRoom, showAddGuest, viewingRoomGuests]);

    // Fetch payments when viewing a guest
    useEffect(() => {
        if (viewingGuest) {
            fetchGuestPayments(viewingGuest.id);
        } else {
            setGuestPayments([]);
            setShowAddPayment(false);
        }
    }, [viewingGuest]);

    // Handle external guest passed from AdminDashboard (e.g., from Upcoming Payments Due)
    useEffect(() => {
        if (externalGuestToOpen) {
            setViewingGuest(externalGuestToOpen);
            if (onExternalGuestHandled) {
                onExternalGuestHandled(); // Clear the external guest after handling
            }
        }
    }, [externalGuestToOpen]);

    const fetchRooms = async () => {
        setLoading(true);
        try {
            const roomsSnap = await getDocs(collection(db, 'rooms'));
            const roomsData = roomsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fetch ALL users once (instead of 1 query per room)
            const allUsersSnap = await getDocs(collection(db, 'users'));
            const allUsers = allUsersSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(u => u.accountStatus !== 'rejected' && !u.deleted);

            // Group users by roomId
            for (let room of roomsData) {
                room.tenants = allUsers.filter(u => u.roomId === room.id);
                room.occupiedBeds = room.tenants.length;
            }

            setRooms(roomsData);

            // Extract unique floors
            const uniqueFloors = [...new Set(roomsData.map(r => r.floor))];
            setFloors(uniqueFloors.sort());
        } catch (error) {
            console.error('Error fetching rooms:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddRoom = async (e) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, 'rooms'), {
                roomName: formData.roomName,
                floor: formData.floor,
                sharingType: parseInt(formData.sharingType),
                rentPerBed: parseFloat(formData.rentPerBed) || 0,
                totalBeds: parseInt(formData.sharingType),
                createdAt: new Date(),
            });
            setFormData({ roomName: '', floor: 'Ground Floor', sharingType: 1, rentPerBed: 0 });
            setShowAddRoom(false);
            fetchRooms();
        } catch (error) {
            console.error('Error adding room:', error);
            alert('Failed to add room');
        }
    };

    const handleUpdateRoom = async (e) => {
        e.preventDefault();
        try {
            const roomRef = doc(db, 'rooms', editingRoom.id);
            await updateDoc(roomRef, {
                roomName: formData.roomName,
                floor: formData.floor,
                sharingType: parseInt(formData.sharingType),
                totalBeds: parseInt(formData.sharingType),
                rentPerBed: parseFloat(formData.rentPerBed) || 0,
            });
            setEditingRoom(null);
            setFormData({ roomName: '', floor: 'Ground Floor', sharingType: 1, rentPerBed: 0 });
            fetchRooms();
        } catch (error) {
            console.error('Error updating room:', error);
            alert('Failed to update room');
        }
    };

    const handleDeleteRoom = async (roomId) => {
        if (!confirm('Are you sure you want to delete this room?')) return;
        try {
            await deleteDoc(doc(db, 'rooms', roomId));
            fetchRooms();
        } catch (error) {
            console.error('Error deleting room:', error);
            alert('Failed to delete room');
        }
    };

    const generatePassword = (name, phone) => {
        // Password is now the phone number itself for simplicity
        return phone;
    };

    const handleAddGuestSubmit = async (e) => {
        e.preventDefault();

        const { fullName, phone, joiningDate, billingStartDate } = guestFormData;
        const room = selectedRoomForGuest;

        if (!fullName || !phone) {
            alert('Please fill in all required fields');
            return;
        }

        if (phone.length < 10) {
            alert('Phone number must be at least 10 digits');
            return;
        }

        setAddingGuest(true);
        setUploadStatus('uploading');

        let secondaryApp = null;

        try {
            // Check if phone number already exists in Firestore
            const phoneQuery = query(collection(db, 'users'), where('phone', '==', phone));
            const phoneSnapshot = await getDocs(phoneQuery);

            if (!phoneSnapshot.empty) {
                const existingUser = phoneSnapshot.docs[0];
                const existingUserData = existingUser.data();

                // User exists (Active or Deleted) - Prompt to update
                const confirmMessage = existingUserData.deleted
                    ? `A deleted account was found for "${existingUserData.fullName}" with this phone number.\n\nDo you want to reactivate this guest and add them to this room?`
                    : `User "${existingUserData.fullName}" already exists with this phone number.\n\nDo you want to update their details and move them to this room?`;

                if (window.confirm(confirmMessage)) {
                    // Update/Reactivate existing user
                    const joinTimestamp = joiningDate ? Timestamp.fromDate(new Date(joiningDate)) : Timestamp.now();
                    const password = generatePassword(fullName, phone);

                    let idProofBase64 = '';
                    if (guestFormData.idProof) {
                        try {
                            const file = guestFormData.idProof;
                            const maxSizeKB = 740;

                            if (file.type.startsWith('image/')) {
                                idProofBase64 = await compressImage(file, maxSizeKB);
                                setUploadStatus('success');
                            } else if (file.type === 'application/pdf') {
                                if (file.size > maxSizeKB * 1024) {
                                    alert(`PDF is too large (${Math.round(file.size / 1024)}KB). Max allowed is ${maxSizeKB}KB. Please use a smaller file.`);
                                } else {
                                    idProofBase64 = await fileToBase64(file);
                                    setUploadStatus('success');
                                }
                            } else {
                                if (file.size <= maxSizeKB * 1024) {
                                    idProofBase64 = await fileToBase64(file);
                                    setUploadStatus('success');
                                } else {
                                    alert('File is too large. Please use an image or a smaller PDF.');
                                }
                            }
                        } catch (err) {
                            console.error("ID Proof processing failed:", err);
                            alert(`ID proof processing failed: ${err.message}`);
                        }
                    }

                    // Update existing user document
                    await updateDoc(doc(db, 'users', existingUser.id), {
                        fullName: fullName,
                        roomId: room.id,
                        roomName: room.roomName,
                        floor: room.floor,
                        monthlyFee: room.rentPerBed || 0,
                        createdAt: joinTimestamp,
                        billingStartDate: billingStartDate ? Timestamp.fromDate(new Date(billingStartDate)) : joinTimestamp,
                        accountStatus: 'active',
                        deleted: false,
                        deletedAt: null,
                        generatedPassword: password,
                        // Only update ID proof if a new one is provided
                        ...(idProofBase64 ? { idProofBase64 } : {})
                    });

                    alert(`Guest details updated successfully!\n\nLogin ID: ${phone}\nPassword: ${password}`);
                    setShowAddGuest(false);
                    setGuestFormData({ fullName: '', phone: '', joiningDate: '', billingStartDate: '' });
                    fetchRooms();
                    setUploadStatus('success');
                    setAddingGuest(false);
                    return;
                } else {
                    setAddingGuest(false);
                    setUploadStatus('');
                    return;
                }
            }

            // Phone number doesn't exist - create new user
            // Initialize secondary app to create user without signing out admin
            // Use unique name to prevent conflicts
            secondaryApp = initializeApp(firebaseConfig, `GuestCreator-${Date.now()}`);
            const secondaryAuth = getAuth(secondaryApp);

            // Generate credentials
            const email = `${phone}@hotel.com`; // Placeholder email using phone
            const password = generatePassword(fullName, phone);

            // Create user in Auth
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const user = userCredential.user;

            let idProofBase64 = '';
            if (guestFormData.idProof) {
                try {
                    const file = guestFormData.idProof;
                    const maxSizeKB = 740;

                    if (file.type.startsWith('image/')) {
                        // Compress image
                        idProofBase64 = await compressImage(file, maxSizeKB);
                        setUploadStatus('success');
                    } else if (file.type === 'application/pdf') {
                        // Check PDF size
                        if (file.size > maxSizeKB * 1024) {
                            alert(`PDF is too large (${Math.round(file.size / 1024)}KB). Max allowed is ${maxSizeKB}KB. Please use a smaller file.`);
                        } else {
                            idProofBase64 = await fileToBase64(file);
                            setUploadStatus('success');
                        }
                    } else {
                        // Other file types - try direct conversion if small
                        if (file.size <= maxSizeKB * 1024) {
                            idProofBase64 = await fileToBase64(file);
                            setUploadStatus('success');
                        } else {
                            alert('File is too large. Please use an image or a smaller PDF.');
                        }
                    }
                } catch (err) {
                    console.error("ID Proof processing failed:", err);
                    alert(`ID proof processing failed: ${err.message}`);
                }
            }

            const joinTimestamp = joiningDate ? Timestamp.fromDate(new Date(joiningDate)) : Timestamp.now();
            const billingStartTimestamp = billingStartDate ? Timestamp.fromDate(new Date(billingStartDate)) : joinTimestamp;

            // Create user doc in Firestore
            await setDoc(doc(db, 'users', user.uid), {
                email: email, // This is the placeholder email
                fullName: fullName,
                phone: phone,
                role: 'guest',
                accountStatus: 'active', // Admin added, so active immediately
                roomId: room.id,
                roomName: room.roomName,
                floor: room.floor,
                monthlyFee: room.rentPerBed || 0, // Set default monthly fee to room rent
                createdAt: joinTimestamp,
                billingStartDate: billingStartTimestamp,
                profileComplete: false,
                generatedPassword: password,
                idProofBase64: idProofBase64, // Stored as Base64 in Firestore
                deleted: false, // Add deleted field for new users
            });

            alert(`Guest added successfully!\n\nLogin ID: ${phone}\nPassword: ${password}\n\nPlease share these credentials with the guest.`);

            setShowAddGuest(false);
            setGuestFormData({ fullName: '', phone: '', joiningDate: '', billingStartDate: '' });
            fetchRooms(); // Refresh to update occupancy

            // Sign out from secondary app
            await signOut(secondaryAuth);
            setUploadStatus('success');

        } catch (error) {
            console.error("Error adding guest:", error);

            // Handle orphaned account (Auth exists, Firestore missing)
            if (error.code === 'auth/email-already-in-use' && secondaryApp) {
                const secondaryAuth = getAuth(secondaryApp);
                // Define credentials in outer scope so they are available for both recovery and fallback
                const email = `${phone}@hotel.com`;
                const password = generatePassword(fullName, phone);

                try {
                    // Try to recover by signing in with the generated password
                    const userCredential = await signInWithEmailAndPassword(secondaryAuth, email, password);
                    const user = userCredential.user;

                    // Account recovered! Now create the missing Firestore document
                    const joinTimestamp = joiningDate ? Timestamp.fromDate(new Date(joiningDate)) : Timestamp.now();

                    let idProofBase64 = '';
                    if (guestFormData.idProof) {
                        try {
                            const file = guestFormData.idProof;
                            const maxSizeKB = 740;
                            if (file.type.startsWith('image/')) {
                                idProofBase64 = await compressImage(file, maxSizeKB);
                            } else if (file.size <= maxSizeKB * 1024) {
                                idProofBase64 = await fileToBase64(file);
                            }
                        } catch (err) {
                            console.error("ID Proof recovery processing failed:", err);
                        }
                    }

                    await setDoc(doc(db, 'users', user.uid), {
                        email: email,
                        fullName: fullName,
                        phone: phone,
                        role: 'guest',
                        accountStatus: 'active',
                        roomId: room.id,
                        roomName: room.roomName,
                        floor: room.floor,
                        monthlyFee: room.rentPerBed || 0,
                        createdAt: joinTimestamp,
                        billingStartDate: billingStartTimestamp,
                        profileComplete: false,
                        generatedPassword: password,
                        idProofBase64: idProofBase64,
                        deleted: false,
                    });

                    alert(`Guest recovered and added successfully!\n\n(The account existed but was missing data. It has been repaired.)\n\nLogin ID: ${phone}\nPassword: ${password}`);

                    setShowAddGuest(false);
                    setGuestFormData({ fullName: '', phone: '', joiningDate: '', billingStartDate: '' });
                    fetchRooms();
                    setUploadStatus('success');

                    // Cleanup handled in finally
                    return;
                } catch (recoveryError) {
                    console.error("Recovery failed:", recoveryError);

                    // Fallback: Create a NEW account with a unique email to bypass the collision
                    // This handles cases where we can't sign in to the old account (wrong password)
                    try {
                        const altEmail = `${phone}_${Date.now()}@hotel.com`;
                        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, altEmail, password);
                        const user = userCredential.user;

                        // Create the NEW Firestore doc
                        const joinTimestamp = joiningDate ? Timestamp.fromDate(new Date(joiningDate)) : Timestamp.now();

                        let idProofBase64 = '';
                        if (guestFormData.idProof) {
                            try {
                                const file = guestFormData.idProof;
                                const maxSizeKB = 740;
                                if (file.type.startsWith('image/')) {
                                    idProofBase64 = await compressImage(file, maxSizeKB);
                                } else if (file.size <= maxSizeKB * 1024) {
                                    idProofBase64 = await fileToBase64(file);
                                }
                            } catch (err) {
                                console.error("ID Proof processing failed:", err);
                            }
                        }

                        await setDoc(doc(db, 'users', user.uid), {
                            email: altEmail, // Store the technical email
                            fullName: fullName,
                            phone: phone,
                            role: 'guest',
                            accountStatus: 'active',
                            roomId: room.id,
                            roomName: room.roomName,
                            floor: room.floor,
                            monthlyFee: room.rentPerBed || 0,
                            createdAt: joinTimestamp,
                            billingStartDate: billingStartTimestamp,
                            profileComplete: false,
                            generatedPassword: password,
                            idProofBase64: idProofBase64,
                            deleted: false,
                        });

                        alert(`Guest added successfully (New Account Created)!\n\nLogin ID: ${phone}\nPassword: ${password}`);
                        setShowAddGuest(false);
                        setGuestFormData({ fullName: '', phone: '', joiningDate: '', billingStartDate: '' });
                        fetchRooms();
                        setUploadStatus('success');
                        return;

                    } catch (createError) {
                        console.error("Fallback creation failed:", createError);
                        setUploadStatus('error');
                        alert(`Failed to create guest account: ${createError.message}`);
                    }
                }
            } else {
                setUploadStatus('error');
                if (error.code === 'auth/email-already-in-use') {
                    alert('A user with this phone number already exists.');
                } else {
                    alert('Failed to add guest: ' + error.message);
                }
            }
        } finally {
            if (secondaryApp) {
                try {
                    await deleteApp(secondaryApp);
                } catch (e) {
                    console.error("Error cleaning up secondary app:", e);
                }
            }
            setAddingGuest(false);
        }
    };

    // ... (keep existing code)

    // And update the form UI (targeting the lines around 506-523)
    // Note: I will use a separate replace_file_content for the UI because it's far away.
    // Wait, the tool definition says "Do NOT make multiple parallel calls to this tool... for the same file".
    // I MUST do it in one go if I want to be safe, or sequential.
    // Since lines are far apart (146 vs 500), I should probably use `multi_replace_file_content`?
    // No, I'll just do two sequential calls.
    // I'll return ONLY the function update here.

    const handleUpdateGuest = async (e) => {
        e.preventDefault();
        if (!editFormData.fullName || !editFormData.phone) return;

        try {
            const userRef = doc(db, 'users', viewingGuest.id);

            // Handle date conversion
            let newCreatedAt = viewingGuest.createdAt;
            if (editFormData.joiningDate) {
                newCreatedAt = Timestamp.fromDate(new Date(editFormData.joiningDate));
            }

            let newBillingStartDate = viewingGuest.billingStartDate || viewingGuest.createdAt;
            if (editFormData.billingStartDate) {
                newBillingStartDate = Timestamp.fromDate(new Date(editFormData.billingStartDate));
            }

            // Filter out undefined values to prevent Firestore errors
            // Check for room change
            let roomUpdates = {};
            if (editFormData.roomId && editFormData.roomId !== viewingGuest.roomId) {
                const newRoom = rooms.find(r => r.id === editFormData.roomId);
                if (newRoom) {
                    roomUpdates = {
                        roomId: newRoom.id,
                        roomName: newRoom.roomName,
                        floor: newRoom.floor
                    };
                }
            }

            // Filter out undefined values to prevent Firestore errors
            const updates = {
                fullName: editFormData.fullName,
                phone: editFormData.phone,
                email: editFormData.email || '',
                fatherName: editFormData.fatherName || '',
                address: editFormData.address || '',
                monthlyFee: parseFloat(editFormData.monthlyFee) || 0,
                alternativePhone: editFormData.alternativePhone || '',
                createdAt: newCreatedAt,
                billingStartDate: newBillingStartDate,
                ...roomUpdates
            };

            await updateDoc(userRef, updates);

            // Update local state visuals
            setViewingGuest(prev => ({ ...prev, ...updates }));
            setIsEditingGuest(false);
            fetchRooms();
            alert('Guest details updated successfully!');
        } catch (error) {
            console.error('Error updating guest:', error);
            alert('Failed to update guest details: ' + error.message);
        }
    };

    const calculatePendingAmount = (guest, payments) => {
        if (!guest || !guest.createdAt || !guest.monthlyFee) return 0;

        const joinDate = guest.createdAt.toDate ? guest.createdAt.toDate() : new Date(guest.createdAt);
        const today = new Date();

        // Calculate days since joining
        const timeDiff = today.getTime() - joinDate.getTime();
        const daysSinceJoin = Math.floor(timeDiff / (1000 * 3600 * 24));

        // Calculate current 30-day cycle
        const currentCycleIndex = Math.floor(daysSinceJoin / 30);

        const cycleStart = new Date(joinDate);
        cycleStart.setDate(joinDate.getDate() + (currentCycleIndex * 30));
        cycleStart.setHours(0, 0, 0, 0); // Start of day

        const cycleEnd = new Date(cycleStart);
        cycleEnd.setDate(cycleStart.getDate() + 30);
        cycleEnd.setHours(0, 0, 0, 0); // Start of next cycle

        // Calculate total approved payments in this cycle
        const totalPaid = payments
            .filter(p => {
                if (p.status !== 'approved' || !p.paymentDate) return false;
                const pDate = new Date(p.paymentDate);
                pDate.setHours(0, 0, 0, 0); // Normalize time
                return pDate >= cycleStart && pDate < cycleEnd;
            })
            .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        return Math.max(0, guest.monthlyFee - totalPaid);
    };

    const handleDeleteGuest = async () => {
        if (!viewingGuest) return;

        const confirmDelete = window.confirm(
            `Are you sure you want to remove ${viewingGuest.fullName}?\n\nThis will mark their account as deleted. You can re-add them later with the same phone number.`
        );

        if (!confirmDelete) return;

        try {
            // Soft delete: Mark as deleted instead of removing document
            await updateDoc(doc(db, 'users', viewingGuest.id), {
                deleted: true,
                deletedAt: Timestamp.now(),
                accountStatus: 'deleted'
            });
            alert('Guest removed successfully.');
            setViewingGuest(null);
            fetchRooms(); // Refresh occupancy
        } catch (error) {
            console.error('Error deleting guest:', error);
            alert('Failed to delete guest: ' + error.message);
        }
    };

    const fetchGuestPayments = async (userId) => {
        if (!userId) return;

        try {
            const paymentsQuery = query(
                collection(db, 'payments'),
                where('userId', '==', userId)
            );
            const paymentsSnap = await getDocs(paymentsQuery);
            const paymentsData = paymentsSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Sort by payment date descending
            paymentsData.sort((a, b) => {
                const dateA = a.createdAt?.seconds || 0;
                const dateB = b.createdAt?.seconds || 0;
                return dateB - dateA;
            });

            setGuestPayments(paymentsData);
        } catch (error) {
            console.error('Error fetching guest payments:', error);
            setGuestPayments([]);
        }
    };

    const handleAddPayment = async (e) => {
        e.preventDefault();

        if (!viewingGuest) return;

        const { amount, date, time, timePeriod, note } = paymentForm;

        if (!amount || parseFloat(amount) <= 0) {
            alert('Please enter a valid payment amount');
            return;
        }

        setAddingPayment(true);

        try {
            // Include both userId AND userPhone for robust matching
            const paymentData = {
                userId: viewingGuest.id,
                userPhone: viewingGuest.phone || '', // Store phone number for fallback matching
                amount: Number(paymentForm.amount),
                status: 'approved',
                paymentDate: paymentForm.date,
                paymentTime: `${paymentForm.time} ${paymentForm.timePeriod}`,
                note: paymentForm.note || 'Manual Entry',
                createdAt: Timestamp.now(),
                type: 'manual'
            };

            await addDoc(collection(db, 'payments'), paymentData);

            // Refetch payments
            await fetchGuestPayments(viewingGuest.id);

            // Reset form
            setPaymentForm({
                amount: '',
                date: new Date().toISOString().split('T')[0],
                time: '10:00',
                timePeriod: 'AM',
                note: ''
            });
            setShowAddPayment(false);
            alert('Payment added successfully!');
        } catch (error) {
            console.error("Error adding payment:", error);
            alert('Failed to add payment.');
        } finally {
            setAddingPayment(false);
        }
    };

    const handleDeletePayment = async (paymentId) => {
        if (!window.confirm("Are you sure you want to delete this payment? This action cannot be undone.")) return;
        try {
            await deleteDoc(doc(db, "payments", paymentId));
            await fetchGuestPayments(viewingGuest.id);
            alert("Payment deleted successfully!");
        } catch (err) {
            console.error("Error deleting payment:", err);
            alert("Failed to delete payment.");
        }
    };

    const handleUpdatePayment = async (e) => {
        e.preventDefault();
        if (!editingPayment) return;

        try {
            await updateDoc(doc(db, "payments", editingPayment.id), {
                amount: Number(editingPayment.amount),
                paymentDate: editingPayment.date,
                paymentTime: editingPayment.time, // Already formatted or split if needed
                note: editingPayment.note,
                status: editingPayment.status // Allow updating status if needed, or keep as is
            });

            setEditingPayment(null);
            await fetchGuestPayments(viewingGuest.id);
            alert("Payment updated successfully!");
        } catch (err) {
            console.error("Error updating payment", err);
            alert("Failed to update payment");
        }
    };

    const startEdit = (room) => {
        setEditingRoom(room);
        setFormData({
            roomName: room.roomName,
            floor: room.floor,
            sharingType: room.sharingType,
            rentPerBed: room.rentPerBed || 0,
        });
        setShowAddRoom(false);
    };

    // Statistics
    const totalRooms = rooms.length;
    const totalBeds = rooms.reduce((sum, r) => sum + (r.totalBeds || r.sharingType || 0), 0);
    const occupiedBeds = rooms.reduce((sum, r) => sum + (r.occupiedBeds || 0), 0);
    const vacantBeds = totalBeds - occupiedBeds;

    // Filter rooms by floor
    const filteredRooms = selectedFloor === 'all'
        ? rooms
        : rooms.filter(r => r.floor === selectedFloor);

    // Group rooms by floor
    const roomsByFloor = filteredRooms.reduce((acc, room) => {
        if (!acc[room.floor]) acc[room.floor] = [];
        acc[room.floor].push(room);
        return acc;
    }, {});

    const formatCurrency = (amount) => Number(amount || 0).toLocaleString('en-IN');

    if (loading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.spinner}></div>
                <p style={styles.loadingText}>Loading property data...</p>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Statistics Cards */}
            <div style={styles.statsGrid}>
                <div style={{ ...styles.statCard, borderLeftColor: '#6366f1' }}>
                    <div style={styles.statIcon}>🏠</div>
                    <div>
                        <p style={styles.statLabel}>Total Rooms</p>
                        <p style={{ ...styles.statValue, color: '#818cf8' }}>{totalRooms}</p>
                    </div>
                </div>
                <div style={{ ...styles.statCard, borderLeftColor: '#22c55e' }}>
                    <div style={styles.statIcon}>🛏️</div>
                    <div>
                        <p style={styles.statLabel}>Total Beds</p>
                        <p style={{ ...styles.statValue, color: '#22c55e' }}>{totalBeds}</p>
                    </div>
                </div>
                <div style={{ ...styles.statCard, borderLeftColor: '#ef4444' }}>
                    <div style={styles.statIcon}>👤</div>
                    <div>
                        <p style={styles.statLabel}>Occupied</p>
                        <p style={{ ...styles.statValue, color: '#ef4444' }}>{occupiedBeds}</p>
                    </div>
                </div>
                <div style={{ ...styles.statCard, borderLeftColor: '#22c55e' }}>
                    <div style={styles.statIcon}>✅</div>
                    <div>
                        <p style={styles.statLabel}>Vacant</p>
                        <p style={{ ...styles.statValue, color: '#22c55e' }}>{vacantBeds}</p>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div style={styles.controls}>
                <div style={styles.floorFilter}>
                    <label style={styles.filterLabel}>Filter by Floor:</label>
                    <select
                        value={selectedFloor}
                        onChange={(e) => setSelectedFloor(e.target.value)}
                        style={styles.selectInput}
                    >
                        <option value="all">All Floors</option>
                        {floorOptions.map(floor => (
                            <option key={floor} value={floor}>{floor}</option>
                        ))}
                    </select>
                </div>
                <button onClick={() => { setShowAddRoom(true); setEditingRoom(null); }} style={styles.addBtn}>
                    ➕ Add Room
                </button>
            </div>

            {/* Add/Edit Room Modal */}
            {(showAddRoom || editingRoom) && createPortal(
                <div style={styles.modal} onClick={() => { setShowAddRoom(false); setEditingRoom(null); }}>
                    <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <h3 style={styles.modalTitle}>
                            {editingRoom ? '✏️ Edit Room' : '➕ Add New Room'}
                        </h3>
                        <form onSubmit={editingRoom ? handleUpdateRoom : handleAddRoom} style={styles.form}>
                            <div className="propertyFormRow" style={styles.formRow}>
                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>Room Name *</label>
                                    <input
                                        type="text"
                                        value={formData.roomName}
                                        onChange={(e) => setFormData({ ...formData, roomName: e.target.value })}
                                        placeholder="e.g., Room 101"
                                        style={styles.input}
                                        required
                                    />
                                </div>
                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>Floor *</label>
                                    <select
                                        value={formData.floor}
                                        onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                                        style={styles.input}
                                    >
                                        {floorOptions.map(floor => (
                                            <option key={floor} value={floor}>{floor}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="propertyFormRow" style={styles.formRow}>
                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>Sharing Type *</label>
                                    <select
                                        value={formData.sharingType}
                                        onChange={(e) => setFormData({ ...formData, sharingType: e.target.value })}
                                        style={styles.input}
                                    >
                                        {sharingTypes.map(type => (
                                            <option key={type.value} value={type.value}>{type.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>Rent/Bed (₹)</label>
                                    <input
                                        type="number"
                                        value={formData.rentPerBed}
                                        onChange={(e) => setFormData({ ...formData, rentPerBed: e.target.value })}
                                        placeholder="0"
                                        style={styles.input}
                                        min="0"
                                    />
                                </div>
                            </div>
                            <div className="propertyModalActions" style={styles.modalActions}>
                                <button type="button" onClick={() => { setShowAddRoom(false); setEditingRoom(null); }} style={styles.cancelBtn}>
                                    Cancel
                                </button>
                                <button type="submit" style={styles.submitBtn}>
                                    {editingRoom ? '💾 Save Changes' : '➕ Add Room'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Floor-wise Room Display */}
            {Object.keys(roomsByFloor).length === 0 ? (
                <div style={styles.emptyState}>
                    <span style={styles.emptyIcon}>🏠</span>
                    <p>No rooms found. Add your first room to get started!</p>
                </div>
            ) : (
                Object.entries(roomsByFloor).sort().map(([floor, floorRooms]) => (
                    <div key={floor} style={styles.floorSection}>
                        <div style={styles.floorHeader}>
                            <h3 style={styles.floorTitle}>
                                <span style={styles.floorIcon}>🏢</span> {floor}
                            </h3>
                            <span style={styles.floorStats}>
                                {floorRooms.length} rooms • {floorRooms.reduce((s, r) => s + (r.occupiedBeds || 0), 0)}/{floorRooms.reduce((s, r) => s + (r.totalBeds || r.sharingType), 0)} beds filled
                            </span>
                        </div>
                        <div style={styles.roomsGrid}>
                            {floorRooms.map(room => (
                                <div key={room.id} style={styles.roomCard}>
                                    <div style={styles.roomHeader}>
                                        <h4 style={styles.roomName}>{room.roomName}</h4>
                                        <span style={{
                                            ...styles.roomBadge,
                                            background: room.occupiedBeds === 0 ? 'rgba(34, 197, 94, 0.2)' :
                                                room.occupiedBeds >= room.totalBeds ? 'rgba(239, 68, 68, 0.2)' :
                                                    'rgba(251, 191, 36, 0.2)',
                                            color: room.occupiedBeds === 0 ? '#22c55e' :
                                                room.occupiedBeds >= room.totalBeds ? '#ef4444' : '#fbbf24',
                                        }}>
                                            {room.occupiedBeds === 0 ? 'Vacant' :
                                                room.occupiedBeds >= room.totalBeds ? 'Full' : 'Partial'}
                                        </span>
                                    </div>

                                    {/* Bed visualization */}
                                    <div style={styles.bedsRow}>
                                        {Array.from({ length: room.totalBeds || room.sharingType }).map((_, idx) => {
                                            // Get tenant for this bed position (if occupied)
                                            const tenant = room.tenants && room.tenants[idx] ? room.tenants[idx] : null;
                                            const isOccupied = tenant !== null;

                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (tenant) {
                                                            console.log('Clicked tenant:', tenant);
                                                            setViewingGuest(tenant);
                                                        }
                                                    }}
                                                    style={{
                                                        ...styles.bedIcon,
                                                        color: isOccupied ? '#ef4444' : '#22c55e',
                                                        cursor: isOccupied ? 'pointer' : 'default',
                                                        textShadow: isOccupied ? '0 0 10px rgba(239, 68, 68, 0.5)' : 'none',
                                                        background: isOccupied ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                                                        borderRadius: '6px',
                                                        padding: '2px 4px',
                                                        transform: isOccupied ? 'scale(1.1)' : 'scale(1)',
                                                        transition: 'all 0.2s',
                                                        border: isOccupied ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid transparent',
                                                    }}
                                                    title={tenant ? `Click to view: ${tenant.fullName}` : 'Vacant bed'}
                                                >
                                                    🛏️
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div style={styles.roomMeta}>
                                        <p><span style={styles.metaLabel}>Type:</span> {sharingTypes.find(t => t.value === room.sharingType)?.label || `${room.sharingType} Sharing`}</p>
                                        <p><span style={styles.metaLabel}>Rent:</span> ₹{formatCurrency(room.rentPerBed)}/bed</p>
                                        <p><span style={styles.metaLabel}>Status:</span> {room.occupiedBeds || 0}/{room.totalBeds} occupied</p>
                                    </div>

                                    <div style={styles.roomActions}>
                                        <button
                                            onClick={() => setViewingRoomGuests(room)}
                                            style={styles.viewGuestsBtn}
                                            title="View All Guests"
                                        >
                                            👁️
                                        </button>
                                        {(room.occupiedBeds || 0) < room.totalBeds && (
                                            <button
                                                onClick={() => {
                                                    setSelectedRoomForGuest(room);
                                                    setShowAddGuest(true);
                                                }}
                                                style={styles.addGuestBtn}
                                            >
                                                👤 Add
                                            </button>
                                        )}
                                        <button onClick={() => startEdit(room)} style={styles.editBtn}>✏️ Edit</button>
                                        <button onClick={() => handleDeleteRoom(room.id)} style={styles.deleteBtn}>🗑️</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))
            )}

            {/* View Room Guests Modal */}
            {viewingRoomGuests && createPortal(
                <div style={styles.modal} onClick={() => setViewingRoomGuests(null)}>
                    <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(99, 102, 241, 0.2)', paddingBottom: '1rem' }}>
                            <h3 style={{ ...styles.modalTitle, marginBottom: 0 }}>
                                👥 Guests in {viewingRoomGuests.roomName}
                            </h3>
                            <button
                                onClick={() => setViewingRoomGuests(null)}
                                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}
                            >
                                ✕
                            </button>
                        </div>

                        {!viewingRoomGuests.tenants || viewingRoomGuests.tenants.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                <p style={{ fontSize: '3rem', margin: '0 0 1rem' }}>🛏️</p>
                                <p>No guests currently staying in this room.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {viewingRoomGuests.tenants.map((guest, idx) => (
                                    <div
                                        key={guest.id || idx}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setViewingGuest(guest);
                                            setViewingRoomGuests(null);
                                        }}
                                        style={{
                                            background: 'rgba(30, 41, 59, 0.4)',
                                            border: '1px solid rgba(99, 102, 241, 0.2)',
                                            borderRadius: '12px',
                                            padding: '1rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            cursor: 'pointer',
                                            transition: 'background 0.2s',
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(30, 41, 59, 0.6)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(30, 41, 59, 0.4)'}
                                    >
                                        <div style={{
                                            width: '40px', height: '40px', borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'white', fontWeight: 'bold', fontSize: '1.1rem', flexShrink: 0
                                        }}>
                                            {guest.fullName?.charAt(0) || '?'}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <h4 style={{ color: 'white', margin: '0 0 0.25rem', fontSize: '1rem' }}>
                                                {guest.fullName}
                                            </h4>
                                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                                                <a
                                                    href={`tel:${guest.phone}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                                    title="Call Guest"
                                                >
                                                    📞 {guest.phone}
                                                </a>
                                                <span style={{ color: '#94a3b8' }}>
                                                    📅 Joined: {guest.createdAt?.toDate ? guest.createdAt.toDate().toLocaleDateString('en-IN') : 'N/A'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* Add Guest Modal */}
            {showAddGuest && createPortal(
                <div style={styles.modal} onClick={() => { setShowAddGuest(false); setGuestFormData({ fullName: '', phone: '' }); setIdProofPreview(null); setUploadStatus(''); }}>
                    <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <h3 style={styles.modalTitle}>
                            👤 Add Guest to {selectedRoomForGuest?.roomName}
                        </h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            Create a new user account and assign them to this room immediately.
                        </p>
                        <form onSubmit={handleAddGuestSubmit} style={styles.form}>
                            <div className="propertyFormRow" style={styles.formRow}>
                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>Full Name *</label>
                                    <input
                                        type="text"
                                        value={guestFormData.fullName}
                                        onChange={(e) => setGuestFormData({ ...guestFormData, fullName: e.target.value })}
                                        placeholder="Enter guest name"
                                        style={styles.input}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="propertyFormRow" style={styles.formRow}>
                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>Phone Number *</label>
                                    <input
                                        type="tel"
                                        value={guestFormData.phone}
                                        onChange={(e) => setGuestFormData({ ...guestFormData, phone: e.target.value })}
                                        placeholder="10-digit mobile number"
                                        style={styles.input}
                                        required
                                        minLength="10"
                                        maxLength="10"
                                    />
                                    <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                        Login ID
                                    </p>
                                </div>
                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>Joining Date</label>
                                    <input
                                        type="date"
                                        value={guestFormData.joiningDate || new Date().toISOString().split('T')[0]}
                                        onChange={(e) => setGuestFormData({ ...guestFormData, joiningDate: e.target.value })}
                                        style={styles.input}
                                    />
                                </div>
                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>Billing Start Date</label>
                                    <input
                                        type="date"
                                        value={guestFormData.billingStartDate || guestFormData.joiningDate || new Date().toISOString().split('T')[0]}
                                        onChange={(e) => setGuestFormData({ ...guestFormData, billingStartDate: e.target.value })}
                                        style={styles.input}
                                    />
                                </div>
                            </div>

                            <div className="propertyFormRow" style={styles.formRow}>
                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>ID Proof (Optional)</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                        <input
                                            type="file"
                                            accept="image/*,application/pdf"
                                            onChange={(e) => {
                                                const file = e.target.files[0];
                                                if (file) {
                                                    setGuestFormData({ ...guestFormData, idProof: file });
                                                    setUploadStatus('selected');
                                                    if (file.type.startsWith('image/')) {
                                                        setIdProofPreview(URL.createObjectURL(file));
                                                    } else {
                                                        setIdProofPreview(null);
                                                    }
                                                }
                                            }}
                                            style={{ ...styles.input, padding: '0.5rem', flex: 1, minWidth: '200px' }}
                                        />
                                        {idProofPreview && (
                                            <div style={{
                                                width: '48px', height: '48px', borderRadius: '8px',
                                                overflow: 'hidden', border: '2px solid #6366f1',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: '#1e293b', flexShrink: 0
                                            }} title="Preview">
                                                <img src={idProofPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </div>
                                        )}
                                        {uploadStatus === 'selected' && !idProofPreview && guestFormData.idProof && (
                                            <div style={{
                                                width: '48px', height: '48px', borderRadius: '8px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', fontSize: '1.5rem',
                                                border: '1px solid rgba(34, 197, 94, 0.3)'
                                            }} title="PDF Selected">📄</div>
                                        )}
                                    </div>
                                    <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.25rem' }}>Image or PDF (Max 5MB)</p>
                                </div>
                            </div>

                            <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                                <p style={{ color: '#c7d2fe', fontSize: '0.85rem', margin: 0 }}>
                                    ℹ️ Password will be auto-generated and shown after creation.
                                </p>
                            </div>

                            <div className="propertyModalActions" style={styles.modalActions}>
                                <button
                                    type="button"
                                    onClick={() => { setShowAddGuest(false); setGuestFormData({ fullName: '', phone: '' }); }}
                                    style={styles.cancelBtn}
                                    disabled={addingGuest}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={{ ...styles.submitBtn, opacity: addingGuest ? 0.7 : 1 }}
                                    disabled={addingGuest}
                                >
                                    {addingGuest ? 'Creating...' : '✨ Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Guest Details Modal */}
            {viewingGuest && createPortal(
                <div style={styles.modal} onClick={() => { setViewingGuest(null); setIsEditingGuest(false); }}>
                    <div style={styles.modalContent} onClick={e => e.stopPropagation()}>

                        {isEditingGuest ? (
                            // EDIT MODE
                            <form onSubmit={handleUpdateGuest} style={styles.form}>
                                <h3 style={styles.modalTitle}>✏️ Edit Guest Details</h3>

                                <div style={styles.formRow}>
                                    <div style={styles.inputGroup}>
                                        <label style={styles.inputLabel}>Full Name</label>
                                        <input
                                            type="text"
                                            style={styles.input}
                                            value={editFormData.fullName || ''}
                                            onChange={e => setEditFormData({ ...editFormData, fullName: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div style={styles.inputGroup}>
                                        <label style={styles.inputLabel}>Phone (Login ID)</label>
                                        <input
                                            type="tel"
                                            style={styles.input}
                                            value={editFormData.phone || ''}
                                            onChange={e => setEditFormData({ ...editFormData, phone: e.target.value })}
                                            required
                                            minLength="10"
                                            maxLength="10"
                                        />
                                    </div>
                                </div>

                                <div style={styles.formRow}>
                                    <div style={styles.inputGroup}>
                                        <label style={styles.inputLabel}>Alternative Phone</label>
                                        <input
                                            type="tel"
                                            style={styles.input}
                                            value={editFormData.alternativePhone || ''}
                                            onChange={e => setEditFormData({ ...editFormData, alternativePhone: e.target.value })}
                                            placeholder="Optional"
                                        />
                                    </div>
                                    <div style={styles.inputGroup}>
                                        <label style={styles.inputLabel}>Email</label>
                                        <input
                                            type="email"
                                            style={styles.input}
                                            value={editFormData.email || ''}
                                            onChange={e => setEditFormData({ ...editFormData, email: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>Change Room (Optional)</label>
                                    <select
                                        style={styles.input}
                                        value={editFormData.roomId || viewingGuest.roomId}
                                        onChange={(e) => {
                                            const newRoomId = e.target.value;
                                            const newRoom = rooms.find(r => r.id === newRoomId);
                                            setEditFormData({
                                                ...editFormData,
                                                roomId: newRoomId,
                                                monthlyFee: newRoom ? newRoom.rentPerBed : editFormData.monthlyFee
                                            });
                                        }}
                                    >
                                        <option value={viewingGuest.roomId}>
                                            Current: {viewingGuest.floor} - {viewingGuest.roomName}
                                        </option>
                                        {rooms
                                            .filter(r => r.id !== viewingGuest.roomId && (r.occupiedBeds || 0) < (r.sharingType || 1))
                                            .sort((a, b) => a.floor.localeCompare(b.floor) || a.roomName.localeCompare(b.roomName))
                                            .map(r => (
                                                <option key={r.id} value={r.id}>
                                                    {r.floor} - {r.roomName} ({r.sharingType} Share, ₹{r.rentPerBed})
                                                </option>
                                            ))
                                        }
                                    </select>
                                </div>

                                <div style={styles.formRow}>
                                    <div style={styles.inputGroup}>
                                        <label style={styles.inputLabel}>Father's Name</label>
                                        <input
                                            type="text"
                                            style={styles.input}
                                            value={editFormData.fatherName || ''}
                                            onChange={e => setEditFormData({ ...editFormData, fatherName: e.target.value })}
                                        />
                                    </div>
                                    <div style={styles.inputGroup}>
                                        <label style={styles.inputLabel}>Monthly Fee (₹)</label>
                                        <input
                                            type="number"
                                            style={styles.input}
                                            value={editFormData.monthlyFee || ''}
                                            onChange={e => setEditFormData({ ...editFormData, monthlyFee: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div style={styles.inputGroup}>
                                    <label style={styles.inputLabel}>Address</label>
                                    <textarea
                                        style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
                                        value={editFormData.address || ''}
                                        onChange={e => setEditFormData({ ...editFormData, address: e.target.value })}
                                    />
                                </div>


                                <div style={styles.formRow}>
                                    <div style={styles.inputGroup}>
                                        <label style={styles.inputLabel}>Joining Date</label>
                                        <input
                                            type="date"
                                            style={styles.input}
                                            value={editFormData.joiningDate || ''}
                                            onChange={e => setEditFormData({ ...editFormData, joiningDate: e.target.value })}
                                        />
                                    </div>
                                    <div style={styles.inputGroup}>
                                        <label style={styles.inputLabel}>Billing Start Date</label>
                                        <input
                                            type="date"
                                            style={styles.input}
                                            value={editFormData.billingStartDate || ''}
                                            onChange={e => setEditFormData({ ...editFormData, billingStartDate: e.target.value })}
                                            placeholder="Optional"
                                        />
                                    </div>
                                </div>

                                <div style={styles.modalActions}>
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingGuest(false)}
                                        style={styles.cancelBtn}
                                    >
                                        Cancel
                                    </button>
                                    <button type="submit" style={styles.submitBtn}>
                                        💾 Save Changes
                                    </button>
                                </div>
                            </form>
                        ) : (
                            // VIEW MODE
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                    <h3 style={{ ...styles.modalTitle, marginBottom: 0 }}>
                                        👤 Guest Details
                                    </h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <button
                                            onClick={() => {
                                                setIsEditingGuest(true);
                                                let joinDateStr = '';
                                                if (viewingGuest.createdAt?.toDate) {
                                                    joinDateStr = viewingGuest.createdAt.toDate().toISOString().split('T')[0];
                                                } else if (viewingGuest.createdAt && !viewingGuest.createdAt.toDate) {
                                                    // Handle if it's already a date object or string (legacy)
                                                    try {
                                                        joinDateStr = new Date(viewingGuest.createdAt).toISOString().split('T')[0];
                                                    } catch (e) { }
                                                }

                                                setEditFormData({
                                                    fullName: viewingGuest.fullName,
                                                    phone: viewingGuest.phone,
                                                    email: viewingGuest.email,
                                                    fatherName: viewingGuest.fatherName,
                                                    address: viewingGuest.address,
                                                    monthlyFee: viewingGuest.monthlyFee,
                                                    alternativePhone: viewingGuest.alternativePhone,
                                                    joiningDate: joinDateStr,
                                                    billingStartDate: viewingGuest.billingStartDate ? viewingGuest.billingStartDate.toDate().toISOString().split('T')[0] : joinDateStr,
                                                    roomId: viewingGuest.roomId
                                                });
                                            }}
                                            style={{
                                                background: 'rgba(99, 102, 241, 0.1)',
                                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                                color: '#818cf8', borderRadius: '8px', padding: '0.4rem 0.8rem',
                                                cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600'
                                            }}
                                        >
                                            ✏️ Edit
                                        </button>
                                        <button
                                            onClick={() => setViewingGuest(null)}
                                            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>

                                <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={styles.inputLabel}>Full Name</label>
                                        <div style={{ color: 'white', fontSize: '1.1rem', fontWeight: '600' }}>
                                            {viewingGuest.fullName}
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={styles.inputLabel}>Phone (Login ID)</label>
                                            <div style={{ color: '#c7d2fe', fontFamily: 'monospace', fontSize: '1rem' }}>
                                                {viewingGuest.phone}
                                            </div>
                                            {viewingGuest.alternativePhone && (
                                                <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                                    Alt: {viewingGuest.alternativePhone}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label style={styles.inputLabel}>Status</label>
                                            <div style={{
                                                color: viewingGuest.accountStatus === 'active' ? '#22c55e' : '#fbbf24',
                                                textTransform: 'capitalize', fontWeight: '600'
                                            }}>
                                                {viewingGuest.accountStatus}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {viewingGuest.generatedPassword && (
                                    <div style={{
                                        background: 'rgba(99, 102, 241, 0.15)',
                                        border: '1px solid rgba(99, 102, 241, 0.3)',
                                        borderRadius: '12px',
                                        padding: '1.25rem',
                                        marginBottom: '1.5rem'
                                    }}>
                                        <label style={{ ...styles.inputLabel, color: '#818cf8', marginBottom: '0.5rem', display: 'block' }}>
                                            🔑 Generated Credentials
                                        </label>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Login ID:</span>
                                            <span style={{ color: 'white', fontFamily: 'monospace' }}>{viewingGuest.phone}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Password:</span>
                                            <span style={{ color: 'white', fontFamily: 'monospace', fontWeight: '700' }}>
                                                {viewingGuest.generatedPassword}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '12px', padding: '1.25rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={styles.inputLabel}>📅 Joining Date</label>
                                            <div style={{ color: 'white', fontSize: '0.95rem' }}>
                                                {viewingGuest.createdAt?.toDate
                                                    ? viewingGuest.createdAt.toDate().toLocaleDateString('en-IN', {
                                                        day: 'numeric', month: 'short', year: 'numeric'
                                                    })
                                                    : 'N/A'}
                                            </div>
                                        </div>
                                        <div>
                                            <label style={styles.inputLabel}>📅 Billing Start</label>
                                            <div style={{ color: '#c7d2fe', fontSize: '0.9rem' }}>
                                                {viewingGuest.billingStartDate?.toDate
                                                    ? viewingGuest.billingStartDate.toDate().toLocaleDateString('en-IN', {
                                                        day: 'numeric', month: 'short', year: 'numeric'
                                                    })
                                                    : (viewingGuest.createdAt?.toDate ? viewingGuest.createdAt.toDate().toLocaleDateString('en-IN', {
                                                        day: 'numeric', month: 'short', year: 'numeric'
                                                    }) : 'N/A')}
                                            </div>
                                        </div>
                                        <div>
                                            <label style={styles.inputLabel}>💰 Monthly Fee</label>
                                            <div style={{ color: '#22c55e', fontSize: '0.95rem', fontWeight: '600' }}>
                                                ₹{(viewingGuest.monthlyFee || 0).toLocaleString()}
                                            </div>
                                        </div>
                                        <div>
                                            <label style={styles.inputLabel}>⚠️ Pending Amount</label>
                                            <div style={{
                                                color: (() => {
                                                    const { status } = calculateGuestStatus(viewingGuest, guestPayments);
                                                    return status === 'overdue' ? '#ef4444' : status === 'due-soon' ? '#fbbf24' : '#22c55e';
                                                })(),
                                                fontSize: '0.95rem',
                                                fontWeight: '600'
                                            }}>
                                                ₹{calculateGuestStatus(viewingGuest, guestPayments).pendingAmount.toLocaleString()}
                                            </div>
                                        </div>
                                        <div>
                                            <label style={styles.inputLabel}>📆 Next Payment Due</label>
                                            <div style={{
                                                color: (() => {
                                                    const { status } = calculateGuestStatus(viewingGuest, guestPayments);
                                                    return status === 'overdue' ? '#ef4444' : status === 'due-soon' ? '#fbbf24' : '#22c55e';
                                                })(),
                                                fontSize: '0.95rem',
                                                fontWeight: '600'
                                            }}>
                                                {(() => {
                                                    const { nextDueDate } = calculateGuestStatus(viewingGuest, guestPayments);
                                                    return nextDueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                                                })()}
                                            </div>
                                        </div>
                                        <div>
                                            <label style={styles.inputLabel}>🏠 Room</label>
                                            <div style={{ color: 'white', fontSize: '0.95rem' }}>
                                                {viewingGuest.roomName || 'N/A'} • {viewingGuest.floor || ''}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                        <label style={styles.inputLabel}>📧 Email</label>
                                        <div style={{ color: '#94a3b8', fontSize: '0.9rem', wordBreak: 'break-all' }}>
                                            {viewingGuest.email}
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '0.75rem' }}>
                                        <label style={styles.inputLabel}>📍 Address</label>
                                        <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                                            {viewingGuest.address || 'Not provided'}
                                        </div>
                                    </div>

                                    {(viewingGuest.idProofUrl || viewingGuest.idProofBase64) && (
                                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                            <label style={styles.inputLabel}>📄 ID Proof</label>
                                            <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                                                <div
                                                    style={{
                                                        width: '120px', height: '80px', borderRadius: '8px',
                                                        overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)',
                                                        background: '#1e293b', cursor: 'pointer', position: 'relative'
                                                    }}
                                                    onClick={() => {
                                                        setViewingImage(viewingGuest.idProofUrl || viewingGuest.idProofBase64);
                                                    }}
                                                >
                                                    {(() => {
                                                        const url = viewingGuest.idProofUrl || viewingGuest.idProofBase64;
                                                        const isPdf = url && (url.includes('application/pdf') || url.endsWith('.pdf'));
                                                        if (isPdf) {
                                                            return (
                                                                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#334155', color: '#e2e8f0' }}>
                                                                    <span style={{ fontSize: '2rem' }}>📄</span>
                                                                    <span style={{ fontSize: '0.6rem' }}>PDF</span>
                                                                </div>
                                                            );
                                                        }
                                                        return (
                                                            <img
                                                                src={url}
                                                                alt="ID Proof"
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            />
                                                        );
                                                    })()}
                                                </div>

                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setViewingImage(viewingGuest.idProofUrl || viewingGuest.idProofBase64);
                                                        }}
                                                        style={{
                                                            background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)',
                                                            borderRadius: '6px', color: '#818cf8', padding: '0.35rem 0.75rem',
                                                            fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem'
                                                        }}
                                                    >
                                                        👁️ View Full
                                                    </button>
                                                    <a
                                                        href={viewingGuest.idProofUrl || viewingGuest.idProofBase64}
                                                        download={`ID_Proof_${(viewingGuest.fullName || 'Guest').replace(/\s+/g, '_')}`}
                                                        style={{ textDecoration: 'none' }}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        <button
                                                            style={{
                                                                background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)',
                                                                borderRadius: '6px', color: '#4ade80', padding: '0.35rem 0.75rem',
                                                                fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%'
                                                            }}
                                                        >
                                                            ⬇️ Download
                                                        </button>
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Payment History Section */}
                                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <label style={styles.inputLabel}>💳 Payment History</label>
                                        <button
                                            onClick={() => setShowAddPayment(!showAddPayment)}
                                            style={{
                                                background: showAddPayment ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                                                border: showAddPayment ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(34, 197, 94, 0.3)',
                                                color: showAddPayment ? '#ef4444' : '#4ade80',
                                                borderRadius: '6px',
                                                padding: '0.35rem 0.75rem',
                                                fontSize: '0.85rem',
                                                cursor: 'pointer',
                                                fontWeight: '600'
                                            }}
                                        >
                                            {showAddPayment ? '✕ Cancel' : '+ Add Payment'}
                                        </button>
                                    </div>

                                    {/* Add Payment Form */}
                                    {showAddPayment && (
                                        <form
                                            onSubmit={handleAddPayment}
                                            style={{
                                                background: 'rgba(99, 102, 241, 0.1)',
                                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                                borderRadius: '8px',
                                                padding: '1rem',
                                                marginBottom: '1rem'
                                            }}
                                        >
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                                <div>
                                                    <label style={{ ...styles.inputLabel, fontSize: '0.85rem' }}>Amount (₹)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={paymentForm.amount}
                                                        onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                                        style={{
                                                            ...styles.input,
                                                            padding: '0.5rem',
                                                            fontSize: '0.9rem'
                                                        }}
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ ...styles.inputLabel, fontSize: '0.85rem' }}>Date</label>
                                                    <input
                                                        type="date"
                                                        value={paymentForm.date}
                                                        onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })}
                                                        style={{
                                                            ...styles.input,
                                                            padding: '0.5rem',
                                                            fontSize: '0.9rem'
                                                        }}
                                                        required
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                                <div>
                                                    <label style={{ ...styles.inputLabel, fontSize: '0.85rem' }}>Time (Optional)</label>
                                                    <input
                                                        type="time"
                                                        value={paymentForm.time}
                                                        onChange={e => setPaymentForm({ ...paymentForm, time: e.target.value })}
                                                        style={{
                                                            ...styles.input,
                                                            padding: '0.5rem',
                                                            fontSize: '0.9rem'
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ ...styles.inputLabel, fontSize: '0.85rem' }}>Period</label>
                                                    <select
                                                        value={paymentForm.timePeriod}
                                                        onChange={e => setPaymentForm({ ...paymentForm, timePeriod: e.target.value })}
                                                        style={{
                                                            ...styles.input,
                                                            padding: '0.5rem',
                                                            fontSize: '0.9rem'
                                                        }}
                                                    >
                                                        <option value="AM">AM</option>
                                                        <option value="PM">PM</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div style={{ marginBottom: '0.75rem' }}>
                                                <label style={{ ...styles.inputLabel, fontSize: '0.85rem' }}>Note (Optional)</label>
                                                <textarea
                                                    value={paymentForm.note}
                                                    onChange={e => setPaymentForm({ ...paymentForm, note: e.target.value })}
                                                    style={{
                                                        ...styles.input,
                                                        padding: '0.5rem',
                                                        fontSize: '0.9rem',
                                                        resize: 'vertical',
                                                        minHeight: '60px'
                                                    }}
                                                    placeholder="Add any notes about this payment..."
                                                />
                                            </div>

                                            <button
                                                type="submit"
                                                disabled={addingPayment}
                                                style={{
                                                    ...styles.submitBtn,
                                                    width: '100%',
                                                    padding: '0.5rem',
                                                    fontSize: '0.9rem',
                                                    opacity: addingPayment ? 0.6 : 1,
                                                    cursor: addingPayment ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                {addingPayment ? 'Adding...' : '💾 Save Payment'}
                                            </button>
                                        </form>
                                    )}

                                    {/* Payment List */}
                                    <div style={{
                                        maxHeight: '250px',
                                        overflowY: 'auto',
                                        background: 'rgba(30, 41, 59, 0.3)',
                                        borderRadius: '8px',
                                        padding: guestPayments.length > 0 ? '0.5rem' : '1rem'
                                    }}>
                                        {guestPayments.length === 0 ? (
                                            <div style={{
                                                textAlign: 'center',
                                                color: '#94a3b8',
                                                fontSize: '0.9rem',
                                                padding: '1rem'
                                            }}>
                                                No payment history found
                                            </div>
                                        ) : (
                                            guestPayments.map(payment => (
                                                <div
                                                    key={payment.id}
                                                    style={{
                                                        background: payment.status === 'approved'
                                                            ? 'rgba(34, 197, 94, 0.1)'
                                                            : payment.status === 'rejected'
                                                                ? 'rgba(239, 68, 68, 0.1)'
                                                                : 'rgba(251, 191, 36, 0.1)',
                                                        border: payment.status === 'approved'
                                                            ? '1px solid rgba(34, 197, 94, 0.3)'
                                                            : payment.status === 'rejected'
                                                                ? '1px solid rgba(239, 68, 68, 0.3)'
                                                                : '1px solid rgba(251, 191, 36, 0.3)',
                                                        borderRadius: '6px',
                                                        padding: '0.75rem',
                                                        marginBottom: '0.5rem'
                                                    }}
                                                >
                                                    {editingPayment?.id === payment.id ? (
                                                        <form onSubmit={handleUpdatePayment} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                                <div>
                                                                    <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Amount</label>
                                                                    <input type="number" value={editingPayment.amount} onChange={e => setEditingPayment({ ...editingPayment, amount: e.target.value })} style={{ ...styles.input, padding: '0.25rem', fontSize: '0.9rem' }} required />
                                                                </div>
                                                                <div>
                                                                    <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Date</label>
                                                                    <input type="date" value={editingPayment.date} onChange={e => setEditingPayment({ ...editingPayment, date: e.target.value })} style={{ ...styles.input, padding: '0.25rem', fontSize: '0.9rem' }} required />
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Note</label>
                                                                <input type="text" value={editingPayment.note} onChange={e => setEditingPayment({ ...editingPayment, note: e.target.value })} style={{ ...styles.input, padding: '0.25rem', fontSize: '0.9rem' }} />
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                                                <button type="button" onClick={() => setEditingPayment(null)} style={{ ...styles.cancelBtn, padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>Cancel</button>
                                                                <button type="submit" style={{ ...styles.submitBtn, padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>Save</button>
                                                            </div>
                                                        </form>
                                                    ) : (
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{
                                                                    color: 'white',
                                                                    fontSize: '1.1rem',
                                                                    fontWeight: '700',
                                                                    marginBottom: '0.25rem'
                                                                }}>
                                                                    ₹{payment.amount?.toLocaleString() || '0'}
                                                                </div>
                                                                <div style={{
                                                                    color: '#94a3b8',
                                                                    fontSize: '0.8rem',
                                                                    marginBottom: '0.25rem'
                                                                }}>
                                                                    📅 {payment.paymentDate || 'N/A'}
                                                                    {payment.paymentTime && ` • ${payment.paymentTime}`}
                                                                </div>
                                                                {payment.note && (
                                                                    <div style={{
                                                                        color: '#cbd5e1',
                                                                        fontSize: '0.85rem',
                                                                        marginTop: '0.5rem',
                                                                        fontStyle: 'italic'
                                                                    }}>
                                                                        "{payment.note}"
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                                                                <div style={{
                                                                    background: payment.status === 'approved'
                                                                        ? 'rgba(34, 197, 94, 0.2)'
                                                                        : payment.status === 'rejected'
                                                                            ? 'rgba(239, 68, 68, 0.2)'
                                                                            : 'rgba(251, 191, 36, 0.2)',
                                                                    color: payment.status === 'approved'
                                                                        ? '#22c55e'
                                                                        : payment.status === 'rejected'
                                                                            ? '#ef4444'
                                                                            : '#fbbf24',
                                                                    padding: '0.25rem 0.5rem',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: '600',
                                                                    textTransform: 'capitalize'
                                                                }}>
                                                                    {payment.status}
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                                    <button
                                                                        onClick={() => setEditingPayment({
                                                                            id: payment.id,
                                                                            amount: payment.amount,
                                                                            date: payment.paymentDate,
                                                                            time: payment.paymentTime,
                                                                            note: payment.note || '',
                                                                            status: payment.status
                                                                        })}
                                                                        style={{
                                                                            background: 'none',
                                                                            border: 'none',
                                                                            cursor: 'pointer',
                                                                            fontSize: '1rem',
                                                                            opacity: 0.7
                                                                        }}
                                                                        title="Edit"
                                                                    >
                                                                        ✏️
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeletePayment(payment.id)}
                                                                        style={{
                                                                            background: 'none',
                                                                            border: 'none',
                                                                            cursor: 'pointer',
                                                                            fontSize: '1rem',
                                                                            opacity: 0.7
                                                                        }}
                                                                        title="Delete"
                                                                    >
                                                                        🗑️
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div style={styles.modalActions}>
                                    <button
                                        onClick={handleDeleteGuest}
                                        style={{ ...styles.cancelBtn, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                                    >
                                        🗑️ Remove Guest
                                    </button>
                                    <button
                                        onClick={() => setViewingGuest(null)}
                                        style={styles.submitBtn}
                                    >
                                        Close
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* Image/PDF Lightbox */}
            {viewingImage && createPortal(
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.95)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem'
                    }}
                    onClick={() => setViewingImage(null)}
                >
                    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <button
                            onClick={() => setViewingImage(null)}
                            style={{
                                position: 'absolute', top: '20px', right: '20px',
                                background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none',
                                borderRadius: '50%', width: '40px', height: '40px', fontSize: '1.5rem', cursor: 'pointer', zIndex: 10
                            }}
                        >
                            ×
                        </button>

                        {(viewingImage.startsWith('data:application/pdf') || viewingImage.endsWith('.pdf')) ? (
                            <iframe
                                src={viewingImage}
                                style={{
                                    width: '90%', height: '90vh', border: 'none', borderRadius: '8px', background: 'white'
                                }}
                                title="ID Proof PDF"
                            />
                        ) : (
                            <img
                                src={viewingImage}
                                alt="ID Proof Full"
                                style={{
                                    maxWidth: '90%', maxHeight: '90vh', objectFit: 'contain',
                                    borderRadius: '8px', boxShadow: '0 0 20px rgba(0,0,0,0.5)'
                                }}
                                onClick={e => e.stopPropagation()}
                            />
                        )}
                    </div>
                </div>,
                document.body
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @media (max-width: 600px) {
                    .propertyFormRow { grid-template-columns: 1fr !important; }
                    .propertyModalActions { flex-direction: column !important; }
                }
            `}</style>
        </div>
    );
}

const styles = {
    container: {},
    loadingContainer: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem',
    },
    spinner: {
        width: '50px', height: '50px', border: '4px solid rgba(129, 140, 248, 0.2)',
        borderTop: '4px solid #818cf8', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '1rem',
    },
    loadingText: { color: '#94a3b8', fontSize: '0.9rem' },
    statsGrid: {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem',
    },
    statCard: {
        background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '16px', padding: '1.25rem',
        display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid transparent',
    },
    statIcon: { fontSize: '2rem' },
    statLabel: { color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', margin: 0 },
    statValue: { fontSize: '1.5rem', fontWeight: '700', margin: '0.25rem 0 0' },
    controls: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
        gap: '1rem', marginBottom: '1.5rem',
    },
    floorFilter: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
    filterLabel: { color: '#94a3b8', fontSize: '0.9rem' },
    selectInput: {
        background: 'rgba(15, 23, 42, 0.6)', border: '2px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '10px', padding: '0.625rem 1rem', color: 'white', fontSize: '0.9rem', cursor: 'pointer',
    },
    addBtn: {
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: 'none',
        borderRadius: '12px', padding: '0.75rem 1.5rem', color: 'white',
        fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
    },
    modal: {
        position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '0.75rem',
        paddingTop: '4rem', overflow: 'hidden', backdropFilter: 'blur(5px)',
    },
    modalContent: {
        background: 'rgba(15, 23, 42, 0.98)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '20px',
        padding: '1.25rem', maxWidth: '500px', width: '100%',
        maxHeight: 'calc(100vh - 4rem)', overflowY: 'auto',
    },
    modalTitle: { color: 'white', fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem' },
    form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
    formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
    inputGroup: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
    inputLabel: { color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' },
    input: {
        background: 'rgba(15, 23, 42, 0.6)', border: '2px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '10px', padding: '0.75rem 1rem', color: 'white', fontSize: '0.95rem',
    },
    modalActions: { display: 'flex', gap: '0.75rem', marginTop: '0.5rem' },
    cancelBtn: {
        flex: 1, background: 'rgba(100, 116, 139, 0.2)', border: '1px solid rgba(100, 116, 139, 0.3)',
        borderRadius: '10px', padding: '0.75rem', color: '#94a3b8', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer',
    },
    submitBtn: {
        flex: 1, background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: 'none',
        borderRadius: '10px', padding: '0.75rem', color: 'white', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer',
    },
    emptyState: {
        textAlign: 'center', padding: '4rem 2rem', background: 'rgba(30, 41, 59, 0.6)',
        border: '2px dashed rgba(99, 102, 241, 0.2)', borderRadius: '20px', color: '#64748b',
    },
    emptyIcon: { fontSize: '4rem', display: 'block', marginBottom: '1rem', opacity: 0.4 },
    floorSection: { marginBottom: '2rem' },
    floorHeader: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
        marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
    },
    floorTitle: { color: 'white', fontSize: '1.1rem', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' },
    floorIcon: { fontSize: '1.25rem' },
    floorStats: { color: '#94a3b8', fontSize: '0.85rem' },
    roomsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' },
    roomCard: {
        background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '16px', padding: '1.25rem',
    },
    roomHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
    roomName: { color: 'white', fontSize: '1.1rem', fontWeight: '600', margin: 0 },
    roomBadge: {
        padding: '0.25rem 0.75rem', borderRadius: '8px', fontSize: '0.7rem', fontWeight: '600', textTransform: 'uppercase',
    },
    bedsRow: { display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '1rem' },
    bedIcon: { fontSize: '1.5rem' },
    roomMeta: { color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' },
    metaLabel: { color: '#64748b' },
    roomActions: { display: 'flex', gap: '0.5rem' },
    editBtn: {
        flex: 1, background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '8px', padding: '0.5rem', color: '#818cf8', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer',
    },
    deleteBtn: {
        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#ef4444', cursor: 'pointer',
    },
    viewGuestsBtn: {
        background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)',
        borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#22c55e', cursor: 'pointer',
        fontSize: '1rem'
    },
    addGuestBtn: {
        background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#818cf8', cursor: 'pointer',
        fontSize: '0.85rem', fontWeight: '600', flex: 1,
    },
};

