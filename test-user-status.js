// Quick test to check the payment due logic
const testUser = {
  id: 'test-user-id',
  fullName: 'SWCWS',
  phone: '1122343243',
  monthlyFee: 4000,
  createdAt: new Date('2026-01-28'), // Joining date
  lastPaymentDate: null
};

const testPayments = [
  {
    userId: 'test-user-id',
    amount: 3000,
    status: 'pending'
  }
];

// Simulate the logic
const joinDate = testUser.lastPaymentDate || testUser.createdAt;
const startDate = new Date(joinDate);
const todayDate = new Date();
todayDate.setHours(0, 0, 0, 0);

const endDate = new Date(startDate);
endDate.setDate(endDate.getDate() + 30);
endDate.setHours(0, 0, 0, 0);

const timeDiff = endDate.getTime() - todayDate.getTime();
const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

const userPendingPayments = testPayments.filter(p => p.userId === testUser.id && p.status === 'pending');
const pendingRequestAmount = userPendingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

console.log('Days Remaining:', daysRemaining);
console.log('Pending Request Amount:', pendingRequestAmount);
console.log('Due Date:', endDate.toLocaleDateString('en-IN'));

let status = 'ok';
let pendingAmount = 0;

if (pendingRequestAmount > 0 || daysRemaining <= 0) {
    status = 'overdue';
    pendingAmount = pendingRequestAmount > 0 ? pendingRequestAmount : (daysRemaining <= 0 ? (testUser.monthlyFee || 0) : 0);
} else if (daysRemaining <= 5) {
    status = 'due-soon';
    pendingAmount = testUser.monthlyFee || 0;
}

console.log('Status:', status);
console.log('Pending Amount:', pendingAmount);
console.log('Should show in overdue?', status === 'overdue');
