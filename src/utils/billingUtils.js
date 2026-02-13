export const calculateGuestStatus = (user, payments = []) => {
    if (!user) return { status: 'ok', pendingAmount: 0, daysRemaining: 30, nextDueDate: new Date() };

    // 1. Determine Billing Start Date
    // Fallback to createdAt (Joining Date) if billingStartDate is not set
    // Handle Firestore Timestamp or standard Date objects
    let billingStart;
    if (user.billingStartDate) {
        billingStart = user.billingStartDate.toDate ? user.billingStartDate.toDate() : new Date(user.billingStartDate);
    } else if (user.createdAt) {
        billingStart = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
    } else {
        // Fallback for very old data or errors
        billingStart = new Date();
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    billingStart.setHours(0, 0, 0, 0);

    const monthlyFee = Number(user.monthlyFee) || 0;

    // 2. Logic Check: Has billing started?
    if (today < billingStart) {
        return {
            status: 'ok',
            pendingAmount: 0,
            daysRemaining: Math.ceil((billingStart - today) / (1000 * 60 * 60 * 24)),
            nextDueDate: billingStart,
            billingStats: {
                totalExpected: 0,
                totalPaid: 0,
                cyclesStarted: 0
            }
        };
    }

    // 3. Calculate Cycles Started
    // Cycle 1 starts on Day 0. Cycle 2 starts on Day 30.
    const timeDiff = today.getTime() - billingStart.getTime();
    const daysElapsed = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

    // Even on Day 0, 1 cycle has started. Day 30 means 2 cycles have started.
    const cyclesStarted = Math.floor(daysElapsed / 30) + 1;

    // 4. Calculate Total Expected Bill (Cumulative)
    const totalExpected = cyclesStarted * monthlyFee;

    // 5. Calculate Total Paid (Lifetime Approved Payments)
    // We filter for APPROVED payments only. We do NOT filter by date window.
    // Logic: All money ever paid counts towards the lifetime debt.
    const totalPaid = payments
        .filter(p => p.status === 'approved')
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // 6. Calculate Pending Amount
    // Net Due = Total Expected - Total Paid
    // We treat explicit pending requests separately in the UI if needed, 
    // but for "Status", only approved money counts.
    const pendingAmount = Math.max(0, totalExpected - totalPaid);

    // 7. Determine Next Due Date
    // Start Date + (Cycles Started * 30 days)
    // Note: If they are fully paid up for current cycles, the next due date 
    // is the start of the NEXT cycle (cyclesStarted * 30).
    // If they are overdue, the "Next Due Date" is effectively in the past (start of current unpaid cycle),
    // but usually users want to see when the *next* bill drops.
    // Let's stick to standard: Next Invoice Date = Start + (cyclesStarted * 30)
    const nextDueDate = new Date(billingStart);
    nextDueDate.setDate(billingStart.getDate() + (cyclesStarted * 30));

    // 8. Determine Status
    let status = 'ok';

    // PRE-PAID RULE: If you owe money, you are overdue.
    if (pendingAmount > 0) {
        status = 'overdue';
    } else {
        // If paid up, check if next cycle is close (within 5 days)
        const daysToNextCycle = Math.ceil((nextDueDate - today) / (1000 * 60 * 60 * 24));
        if (daysToNextCycle <= 5) {
            status = 'due-soon';
        }
    }

    return {
        status,
        pendingAmount,
        daysRemaining: Math.ceil((nextDueDate - today) / (1000 * 60 * 60 * 24)),
        nextDueDate,
        billingStats: {
            totalExpected,
            totalPaid,
            cyclesStarted,
            billingStartDate: billingStart
        }
    };
};
