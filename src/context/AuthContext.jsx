import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../services/firebase";

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [userDetails, setUserDetails] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        console.log("AuthProvider: Starting auth listener...");

        // Safety timeout to prevent infinite loading
        const safetyTimeout = setTimeout(() => {
            console.warn("AuthProvider: Auth check timed out, forcing loading to false");
            setLoading((currentLoading) => {
                if (currentLoading) return false;
                return currentLoading;
            });
        }, 8000);

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            console.log("AuthProvider: Auth state changed:", currentUser ? currentUser.email : "No user");

            try {
                setUser(currentUser);

                if (currentUser) {
                    try {
                        // CRITICAL FIX: Try multiple strategies to find the user document
                        // Strategy 1: Direct lookup by Auth UID (works for new users)
                        let docRef = doc(db, "users", currentUser.uid);
                        let docSnap = await getDoc(docRef);
                        let firestoreDocId = currentUser.uid;

                        // Strategy 2: If not found, search by email (handles re-added users)
                        if (!docSnap.exists() && currentUser.email) {
                            console.log("AuthProvider: Doc not found by UID, searching by email...");
                            const emailQuery = query(
                                collection(db, "users"),
                                where("email", "==", currentUser.email)
                            );
                            const emailSnap = await getDocs(emailQuery);

                            if (!emailSnap.empty) {
                                const userDoc = emailSnap.docs[0];
                                docSnap = userDoc;
                                firestoreDocId = userDoc.id;
                                console.log("AuthProvider: User found by email, doc ID:", firestoreDocId);
                            }
                        }

                        // Strategy 3: If not found, extract phone from email (phone@hotel.com format)
                        if (!docSnap.exists() && currentUser.email && currentUser.email.includes('@hotel.com')) {
                            const phone = currentUser.email.split('@')[0];
                            console.log("AuthProvider: Searching by phone extracted from email:", phone);

                            const phoneQuery = query(
                                collection(db, "users"),
                                where("phone", "==", phone)
                            );
                            const phoneSnap = await getDocs(phoneQuery);

                            if (!phoneSnap.empty) {
                                const userDoc = phoneSnap.docs[0];
                                docSnap = userDoc;
                                firestoreDocId = userDoc.id;
                                console.log("AuthProvider: User found by phone, doc ID:", firestoreDocId);
                            }
                        }

                        if (docSnap.exists()) {
                            console.log("AuthProvider: User details loaded");
                            // Store both the user data AND the Firestore document ID
                            setUserDetails({
                                ...docSnap.data(),
                                firestoreDocId: firestoreDocId // CRITICAL: Store doc ID for payment matching
                            });
                        } else {
                            console.log("AuthProvider: No user doc found");
                            setUserDetails(null);
                        }
                    } catch (error) {
                        console.error("AuthProvider: Error fetching user details:", error);
                    }
                } else {
                    setUserDetails(null);
                }
            } catch (err) {
                console.error("AuthProvider: Critical error in auth listener:", err);
            } finally {
                // Ensure loading is set to false
                console.log("AuthProvider: Setting loading to false");
                setLoading(false);
                clearTimeout(safetyTimeout);
            }
        });

        return () => {
            console.log("AuthProvider: Cleaning up auth listener");
            clearTimeout(safetyTimeout);
            unsubscribe();
        };
    }, []);

    const value = {
        user,
        userDetails,
        loading,
        isAdmin: userDetails?.role === 'admin',
        isApproved: userDetails?.accountStatus === 'active'
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
