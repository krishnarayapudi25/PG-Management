#!/bin/bash

# Test Firestore Connection
# Firebase Project: hotel-management-6b968

echo "=== Testing Firestore Connection ==="
echo ""

# Test 1: List users collection (read access test)
echo "Test 1: Fetching users from Firestore..."
curl -s "https://firestore.googleapis.com/v1/projects/hotel-management-6b968/databases/(default)/documents/users" \
  -H "Content-Type: application/json" | jq -r '.documents[].name // "No users found or permission denied"'

echo ""
echo "Test 2: Check if duplicate phone numbers exist..."
echo "Replace PHONE_NUMBER below with the phone number you're trying to update to:"
echo ""
echo 'curl -X POST "https://firestore.googleapis.com/v1/projects/hotel-management-6b968/databases/(default)/documents:runQuery" \'
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{'
echo '    "structuredQuery": {'
echo '      "from": [{"collectionId": "users"}],'
echo '      "where": {'
echo '        "fieldFilter": {'
echo '          "field": {"fieldPath": "phone"},'
echo '          "op": "EQUAL",'
echo '          "value": {"stringValue": "PHONE_NUMBER"}'
echo '        }'
echo '      }'
echo '    }'
echo '  }'"'"' | jq'

echo ""
echo "=== Alternative: Test with Firebase Admin SDK ==="
echo "If you have Firebase CLI installed, run:"
echo "  firebase firestore:indexes"
echo "  firebase firestore:rules"
