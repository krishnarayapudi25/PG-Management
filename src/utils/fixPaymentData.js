/**
 * Data Cleanup Script for Payment Records
 *
 * This script fixes payment records that have incorrect userId values
 * by matching them with user phone numbers extracted from payment data.
 *
 * Run this in the browser console while logged in as admin to fix corrupt data.
 *
 * USAGE:
 * 1. Open the admin dashboard
 * 2. Open browser console (F12)
 * 3. Copy and paste this entire file into the console
 * 4. Run: await fixPaymentData()
 */

import { db } from '../services/firebase';
import { collection, getDocs, doc, updateDoc, query } from 'firebase/firestore';

export async function fixPaymentData() {
    console.log('🔧 Starting Payment Data Cleanup...\n');

    try {
        // Step 1: Load all users
        console.log('📊 Loading users...');
        const usersQuery = query(collection(db, 'users'));
        const usersSnap = await getDocs(usersQuery);
        const users = usersSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Create phone-to-user mapping
        const phoneMap = new Map();
        users.forEach(user => {
            if (user.phone) {
                phoneMap.set(user.phone, user);
            }
        });

        console.log(`✅ Loaded ${users.length} users`);
        console.log(`📞 Phone map size: ${phoneMap.size}`);

        // Step 2: Load all payments
        console.log('\n💳 Loading payments...');
        const paymentsQuery = query(collection(db, 'payments'));
        const paymentsSnap = await getDocs(paymentsQuery);
        const payments = paymentsSnap.docs.map(doc => ({
            docId: doc.id,
            ...doc.data()
        }));

        console.log(`✅ Loaded ${payments.length} payments`);

        // Step 3: Analyze and fix payments
        console.log('\n🔍 Analyzing payments...\n');

        let fixedCount = 0;
        let alreadyCorrectCount = 0;
        let cannotFixCount = 0;
        const cannotFixPayments = [];

        for (const payment of payments) {
            const matchedUser = users.find(u => u.id === payment.userId);

            if (matchedUser) {
                // Payment userId matches a user document ID - correct!
                alreadyCorrectCount++;

                // Add phone number if missing (for future resilience)
                if (!payment.userPhone && matchedUser.phone) {
                    console.log(`📝 Adding phone to payment ${payment.docId}: ${matchedUser.phone}`);
                    await updateDoc(doc(db, 'payments', payment.docId), {
                        userPhone: matchedUser.phone
                    });
                    fixedCount++;
                }
            } else {
                // Payment userId doesn't match any user - needs fixing
                console.log(`❌ Orphaned payment: ${payment.docId}`);
                console.log(`   Current userId: ${payment.userId}`);
                console.log(`   User: ${payment.userName || 'Unknown'}`);
                console.log(`   Phone in payment: ${payment.userPhone || 'Not set'}`);

                let fixedUserId = null;
                let fixMethod = null;

                // Try to fix using phone number in payment
                if (payment.userPhone) {
                    const userByPhone = phoneMap.get(payment.userPhone);
                    if (userByPhone) {
                        fixedUserId = userByPhone.id;
                        fixMethod = 'matched by userPhone';
                    }
                }

                // Try to extract phone from email (e.g., 1234567890@hotel.com)
                if (!fixedUserId && payment.userEmail && payment.userEmail.includes('@hotel.com')) {
                    const phoneFromEmail = payment.userEmail.split('@')[0];
                    const userByEmailPhone = phoneMap.get(phoneFromEmail);
                    if (userByEmailPhone) {
                        fixedUserId = userByEmailPhone.id;
                        fixMethod = 'extracted phone from email';
                    }
                }

                // Try to match by userName
                if (!fixedUserId && payment.userName) {
                    const userByName = users.find(u =>
                        u.fullName && u.fullName.toLowerCase() === payment.userName.toLowerCase()
                    );
                    if (userByName) {
                        fixedUserId = userByName.id;
                        fixMethod = 'matched by userName';
                    }
                }

                if (fixedUserId) {
                    console.log(`✅ FIX FOUND: ${fixMethod}`);
                    console.log(`   New userId: ${fixedUserId}`);

                    const userToUpdate = users.find(u => u.id === fixedUserId);
                    await updateDoc(doc(db, 'payments', payment.docId), {
                        userId: fixedUserId,
                        userPhone: userToUpdate.phone || payment.userPhone || ''
                    });

                    fixedCount++;
                } else {
                    console.log(`⚠️  CANNOT FIX - No matching user found`);
                    cannotFixCount++;
                    cannotFixPayments.push(payment);
                }

                console.log('');
            }
        }

        // Step 4: Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 CLEANUP SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total payments processed: ${payments.length}`);
        console.log(`✅ Already correct: ${alreadyCorrectCount}`);
        console.log(`🔧 Fixed: ${fixedCount}`);
        console.log(`⚠️  Cannot fix: ${cannotFixCount}`);
        console.log('='.repeat(60));

        if (cannotFixPayments.length > 0) {
            console.log('\n⚠️  Payments that could not be fixed:');
            console.table(cannotFixPayments.map(p => ({
                id: p.docId,
                userId: p.userId,
                userName: p.userName,
                userPhone: p.userPhone || 'N/A',
                amount: p.amount,
                status: p.status,
                date: p.paymentDate
            })));

            console.log('\n💡 Manual action required for these payments:');
            console.log('   Option 1: Delete them if they\'re test data');
            console.log('   Option 2: Manually update userId in Firestore Console');
        }

        console.log('\n✅ Cleanup complete! Refresh the page to see changes.');

        return {
            total: payments.length,
            alreadyCorrect: alreadyCorrectCount,
            fixed: fixedCount,
            cannotFix: cannotFixCount,
            cannotFixPayments
        };

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        throw error;
    }
}

// Auto-run instructions
console.log('\n' + '='.repeat(60));
console.log('💡 To run the payment data cleanup:');
console.log('   await fixPaymentData()');
console.log('='.repeat(60) + '\n');
