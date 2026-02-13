# 🤖 LLM Development Guide - Hotel Management System

This guide is specifically designed for AI/LLM assistants to understand and extend this codebase efficiently.

## Quick Context

**What is this?** A hotel guest management system with:
- Guest registration with admin approval
- Payment request tracking
- Admin dashboard for management

**Tech Stack:** React 18 + Vite + Firebase (Auth, Firestore, Storage, Hosting)

**Design:** Premium glassmorphism UI with dark theme and animated backgrounds

---

## 🧠 Critical Knowledge for LLMs

### 1. File Locations

| Need to... | File |
|------------|------|
| Add a route | `src/App.jsx` |
| Change auth logic | `src/context/AuthContext.jsx` |
| Configure Firebase | `src/services/firebase.js` |
| Modify guest view | `src/pages/GuestPortal.jsx` |
| Modify admin view | `src/pages/AdminDashboard.jsx` |
| Protect a route | `src/components/ProtectedRoute.jsx` |

### 2. Firebase Instances

```javascript
// Import like this:
import { db, auth, storage } from '../services/firebase';

// db = Firestore database instance
// auth = Firebase Auth instance  
// storage = Firebase Storage instance
```

### 3. Current User Access

```javascript
import { useAuth } from '../context/AuthContext';

function MyComponent() {
  const { user, userDetails, loading } = useAuth();
  
  // user.uid => Firebase Auth UID
  // user.email => User email
  // userDetails.role => 'admin' | 'guest'
  // userDetails.accountStatus => 'pending' | 'active' | 'rejected'
  // userDetails.pendingDues => Number (amount owed)
}
```

---

## 📊 Database Schema

### Users Collection (`users`)
```typescript
interface User {
  // Document ID = Firebase Auth UID
  email: string;
  fullName: string;
  fatherName: string;
  phone: string;
  address: string;
  role: 'admin' | 'guest';
  accountStatus: 'pending' | 'active' | 'rejected';
  monthlyFee: number;    // Monthly rent amount (set by admin during approval)
  idProofUrl?: string;  // Firebase Storage URL
  roomId?: string;      // Reference to room (for hostel/PG tenants)
  lastPaymentDate?: Timestamp; // Last approved payment date (for 30-day cycle tracking)
  createdAt: Timestamp;
}
```

### Payments Collection (`payments`)
```typescript
interface Payment {
  // Document ID = Auto-generated
  userId: string;      // Reference to user
  userName: string;    // Denormalized for display
  userEmail: string;   // Denormalized for display
  amount: number;
  note?: string;
  paymentDate: string; // "YYYY-MM-DD" format
  paymentTime: string; // "HH:MM AM/PM" format
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp;
}
```

### Rooms Collection (`rooms`)
```typescript
interface Room {
  // Document ID = Auto-generated
  roomName: string;          // e.g., "Room 101", "A-1"
  floor: string;             // e.g., "Ground Floor", "1st Floor"
  sharingType: number;       // 1=Single, 2=Double, 3=Triple, etc. up to 8
  totalBeds: number;         // Same as sharingType (number of beds)
  rentPerBed: number;        // Monthly rent per bed in INR
  createdAt: Timestamp;
}
// Note: occupiedBeds is calculated at runtime by counting users with roomId = room.id
```

---

## 🎨 Styling Patterns

### IMPORTANT: This app uses INLINE STYLES, not CSS files

All styles are defined as JavaScript objects at the bottom of each component:

```javascript
// At the end of component file:
const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
    // ... more styles
  },
  // ... more style objects
};
```

### Required Background Elements (for consistency)

Every page MUST include these animated background orbs:

```jsx
<div style={styles.container}>
  {/* These 3 orbs create the animated background */}
  <div style={styles.bgOrb1}></div>
  <div style={styles.bgOrb2}></div>
  <div style={styles.bgOrb3}></div>
  
  {/* Page content here */}
</div>
```

### Required CSS Keyframes

Include these in a `<style>` tag inside the component:

```jsx
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
`}</style>
```

### Standard Color Values

```javascript
// Use these exact colors for consistency:
const colors = {
  // Backgrounds
  bgPrimary: '#0f172a',
  bgCard: 'rgba(30, 41, 59, 0.6)',
  bgCardHover: 'rgba(30, 41, 59, 0.8)',
  
  // Borders
  borderDefault: 'rgba(99, 102, 241, 0.2)',
  borderFocus: '#818cf8',
  
  // Status Colors
  success: '#22c55e',
  successBg: 'rgba(34, 197, 94, 0.2)',
  warning: '#fbbf24',
  warningBg: 'rgba(251, 191, 36, 0.2)',
  error: '#ef4444',
  errorBg: 'rgba(239, 68, 68, 0.2)',
  info: '#818cf8',
  infoBg: 'rgba(99, 102, 241, 0.2)',
  
  // Text
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  
  // Gradients
  primaryGradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  accentGradient: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
};
```

---

## 🔧 Common Operations

### Creating a New Page

```jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebase';

export default function NewPage() {
  const { user, userDetails } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch data here
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Background */}
      <div style={styles.bgOrb1}></div>
      <div style={styles.bgOrb2}></div>
      <div style={styles.bgOrb3}></div>

      {/* Main Content */}
      <main style={styles.main}>
        <h1>New Page</h1>
      </main>

      {/* Keyframes */}
      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
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
    position: 'fixed', top: '-10%', right: '-5%', width: '500px', height: '500px',
    background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)',
    borderRadius: '50%', animation: 'float 8s ease-in-out infinite', pointerEvents: 'none',
  },
  bgOrb2: {
    position: 'fixed', bottom: '-20%', left: '-10%', width: '600px', height: '600px',
    background: 'radial-gradient(circle, rgba(236, 72, 153, 0.2) 0%, transparent 70%)',
    borderRadius: '50%', animation: 'float 10s ease-in-out infinite reverse', pointerEvents: 'none',
  },
  bgOrb3: {
    position: 'fixed', top: '50%', left: '50%', width: '400px', height: '400px',
    background: 'radial-gradient(circle, rgba(14, 165, 233, 0.15) 0%, transparent 70%)',
    borderRadius: '50%', animation: 'pulse 6s ease-in-out infinite', pointerEvents: 'none',
  },
  main: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem 1rem',
    position: 'relative',
    zIndex: 10,
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f172a',
    color: '#94a3b8',
  },
  spinner: {
    width: '40px', height: '40px',
    border: '3px solid rgba(99, 102, 241, 0.2)',
    borderTop: '3px solid #6366f1',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};
```

### Firestore Operations

```javascript
import { db } from '../services/firebase';
import { 
  collection, doc, 
  getDocs, getDoc, 
  addDoc, updateDoc, deleteDoc,
  query, where, orderBy 
} from 'firebase/firestore';

// GET ALL documents
const snapshot = await getDocs(collection(db, 'payments'));
const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

// GET with query
const q = query(
  collection(db, 'payments'),
  where('userId', '==', userId),
  where('status', '==', 'approved')
);
const filtered = await getDocs(q);

// GET single document
const docSnap = await getDoc(doc(db, 'users', id));
if (docSnap.exists()) {
  const user = { id: docSnap.id, ...docSnap.data() };
}

// CREATE document
const docRef = await addDoc(collection(db, 'payments'), {
  amount: 5000,
  status: 'pending',
  createdAt: new Date(),
});

// UPDATE document
await updateDoc(doc(db, 'users', id), {
  pendingDues: 10000,
});

// DELETE document
await deleteDoc(doc(db, 'payments', id));
```

### File Upload to Storage

```javascript
import { storage } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const handleFileUpload = async (file, userId) => {
  const fileRef = ref(storage, `idProofs/${userId}_${Date.now()}`);
  await uploadBytes(fileRef, file);
  const downloadUrl = await getDownloadURL(fileRef);
  return downloadUrl;
};
```

---

## 📱 Mobile Responsiveness

When adding new features, always include mobile media queries:

```javascript
// In the JSX, add className for CSS targeting:
<div className="myGrid" style={styles.myGrid}>

// In the <style> tag:
<style>{`
  @media (max-width: 600px) {
    .myGrid { grid-template-columns: 1fr !important; }
  }
`}</style>
```

---

## ⚠️ Common Pitfalls

1. **Don't forget to import Firebase services:**
   ```javascript
   import { db, auth, storage } from '../services/firebase';
   ```

2. **Always handle loading states:**
   ```javascript
   if (loading) return <LoadingSpinner />;
   ```

3. **Check userDetails before accessing properties:**
   ```javascript
   const role = userDetails?.role || 'guest';
   ```

4. **Use Timestamp for dates:**
   ```javascript
   import { Timestamp } from 'firebase/firestore';
   createdAt: Timestamp.now()
   ```

5. **Always add z-index to content above orbs:**
   ```javascript
   main: { position: 'relative', zIndex: 10 }
   ```

---

## 🚀 Deployment Commands

```bash
# Development
npm run dev

# Build for production
npm run build

# Deploy to Firebase
firebase deploy --only hosting

# Build and deploy in one command
npm run build && firebase deploy --only hosting
```

---

## 📁 Adding New Collections

When adding a new Firestore collection:

1. Define the TypeScript interface (for documentation)
2. Create CRUD functions
3. Add security rules in Firebase Console
4. Update this LLM guide

Example for a new "notifications" collection:
```javascript
// Interface
interface Notification {
  userId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Timestamp;
}

// CRUD operations
const createNotification = (userId, title, message) => 
  addDoc(collection(db, 'notifications'), { userId, title, message, read: false, createdAt: new Date() });

const getUserNotifications = (userId) =>
  getDocs(query(collection(db, 'notifications'), where('userId', '==', userId)));

const markAsRead = (id) =>
  updateDoc(doc(db, 'notifications', id), { read: true });
```

---

## 🎯 Best Practices for This Codebase

1. **Keep styles inline** - This project uses inline styles, not CSS files
2. **Use glassmorphism** - All cards should have blur backgrounds and subtle borders
3. **Include animated orbs** - For visual consistency across pages
4. **Format currency** - Use `formatCurrency()` for Indian Rupee formatting
5. **Use emojis** - UI uses emojis for icons (👤 📱 💰 etc.)
6. **Mobile-first** - Always test on mobile viewport

---

*Last updated: January 2026*
