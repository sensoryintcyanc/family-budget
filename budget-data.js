/**
 * Budget Data Configuration
 *
 * This file contains all your budget data. Edit this file manually
 * or sync with Google Sheets for updates.
 *
 * Google Sheets Setup Instructions:
 * 1. Create a Google Sheet with tabs: Accounts, Income, Expenses, Savings
 * 2. Use the structure shown in each section below
 * 3. Publish the sheet to web (File > Share > Publish to web)
 * 4. Update the GOOGLE_SHEETS_URL below with your published URL
 */

// Google Sheets CSV URLs for each sheet tab
// To get the gid for each tab: open the sheet, click the tab, look at URL for gid=XXXXX
const SHEETS_BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ2NJPOV1W2uaT5N2AkzUfMzc7x3HWFjCJsxNVNkTOGl1aszR8Gov42AFMAOXFoXM61OTbmUdxQEBg8/pub?output=csv';

// Sheet tab GIDs (update these based on your sheet tabs)
// Default gid=0 is the first tab. Find other gids in the URL when you click each tab.
const SHEET_GIDS = {
    accounts: 0,        // First tab - Accounts
    expenses: 1857018512,     // Set to gid number when you create Expenses tab
    income: 1941434530,       // Set to gid number when you create Income tab
    savings: 1489417062,      // Set to gid number when you create Savings tab
    flex: 1845212077,         // Set to gid number when you create Flex tab
    confirmations: 1828023200       // Paste GID here after creating a Confirmations tab (columns: key, confirmed_date)
};

// Google Apps Script web app URL for writing confirmations back to Google Sheets.
// Setup: Extensions > Apps Script > paste doPost script > Deploy as web app (Anyone access) > copy URL here.
const CONFIRMATIONS_SCRIPT_URL = null; // e.g. 'https://script.google.com/macros/s/ABC.../exec'

// Helper to build sheet URL (with cache-busting)
const getSheetUrl = (gid) => gid !== null ? `${SHEETS_BASE_URL}&gid=${gid}&_t=${Date.now()}` : null;

// ============================================
// ACCOUNTS
// ============================================
const accounts = [
    {
        name: 'BOI Checking Account',
        balance: 4576.99,
        type: 'checking'
    }
    // Add more accounts as needed:
    // { name: 'Savings Account', balance: 5000.00, type: 'savings' }
];

// ============================================
// INCOME
// ============================================
const income = [
    // Add your income sources here
    // {
    //     name: 'Salary',
    //     amount: 3500.00,
    //     frequency: 'monthly',
    //     dayOfMonth: 25
    // }
];

// ============================================
// SAVINGS GOALS
// ============================================
const savings = [
    // Add your savings goals here
    // {
    //     name: 'Emergency Fund',
    //     monthlyAmount: 200.00,
    //     targetAmount: 10000.00,
    //     currentAmount: 2500.00
    // }
];

// ============================================
// EXPENSES
// ============================================
const expenses = [
    // Monthly expenses (day of month)
    {
        name: 'Rent',
        amount: 3240.00,
        frequency: 'monthly',
        dayOfMonth: 28,
        category: 'housing'
    },
    {
        name: 'ResMed',
        amount: 96.00,
        frequency: 'monthly',
        dayOfMonth: 28,
        category: 'health'
    },
    {
        name: 'CheapStorage',
        amount: 239.88,
        frequency: 'monthly',
        dayOfMonth: 6,
        category: 'storage'
    },

    // Every N weeks expenses
    {
        name: 'Vodafone',
        amount: 60.00,
        frequency: 'every-n-weeks',
        intervalWeeks: 4,
        startDate: '2026-01-30', // 30th Jan 2026
        category: 'utilities'
    },

    // Weekly expenses
    {
        name: 'Groceries',
        amount: 800.00,
        frequency: 'weekly',
        dayOfWeek: 0, // 0 = Sunday, 1 = Monday, etc. (set to your shopping day)
        category: 'food'
    },

    // Yearly expenses
    {
        name: 'Disney+',
        amount: 98.00,
        frequency: 'yearly',
        month: 12, // December
        dayOfMonth: 12,
        category: 'entertainment'
    }
];

// ============================================
// FLEX EXPENSES (variable month to month)
// ============================================
const flexExpenses = [
    // Add flex expenses here - these vary month to month
    // {
    //     name: 'Car Maintenance',
    //     estimatedAmount: 100.00,
    //     category: 'transport',
    //     notes: 'Oil change due in February'
    // }
];

// ============================================
// LAST UPDATED
// ============================================
const lastUpdated = new Date().toISOString();
