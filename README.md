# 🏨 Hotel Management System

A modern, premium hotel guest management system built with React and Firebase.

## 🌐 Live Demo
**Production URL**: https://hotel-management-6b968.web.app

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 18** | Frontend framework |
| **Vite** | Build tool & dev server |
| **Firebase Auth** | User authentication |
| **Cloud Firestore** | NoSQL database |
| **Firebase Storage** | File storage (ID proofs) |
| **Firebase Hosting** | Production deployment |

## 📁 Project Structure

```
hotel-management/
├── src/
│   ├── components/
│   │   └── ProtectedRoute.jsx    # Route guard component
│   ├── context/
│   │   └── AuthContext.jsx       # Global auth state management
│   ├── pages/
│   │   ├── Login.jsx             # Login page
│   │   ├── Signup.jsx            # Multi-step registration
│   │   ├── AdminDashboard.jsx    # Admin management panel
│   │   ├── GuestPortal.jsx       # Guest dashboard
│   │   └── PendingApproval.jsx   # Waiting room for pending users
│   ├── services/
│   │   └── firebase.js           # Firebase configuration
│   ├── App.jsx                   # Main app with routing
│   └── main.jsx                  # Entry point
├── index.html                    # HTML template
├── firebase.json                 # Firebase hosting config
└── package.json                  # Dependencies
```

## 🔐 Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Signup    │────▶│   Pending   │────▶│  Guest Portal   │
│  (Register) │     │  Approval   │     │   (Approved)    │
└─────────────┘     └─────────────┘     └─────────────────┘
                          │
                          ▼ (Admin approves)
                    ┌─────────────┐
                    │    Admin    │
                    │  Dashboard  │
                    └─────────────┘
```

### User Roles
- **`admin`**: Full access to admin dashboard, can approve/reject users, manage payments
- **`guest`**: Access to guest portal, can submit payment requests

### Account Status
- **`pending`**: New registration, awaiting admin approval
- **`active`**: Approved, full access granted
- **`rejected`**: Denied access

## 📊 Firestore Data Models

### `users` Collection
```javascript
{
  id: "firebase-auth-uid",
  email: "user@example.com",
  fullName: "John Doe",
  fatherName: "Father Name",
  phone: "+91 9876543210",
  address: "123 Main St, City",
  role: "guest" | "admin",
  accountStatus: "pending" | "active" | "rejected",
  pendingDues: 5000,           // Amount set by admin (Need to Pay)
  idProofUrl: "https://...",   // Firebase Storage URL
  createdAt: Timestamp
}
```

### `payments` Collection
```javascript
{
  id: "auto-generated",
  userId: "user-id",
  userName: "John Doe",
  userEmail: "user@example.com",
  amount: 5000,
  note: "Room rent for January",
  paymentDate: "2024-01-15",    // Scheduled date
  paymentTime: "10:30 AM",      // Scheduled time
  status: "pending" | "approved" | "rejected",
  createdAt: Timestamp
}
```

## 🎨 Design System

### Color Palette
```css
/* Primary Colors */
--primary-gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
--bg-dark: #0f172a;
--bg-card: rgba(30, 41, 59, 0.6);

/* Status Colors */
--success: #22c55e;    /* Green - Approved */
--warning: #fbbf24;    /* Amber - Pending */
--error: #ef4444;      /* Red - Rejected/Dues */
--info: #818cf8;       /* Purple - Info */

/* Text Colors */
--text-primary: #ffffff;
--text-secondary: #94a3b8;
--text-muted: #64748b;
```

### Glassmorphism Pattern
```javascript
const glassCard = {
  background: 'rgba(30, 41, 59, 0.6)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(99, 102, 241, 0.2)',
  borderRadius: '20px',
  padding: '1.5rem',
};
```

### Animated Background Orbs
```javascript
// Include in every page for consistency
<div style={styles.bgOrb1}></div>
<div style={styles.bgOrb2}></div>
<div style={styles.bgOrb3}></div>
```

## 🔧 Key Components

### AuthContext (`src/context/AuthContext.jsx`)
Provides global authentication state:
```javascript
const { user, userDetails, loading } = useAuth();
// user: Firebase Auth user object
// userDetails: Firestore user document
// loading: Auth state loading
```

### ProtectedRoute (`src/components/ProtectedRoute.jsx`)
Guards routes based on role and status:
```jsx
<ProtectedRoute requiredRole="guest">
  <GuestPortal />
</ProtectedRoute>
```

## 📝 Adding New Features

### 1. Adding a New Page
```jsx
// 1. Create src/pages/NewPage.jsx
export default function NewPage() {
  return (
    <div style={styles.container}>
      {/* Background orbs */}
      <div style={styles.bgOrb1}></div>
      <div style={styles.bgOrb2}></div>
      <div style={styles.bgOrb3}></div>
      
      {/* Content */}
      <main style={styles.main}>
        {/* Your content */}
      </main>
      
      {/* CSS Animations */}
      <style>{`
        @keyframes float { ... }
        @keyframes pulse { ... }
      `}</style>
    </div>
  );
}

// 2. Add route in App.jsx
<Route path="/new-page" element={<NewPage />} />
```

### 2. Adding to Firestore
```javascript
import { db } from '../services/firebase';
import { collection, addDoc, updateDoc, doc, getDocs, query, where } from 'firebase/firestore';

// Create
await addDoc(collection(db, "collectionName"), { data });

// Read
const q = query(collection(db, "users"), where("role", "==", "guest"));
const snapshot = await getDocs(q);

// Update
await updateDoc(doc(db, "users", id), { field: value });
```

### 3. Using Firebase Storage
```javascript
import { storage } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const fileRef = ref(storage, `idProofs/${userId}_${Date.now()}`);
await uploadBytes(fileRef, file);
const url = await getDownloadURL(fileRef);
```

## 🚀 Deployment

### Build & Deploy
```bash
npm run build
firebase deploy --only hosting
```

### Environment
Firebase config is in `src/services/firebase.js`. For production, consider using environment variables:
```javascript
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // ... other config
};
```

## 📱 Mobile Responsiveness

All pages use responsive design with CSS media queries:
```css
@media (max-width: 600px) {
  /* Mobile styles */
  .formRow { grid-template-columns: 1fr !important; }
  .guestModalGrid { grid-template-columns: 1fr !important; }
}
```

## 🧪 Testing Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | testadmin@admin.com | (your password) |
| Guest | usertest@user.com | (your password) |

## 📋 Feature Checklist

- [x] User authentication (Email/Password)
- [x] Multi-step registration with ID proof upload
- [x] Admin approval workflow
- [x] Payment request system with date/time
- [x] Admin dashboard with tabs
- [x] Guest search functionality
- [x] "Need to Pay" (pending dues) management
- [x] Guest detail modal with payment history
- [x] Mobile responsive design
- [x] Premium glassmorphism UI
- [ ] WhatsApp notifications (planned)
- [ ] Email notifications (planned)
- [ ] Payment gateway integration (planned)
- [ ] Multi-language support (planned)

## 🔒 Security Rules (Firestore)

Recommended rules for production:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId || 
                   get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Payments collection
    match /payments/{paymentId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

## 📞 Support

For issues or feature requests, create a GitHub issue or contact the developer.

---

**Built with ❤️ using React + Firebase**
