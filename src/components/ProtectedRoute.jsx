import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requiredRole }) {
    const { user, userDetails, loading } = useAuth();

    // Show loading spinner while checking auth
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading...</p>
                </div>
            </div>
        );
    }

    // Not logged in - redirect to login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // User is authenticated but doesn't have a Firestore document
    // This happens if user was created outside the signup flow
    if (!userDetails) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-amber-900/20 to-slate-900">
                <div className="text-center p-8 bg-slate-800/50 border border-amber-500/30 rounded-2xl max-w-md">
                    <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Profile Not Found</h2>
                    <p className="text-gray-400 mb-4">Your account exists but your profile wasn't set up properly. Please sign up again or contact the administrator.</p>
                    <p className="text-gray-500 text-sm mb-4">Logged in as: {user.email}</p>
                    <button
                        onClick={() => {
                            import('../services/firebase').then(({ auth }) => {
                                auth.signOut().then(() => {
                                    window.location.href = '/signup';
                                });
                            });
                        }}
                        className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
                    >
                        Sign Up Properly
                    </button>
                </div>
            </div>
        );
    }

    // Check Approval Status
    if (userDetails.accountStatus === 'pending') {
        return <Navigate to="/pending" replace />;
    }

    if (userDetails.accountStatus === 'rejected') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-red-900/20 to-slate-900">
                <div className="text-center p-8 bg-slate-800/50 border border-red-500/30 rounded-2xl max-w-md">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Account Rejected</h2>
                    <p className="text-gray-400 mb-4">Your account registration has been rejected. Please contact the administrator for more information.</p>
                    <button
                        onClick={() => window.location.href = '/login'}
                        className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                    >
                        Back to Login
                    </button>
                </div>
            </div>
        );
    }

    // Check Role Access
    if (requiredRole && userDetails.role !== requiredRole) {
        if (userDetails.role === 'admin') return <Navigate to="/admin" replace />;
        return <Navigate to="/guest" replace />;
    }

    return children;
}
