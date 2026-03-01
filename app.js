/**
 * Family Budget Tracker
 * Main Application Logic
 */

// Live data from Google Sheets (will be populated on load)
let liveAccounts = [];
let liveExpenses = [];
let liveIncome = [];
let liveSavings = [];
let liveFlexExpenses = [];
let dataLoadedFromSheets = false;

// Paid items tracking (persisted to localStorage)
let paidItems = {};

/**
 * Load paid items from localStorage
 */
function loadPaidItems() {
    try {
        const stored = localStorage.getItem('budgetTracker_paidItems');
        if (stored) {
            paidItems = JSON.parse(stored);
            // Clean up old entries (older than 14 days)
            const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
            Object.keys(paidItems).forEach(key => {
                if (paidItems[key].timestamp < cutoff) {
                    delete paidItems[key];
                }
            });
            savePaidItems();
        }
    } catch (e) {
        console.warn('Could not load paid items from localStorage:', e);
        paidItems = {};
    }
}

/**
 * Save paid items to localStorage
 */
function savePaidItems() {
    try {
        localStorage.setItem('budgetTracker_paidItems', JSON.stringify(paidItems));
    } catch (e) {
        console.warn('Could not save paid items to localStorage:', e);
    }
}

/**
 * Fetch confirmations from the Google Sheets Confirmations tab and merge into paidItems.
 * Tab columns: key, confirmed_date
 * Add a row per confirmed item, e.g.: expense_Rent_2026-02-01 | 2026-03-01
 */
async function fetchConfirmations() {
    const url = getSheetUrl(SHEET_GIDS.confirmations);
    if (!url) return;
    try {
        const response = await fetch(url);
        if (!response.ok) return;
        const csvText = await response.text();
        const rows = parseCSV(csvText);
        rows.forEach(row => {
            const key = (row.key || '').trim();
            if (key && !paidItems[key]) {
                paidItems[key] = { timestamp: Date.now(), source: 'sheets' };
            }
        });
        savePaidItems();
    } catch (e) {
        console.warn('Could not fetch confirmations from Google Sheets:', e);
    }
}

/**
 * Generate a unique key for a calendar item
 */
function getItemKey(type, name, dateKey) {
    return `${type}_${name}_${dateKey}`;
}

/**
 * Check if an item is marked as paid
 */
function isItemPaid(type, name, dateKey) {
    const key = getItemKey(type, name, dateKey);
    return !!paidItems[key];
}

/**
 * Fire-and-forget POST to the Apps Script web app to sync a confirmation to Google Sheets.
 * Uses no-cors so there's no preflight; failures are silently ignored.
 */
function syncConfirmationToSheets(action, key) {
    if (!CONFIRMATIONS_SCRIPT_URL) return;
    const date = new Date().toISOString().split('T')[0];
    fetch(CONFIRMATIONS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ action, key, date })
    }).catch(() => {});
}

/**
 * Toggle paid status for an item
 */
function toggleItemPaid(type, name, dateKey) {
    const key = getItemKey(type, name, dateKey);
    if (paidItems[key]) {
        delete paidItems[key];
        syncConfirmationToSheets('unconfirm', key);
    } else {
        paidItems[key] = { timestamp: Date.now() };
        syncConfirmationToSheets('confirm', key);
    }
    savePaidItems();
    renderCalendar();
}

/**
 * Parse CSV text into array of objects
 */
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index].trim();
            });
            rows.push(row);
        }
    }
    return rows;
}

/**
 * Parse a single CSV line (handles quoted values with commas)
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

/**
 * Parse currency/number values that may contain symbols and formatting
 * Handles: €1,234.56, $1234, 1.234,56 (European), plain numbers
 */
function parseNumber(value) {
    if (!value || typeof value !== 'string') return parseFloat(value) || 0;

    // Remove currency symbols and whitespace
    let cleaned = value.replace(/[€$£¥\s]/g, '');

    // Handle European format (1.234,56) vs US format (1,234.56)
    // If there's a comma after a period, it's European format
    if (/\.\d{3},/.test(cleaned)) {
        // European: 1.234,56 -> 1234.56
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
        // US/UK format: just remove commas
        cleaned = cleaned.replace(/,/g, '');
    }

    return parseFloat(cleaned) || 0;
}

/**
 * Parse a date/time string for last_updated field
 */
function parseLastUpdated(dateStr) {
    if (!dateStr) return null;

    // Try parsing as a general date/time
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    return null;
}

/**
 * Format a date as relative time (e.g., "2 minutes ago", "5 hours ago")
 */
function formatRelativeTime(date) {
    if (!date) return null;

    const now = new Date();
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) {
        return 'just now';
    } else if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays < 30) {
        return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else if (diffMonths < 12) {
        return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
    } else {
        return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
    }
}

/**
 * Check if a date is more than 2 days old
 */
function isStale(date) {
    if (!date) return false;
    const now = new Date();
    const diffMs = now - date;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays > 2;
}

/**
 * Fetch and parse accounts from Google Sheets
 */
async function fetchAccounts() {
    const url = getSheetUrl(SHEET_GIDS.accounts);
    if (!url) return [];

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        const csvText = await response.text();
        const rows = parseCSV(csvText);

        return rows.map(row => ({
            name: row.name || '',
            balance: parseNumber(row.balance),
            type: row.type || 'checking',
            lastUpdated: parseLastUpdated(row.last_updated)
        })).filter(a => a.name);
    } catch (error) {
        console.warn('Could not fetch accounts from Google Sheets:', error);
        return [];
    }
}

/**
 * Fetch and parse expenses from Google Sheets
 * Expected columns: name, amount, frequency, day_of_month, day_of_week, interval_weeks, start_date, month, category
 */
async function fetchExpenses() {
    const url = getSheetUrl(SHEET_GIDS.expenses);
    if (!url) return [];

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        const csvText = await response.text();
        const rows = parseCSV(csvText);

        return rows.map(row => {
            const expense = {
                name: row.name || '',
                amount: parseNumber(row.amount),
                frequency: row.frequency || 'monthly',
                category: row.category || 'other'
            };

            if (expense.frequency === 'monthly' || expense.frequency === 'yearly') {
                expense.dayOfMonth = parseInt(row.day_of_month) || 1;
            }
            if (expense.frequency === 'yearly') {
                expense.month = parseInt(row.month) || 1;
            }
            if (expense.frequency === 'weekly') {
                expense.dayOfWeek = parseInt(row.day_of_week) || 0;
            }
            if (expense.frequency === 'every-n-weeks') {
                expense.intervalWeeks = parseInt(row.interval_weeks) || 4;
                expense.startDate = row.start_date || new Date().toISOString().split('T')[0];
            }

            return expense;
        }).filter(e => e.name && e.amount > 0);
    } catch (error) {
        console.warn('Could not fetch expenses from Google Sheets:', error);
        return [];
    }
}

/**
 * Fetch and parse income from Google Sheets
 * Expected columns: name, amount, frequency, day_of_month
 */
async function fetchIncome() {
    const url = getSheetUrl(SHEET_GIDS.income);
    if (!url) return [];

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        const csvText = await response.text();
        const rows = parseCSV(csvText);

        return rows.map(row => ({
            name: row.name || '',
            amount: parseNumber(row.amount),
            frequency: row.frequency || 'monthly',
            dayOfMonth: parseInt(row.day_of_month) || 1
        })).filter(i => i.name && i.amount > 0);
    } catch (error) {
        console.warn('Could not fetch income from Google Sheets:', error);
        return [];
    }
}

/**
 * Fetch and parse savings from Google Sheets
 * Expected columns: name, monthly_amount, target_amount, current_amount
 */
async function fetchSavings() {
    const url = getSheetUrl(SHEET_GIDS.savings);
    if (!url) return [];

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        const csvText = await response.text();
        const rows = parseCSV(csvText);

        return rows.map(row => ({
            name: row.name || '',
            monthlyAmount: parseNumber(row.monthly_amount),
            targetAmount: parseNumber(row.target_amount),
            currentAmount: parseNumber(row.current_amount)
        })).filter(s => s.name);
    } catch (error) {
        console.warn('Could not fetch savings from Google Sheets:', error);
        return [];
    }
}

/**
 * Parse a date string in various formats (M/D, MM/DD, YYYY-MM-DD, etc.)
 */
function parseFlexDate(dateStr) {
    if (!dateStr) return null;

    // Try M/D or MM/DD format (assumes current year)
    const shortMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (shortMatch) {
        const month = parseInt(shortMatch[1]) - 1;
        const day = parseInt(shortMatch[2]);
        const year = new Date().getFullYear();
        const date = new Date(year, month, day);
        // Only advance to next year if more than 14 days in the past (within 14 days = rollover window)
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        if (date < twoWeeksAgo) {
            date.setFullYear(year + 1);
        }
        return date;
    }

    // Try YYYY-MM-DD format
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    }

    // Try parsing as a general date
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    return null;
}

/**
 * Fetch and parse flex expenses from Google Sheets
 * Expected columns: name, amount, category, date
 */
async function fetchFlexExpenses() {
    const url = getSheetUrl(SHEET_GIDS.flex);
    if (!url) return [];

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        const csvText = await response.text();
        const rows = parseCSV(csvText);

        return rows.map(row => ({
            name: row.name || '',
            amount: parseNumber(row.amount),
            category: row.category || 'other',
            date: parseFlexDate(row.date)
        })).filter(f => f.name && f.amount > 0 && f.date);
    } catch (error) {
        console.warn('Could not fetch flex expenses from Google Sheets:', error);
        return [];
    }
}

/**
 * Load all data from Google Sheets
 */
async function loadFromGoogleSheets() {
    const [sheetAccounts, sheetExpenses, sheetIncome, sheetSavings, sheetFlex] = await Promise.all([
        fetchAccounts(),
        fetchExpenses(),
        fetchIncome(),
        fetchSavings(),
        fetchFlexExpenses()
    ]);

    // Use sheet data if available, otherwise fall back to budget-data.js
    liveAccounts = sheetAccounts.length > 0 ? sheetAccounts : accounts;
    liveExpenses = sheetExpenses.length > 0 ? sheetExpenses : expenses;
    liveIncome = sheetIncome.length > 0 ? sheetIncome : income;
    liveSavings = sheetSavings.length > 0 ? sheetSavings : savings;
    liveFlexExpenses = sheetFlex.length > 0 ? sheetFlex : flexExpenses;

    dataLoadedFromSheets = sheetAccounts.length > 0;

    // Merge sheet-based confirmations into paidItems
    await fetchConfirmations();

    console.log('Data loaded:', {
        accounts: liveAccounts.length,
        expenses: liveExpenses.length,
        income: liveIncome.length,
        savings: liveSavings.length,
        flexExpenses: liveFlexExpenses.length,
        fromSheets: dataLoadedFromSheets
    });
}

/**
 * Get active data arrays (from sheets or fallback)
 */
const getAccounts = () => liveAccounts.length > 0 ? liveAccounts : accounts;
const getExpenses = () => liveExpenses.length > 0 ? liveExpenses : expenses;
const getIncome = () => liveIncome.length > 0 ? liveIncome : income;
const getSavings = () => liveSavings.length > 0 ? liveSavings : savings;
const getFlexExpenses = () => liveFlexExpenses.length > 0 ? liveFlexExpenses : flexExpenses;

// Currency formatter for Euros
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IE', {
        style: 'currency',
        currency: 'EUR'
    }).format(amount);
};

// Calendar week offset (0 = current week, negative = past, positive = future)
let calendarWeekOffset = 0;

// Date utilities
const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const isSameDay = (date1, date2) => {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
};

const getDayName = (date) => {
    return date.toLocaleDateString('en-IE', { weekday: 'short' });
};

const getMonthName = (date) => {
    return date.toLocaleDateString('en-IE', { month: 'short' });
};

/**
 * Calculate all expense occurrences within a date range
 */
function getExpenseOccurrences(expense, startDate, endDate) {
    const occurrences = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    switch (expense.frequency) {
        case 'monthly':
            // Find all occurrences of this day of month in the range
            let monthDate = new Date(start.getFullYear(), start.getMonth(), expense.dayOfMonth);
            if (monthDate < start) {
                monthDate.setMonth(monthDate.getMonth() + 1);
            }
            while (monthDate <= end) {
                occurrences.push({
                    ...expense,
                    date: new Date(monthDate)
                });
                monthDate.setMonth(monthDate.getMonth() + 1);
            }
            break;

        case 'weekly':
            // Find all occurrences of this day of week in the range
            let weekDate = new Date(start);
            // Move to the first occurrence of the target day
            while (weekDate.getDay() !== expense.dayOfWeek) {
                weekDate.setDate(weekDate.getDate() + 1);
            }
            while (weekDate <= end) {
                occurrences.push({
                    ...expense,
                    date: new Date(weekDate)
                });
                weekDate.setDate(weekDate.getDate() + 7);
            }
            break;

        case 'every-n-weeks':
            // Start from the given start date and add N weeks
            let nWeekDate = new Date(expense.startDate);
            // If start date is before our range, move forward
            while (nWeekDate < start) {
                nWeekDate.setDate(nWeekDate.getDate() + (expense.intervalWeeks * 7));
            }
            while (nWeekDate <= end) {
                occurrences.push({
                    ...expense,
                    date: new Date(nWeekDate)
                });
                nWeekDate.setDate(nWeekDate.getDate() + (expense.intervalWeeks * 7));
            }
            break;

        case 'yearly':
            // Check if the yearly date falls within our range
            let yearDate = new Date(start.getFullYear(), expense.month - 1, expense.dayOfMonth);
            if (yearDate < start) {
                yearDate.setFullYear(yearDate.getFullYear() + 1);
            }
            if (yearDate <= end) {
                occurrences.push({
                    ...expense,
                    date: new Date(yearDate)
                });
            }
            break;
    }

    return occurrences;
}

/**
 * Get all income occurrences within a date range
 */
function getIncomeOccurrences(incomeItem, startDate, endDate) {
    const occurrences = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (incomeItem.frequency === 'monthly') {
        let monthDate = new Date(start.getFullYear(), start.getMonth(), incomeItem.dayOfMonth);
        if (monthDate < start) {
            monthDate.setMonth(monthDate.getMonth() + 1);
        }
        while (monthDate <= end) {
            occurrences.push({
                ...incomeItem,
                date: new Date(monthDate)
            });
            monthDate.setMonth(monthDate.getMonth() + 1);
        }
    }

    return occurrences;
}

/**
 * Render account cards
 */
function renderAccounts() {
    const grid = document.getElementById('accounts-grid');
    const accountData = getAccounts();
    grid.innerHTML = accountData.map(account => {
        const relativeTime = formatRelativeTime(account.lastUpdated);
        const stale = isStale(account.lastUpdated);
        const updatedClass = stale ? 'stale' : '';

        return `
            <div class="account-card">
                <h4>${account.name}</h4>
                <p class="balance">${formatCurrency(account.balance)}</p>
                ${relativeTime ? `<p class="last-updated ${updatedClass}">Updated ${relativeTime}</p>` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Return all unconfirmed items from the past 14 days that should roll over to today.
 * Each entry: { type: 'expense'|'income'|'flex', item, originalDateKey }
 */
function getPendingItems() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(today.getDate() - 14);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const pending = [];

    getExpenses().forEach(expense => {
        getExpenseOccurrences(expense, cutoff, yesterday).forEach(occ => {
            const dateKey = occ.date.toISOString().split('T')[0];
            if (!isItemPaid('expense', occ.name, dateKey)) {
                pending.push({ type: 'expense', item: occ, originalDateKey: dateKey });
            }
        });
    });

    getIncome().forEach(incomeItem => {
        getIncomeOccurrences(incomeItem, cutoff, yesterday).forEach(occ => {
            const dateKey = occ.date.toISOString().split('T')[0];
            if (!isItemPaid('income', occ.name, dateKey)) {
                pending.push({ type: 'income', item: occ, originalDateKey: dateKey });
            }
        });
    });

    getFlexExpenses().forEach(flex => {
        if (flex.date && flex.date >= cutoff && flex.date < today) {
            const dateKey = flex.date.toISOString().split('T')[0];
            if (!isItemPaid('flex', flex.name, dateKey)) {
                pending.push({ type: 'flex', item: flex, originalDateKey: dateKey });
            }
        }
    });

    return pending;
}

/**
 * Render the 5-week calendar with running balance
 */
function renderCalendar() {
    const container = document.getElementById('calendar-container');
    const rangeDisplay = document.getElementById('calendar-range');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate the start of the view based on week offset
    const viewStart = new Date(today);
    viewStart.setDate(today.getDate() - today.getDay() + (calendarWeekOffset * 7));

    // Calculate date range for data fetching (extended range for running balance)
    const dataStartDate = new Date(today); // Always start from today for balance calc
    const viewEndDate = addDays(viewStart, 41); // 6 weeks of display
    const dataEndDate = new Date(Math.max(viewEndDate.getTime(), addDays(today, 365).getTime()));

    // Get starting balance from accounts
    const accountData = getAccounts();
    const startingBalance = accountData.reduce((sum, a) => sum + a.balance, 0);

    // Get all expense occurrences for the extended range
    let allExpenseOccurrences = [];
    getExpenses().forEach(expense => {
        allExpenseOccurrences = allExpenseOccurrences.concat(
            getExpenseOccurrences(expense, dataStartDate, dataEndDate)
        );
    });

    // Get all income occurrences for the extended range
    let allIncomeOccurrences = [];
    getIncome().forEach(incomeItem => {
        allIncomeOccurrences = allIncomeOccurrences.concat(
            getIncomeOccurrences(incomeItem, dataStartDate, dataEndDate)
        );
    });

    // Get flex expenses (one-time planned expenses with specific dates)
    const flexData = getFlexExpenses();
    const flexOccurrences = flexData.filter(f =>
        f.date >= dataStartDate && f.date <= dataEndDate
    ).map(f => ({
        ...f,
        isFlex: true
    }));

    // Unconfirmed items from the past 14 days that roll over to today
    const pendingItems = getPendingItems();

    // Build a map of daily transactions for running balance calculation
    // Only include unpaid items in the balance calculation
    const dailyTransactions = new Map();

    // Add regular expenses (negative) - only if not paid
    allExpenseOccurrences.forEach(e => {
        const dateKey = e.date.toISOString().split('T')[0];
        if (!dailyTransactions.has(dateKey)) {
            dailyTransactions.set(dateKey, { income: 0, expenses: 0, flex: 0, flexSavings: 0 });
        }
        // Only add to balance if not marked as paid
        if (!isItemPaid('expense', e.name, dateKey)) {
            dailyTransactions.get(dateKey).expenses += e.amount;
        }
    });

    // Add flex items - savings category adds to balance, others subtract
    flexOccurrences.forEach(f => {
        const dateKey = f.date.toISOString().split('T')[0];
        if (!dailyTransactions.has(dateKey)) {
            dailyTransactions.set(dateKey, { income: 0, expenses: 0, flex: 0, flexSavings: 0 });
        }
        // Only add to balance if not marked as paid/received
        if (!isItemPaid('flex', f.name, dateKey)) {
            if (f.category && f.category.toLowerCase() === 'savings') {
                // Savings category = income (adds to balance)
                dailyTransactions.get(dateKey).flexSavings += f.amount;
            } else {
                // Other categories = expense (subtracts from balance)
                dailyTransactions.get(dateKey).flex += f.amount;
            }
        }
    });

    // Add income (positive) - only if not received/marked
    allIncomeOccurrences.forEach(i => {
        const dateKey = i.date.toISOString().split('T')[0];
        if (!dailyTransactions.has(dateKey)) {
            dailyTransactions.set(dateKey, { income: 0, expenses: 0, flex: 0, flexSavings: 0 });
        }
        // Only add to balance if not marked as received
        if (!isItemPaid('income', i.name, dateKey)) {
            dailyTransactions.get(dateKey).income += i.amount;
        }
    });

    // Roll pending past items into today's transaction totals so they affect the running balance
    if (pendingItems.length > 0) {
        const todayKey = today.toISOString().split('T')[0];
        if (!dailyTransactions.has(todayKey)) {
            dailyTransactions.set(todayKey, { income: 0, expenses: 0, flex: 0, flexSavings: 0 });
        }
        const todayTrans = dailyTransactions.get(todayKey);
        pendingItems.forEach(p => {
            if (p.type === 'expense') todayTrans.expenses += p.item.amount;
            else if (p.type === 'income') todayTrans.income += p.item.amount;
            else if (p.type === 'flex') {
                if (p.item.category && p.item.category.toLowerCase() === 'savings') {
                    todayTrans.flexSavings += p.item.amount;
                } else {
                    todayTrans.flex += p.item.amount;
                }
            }
        });
    }

    // Pre-calculate running balance up to the view start
    let runningBalance = startingBalance;
    const sortedDates = Array.from(dailyTransactions.keys()).sort();
    for (const dateKey of sortedDates) {
        const dateObj = new Date(dateKey + 'T00:00:00');
        if (dateObj < viewStart && dateObj >= today) {
            const trans = dailyTransactions.get(dateKey);
            runningBalance += trans.income + trans.flexSavings - trans.expenses - trans.flex;
        }
    }

    // Update range display
    const rangeEndDate = addDays(viewStart, 34);
    if (rangeDisplay) {
        rangeDisplay.textContent = `${viewStart.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })} - ${rangeEndDate.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }

    // Create calendar HTML
    let html = '';

    // Day headers
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(day => {
        html += `<div class="calendar-header">${day}</div>`;
    });

    // Generate 6 weeks of days (to ensure we show 5 full weeks)
    for (let week = 0; week < 6; week++) {
        for (let day = 0; day < 7; day++) {
            const currentDate = addDays(viewStart, (week * 7) + day);
            const isToday = isSameDay(currentDate, today);
            const isPast = currentDate < today;
            const dateKey = currentDate.toISOString().split('T')[0];

            // Find expenses for this day
            const dayExpenses = allExpenseOccurrences.filter(e =>
                isSameDay(e.date, currentDate)
            );

            // Find income for this day
            const dayIncome = allIncomeOccurrences.filter(i =>
                isSameDay(i.date, currentDate)
            );

            // Find flex expenses for this day
            const dayFlex = flexOccurrences.filter(f =>
                isSameDay(f.date, currentDate)
            );

            // Build overdue rollover items for today's cell only
            let pendingHtml = '';
            if (isToday && pendingItems.length > 0) {
                pendingHtml = pendingItems.map(p => {
                    const originalDate = new Date(p.originalDateKey + 'T00:00:00');
                    const dueDateStr = originalDate.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
                    if (p.type === 'expense') {
                        const isPaid = isItemPaid('expense', p.item.name, p.originalDateKey);
                        return `<div class="expense-item overdue tooltip ${isPaid ? 'paid' : ''}" data-desc="${p.item.category}" title="${p.item.name}: ${formatCurrency(p.item.amount)} — due ${dueDateStr}" onclick="toggleItemPaid('expense', '${p.item.name.replace(/'/g, "\\'")}', '${p.originalDateKey}')">${p.item.name}<span class="tooltiptext">${formatCurrency(p.item.amount)} — due ${dueDateStr}</span></div>`;
                    } else if (p.type === 'income') {
                        const isPaid = isItemPaid('income', p.item.name, p.originalDateKey);
                        return `<div class="expense-item income overdue tooltip ${isPaid ? 'paid' : ''}" title="${p.item.name}: ${formatCurrency(p.item.amount)} — due ${dueDateStr}" onclick="toggleItemPaid('income', '${p.item.name.replace(/'/g, "\\'")}', '${p.originalDateKey}')">+${p.item.name}<span class="tooltiptext">${formatCurrency(p.item.amount)} — due ${dueDateStr}</span></div>`;
                    } else if (p.type === 'flex') {
                        const isSavings = p.item.category && p.item.category.toLowerCase() === 'savings';
                        const flexClass = isSavings ? 'flex-savings' : 'flex';
                        const prefix = isSavings ? '+' : '';
                        const isPaid = isItemPaid('flex', p.item.name, p.originalDateKey);
                        return `<div class="expense-item ${flexClass} overdue tooltip ${isPaid ? 'paid' : ''}" data-desc="${p.item.category}" title="${p.item.name}: ${formatCurrency(p.item.amount)} — due ${dueDateStr}" onclick="toggleItemPaid('flex', '${p.item.name.replace(/'/g, "\\'")}', '${p.originalDateKey}')">${prefix}${p.item.name}<span class="tooltiptext">${formatCurrency(p.item.amount)} — due ${dueDateStr}</span></div>`;
                    }
                    return '';
                }).join('');
            }

            // Calculate day's net change and update running balance
            let dayBalance = null;
            if (!isPast) {
                const transactions = dailyTransactions.get(dateKey) || { income: 0, expenses: 0, flex: 0, flexSavings: 0 };
                runningBalance += transactions.income + transactions.flexSavings - transactions.expenses - transactions.flex;
                dayBalance = runningBalance;
            }

            const classes = ['calendar-day'];
            if (isToday) classes.push('today');
            if (isPast) classes.push('past-day');

            // Determine balance color class
            let balanceClass = 'balance-positive';
            if (dayBalance !== null) {
                if (dayBalance < 0) {
                    balanceClass = 'balance-negative';
                } else if (dayBalance < 500) {
                    balanceClass = 'balance-warning';
                }
            }

            html += `
                <div class="${classes.join(' ')}">
                    <div class="date ${isToday ? 'today' : ''}">
                        ${currentDate.getDate()} ${getMonthName(currentDate)}${isToday && pendingItems.length > 0 ? ` <span class="pending-badge" title="${pendingItems.length} item${pendingItems.length === 1 ? '' : 's'} pending confirmation">${pendingItems.length}</span>` : ''}
                    </div>
                    ${pendingHtml}
                    ${dayIncome.map(i => {
                        const isPaid = isItemPaid('income', i.name, dateKey);
                        return `
                        <div class="expense-item income tooltip ${isPaid ? 'paid' : ''}"
                             title="${i.name}: ${formatCurrency(i.amount)}${isPaid ? ' (received)' : ''}"
                             onclick="toggleItemPaid('income', '${i.name.replace(/'/g, "\\'")}', '${dateKey}')">
                            +${i.name}
                            <span class="tooltiptext">${formatCurrency(i.amount)}</span>
                        </div>
                    `}).join('')}
                    ${dayExpenses.map(e => {
                        const isPaid = isItemPaid('expense', e.name, dateKey);
                        return `
                        <div class="expense-item tooltip ${isPaid ? 'paid' : ''}"
                             data-desc="${e.category}"
                             title="${e.name}: ${formatCurrency(e.amount)}${isPaid ? ' (paid)' : ''}"
                             onclick="toggleItemPaid('expense', '${e.name.replace(/'/g, "\\'")}', '${dateKey}')">
                            ${e.name}
                            <span class="tooltiptext">${formatCurrency(e.amount)}</span>
                        </div>
                    `}).join('')}
                    ${dayFlex.map(f => {
                        const isPaid = isItemPaid('flex', f.name, dateKey);
                        const isSavings = f.category && f.category.toLowerCase() === 'savings';
                        const flexClass = isSavings ? 'flex-savings' : 'flex';
                        const prefix = isSavings ? '+' : '';
                        const paidLabel = isSavings ? ' (received)' : ' (paid)';
                        return `
                        <div class="expense-item ${flexClass} tooltip ${isPaid ? 'paid' : ''}"
                             data-desc="${f.category}"
                             title="${f.name}: ${formatCurrency(f.amount)}${isPaid ? paidLabel : ''}"
                             onclick="toggleItemPaid('flex', '${f.name.replace(/'/g, "\\'")}', '${dateKey}')">
                            ${prefix}${f.name}
                            <span class="tooltiptext">${formatCurrency(f.amount)}</span>
                        </div>
                    `}).join('')}
                    ${dayBalance !== null ? `
                        <div class="day-balance ${balanceClass}" title="Running balance">
                            ${formatCurrency(dayBalance)}
                        </div>
                    ` : ''}
                </div>
            `;
        }
    }

    container.innerHTML = html;

    // Render the balance chart
    renderBalanceChart();
}

/**
 * Render the balance line chart
 */
function renderBalanceChart() {
    const canvas = document.getElementById('balance-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;

    // Set canvas size for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '200px';
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = 200;
    const padding = { top: 20, right: 60, bottom: 30, left: 10 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Calculate balance data for the next 5 weeks
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = addDays(today, 35);

    // Get starting balance from accounts
    const accountData = getAccounts();
    const startingBalance = accountData.reduce((sum, a) => sum + a.balance, 0);

    // Get all expense occurrences
    let allExpenseOccurrences = [];
    getExpenses().forEach(expense => {
        allExpenseOccurrences = allExpenseOccurrences.concat(
            getExpenseOccurrences(expense, today, endDate)
        );
    });

    // Get all income occurrences
    let allIncomeOccurrences = [];
    getIncome().forEach(incomeItem => {
        allIncomeOccurrences = allIncomeOccurrences.concat(
            getIncomeOccurrences(incomeItem, today, endDate)
        );
    });

    // Get flex expenses
    const flexData = getFlexExpenses();
    const flexOccurrences = flexData.filter(f =>
        f.date >= today && f.date <= endDate
    );

    // Build daily balance data
    const balanceData = [];
    let runningBalance = startingBalance;
    const pendingItems = getPendingItems();

    for (let i = 0; i <= 35; i++) {
        const currentDate = addDays(today, i);
        const dateKey = currentDate.toISOString().split('T')[0];

        // Calculate day's transactions (excluding paid items)
        let dayIncome = 0;
        let dayExpenses = 0;
        let dayFlex = 0;
        let dayFlexSavings = 0;

        allIncomeOccurrences.forEach(inc => {
            if (isSameDay(inc.date, currentDate) && !isItemPaid('income', inc.name, dateKey)) {
                dayIncome += inc.amount;
            }
        });

        allExpenseOccurrences.forEach(exp => {
            if (isSameDay(exp.date, currentDate) && !isItemPaid('expense', exp.name, dateKey)) {
                dayExpenses += exp.amount;
            }
        });

        flexOccurrences.forEach(flex => {
            if (isSameDay(flex.date, currentDate) && !isItemPaid('flex', flex.name, dateKey)) {
                if (flex.category && flex.category.toLowerCase() === 'savings') {
                    dayFlexSavings += flex.amount;
                } else {
                    dayFlex += flex.amount;
                }
            }
        });

        // On day 0 (today), fold in unconfirmed past items
        if (i === 0) {
            pendingItems.forEach(p => {
                if (p.type === 'expense') dayExpenses += p.item.amount;
                else if (p.type === 'income') dayIncome += p.item.amount;
                else if (p.type === 'flex') {
                    if (p.item.category && p.item.category.toLowerCase() === 'savings') {
                        dayFlexSavings += p.item.amount;
                    } else {
                        dayFlex += p.item.amount;
                    }
                }
            });
        }

        runningBalance += dayIncome + dayFlexSavings - dayExpenses - dayFlex;

        balanceData.push({
            date: currentDate,
            balance: runningBalance
        });
    }

    // Find min and max for scaling
    const balances = balanceData.map(d => d.balance);
    const minBalance = Math.min(...balances, 0);
    const maxBalance = Math.max(...balances, 200);
    const range = maxBalance - minBalance || 1;

    // Add some padding to the range
    const yMin = minBalance - (range * 0.1);
    const yMax = maxBalance + (range * 0.1);
    const yRange = yMax - yMin;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background zones
    const zeroY = padding.top + chartHeight - ((0 - yMin) / yRange * chartHeight);
    const twoHundredY = padding.top + chartHeight - ((200 - yMin) / yRange * chartHeight);

    // Red zone (below 0)
    if (yMin < 0) {
        ctx.fillStyle = 'rgba(231, 76, 60, 0.15)';
        ctx.fillRect(padding.left, Math.max(zeroY, padding.top), chartWidth, Math.min(chartHeight - (zeroY - padding.top), chartHeight));
    }

    // Yellow zone (0 to 200)
    if (yMin < 200 && yMax > 0) {
        const yellowTop = Math.max(twoHundredY, padding.top);
        const yellowBottom = Math.min(zeroY, padding.top + chartHeight);
        if (yellowBottom > yellowTop) {
            ctx.fillStyle = 'rgba(241, 196, 15, 0.15)';
            ctx.fillRect(padding.left, yellowTop, chartWidth, yellowBottom - yellowTop);
        }
    }

    // Green zone (above 200)
    if (yMax > 200) {
        const greenBottom = Math.min(twoHundredY, padding.top + chartHeight);
        ctx.fillStyle = 'rgba(39, 174, 96, 0.15)';
        ctx.fillRect(padding.left, padding.top, chartWidth, greenBottom - padding.top);
    }

    // Draw horizontal reference lines
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    // Zero line
    if (yMin < 0 && yMax > 0) {
        ctx.beginPath();
        ctx.moveTo(padding.left, zeroY);
        ctx.lineTo(width - padding.right, zeroY);
        ctx.stroke();

        ctx.fillStyle = '#666';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('€0', width - padding.right + 5, zeroY + 4);
    }

    // 200 line
    if (yMin < 200 && yMax > 200) {
        ctx.beginPath();
        ctx.moveTo(padding.left, twoHundredY);
        ctx.lineTo(width - padding.right, twoHundredY);
        ctx.stroke();

        ctx.fillStyle = '#666';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('€200', width - padding.right + 5, twoHundredY + 4);
    }

    ctx.setLineDash([]);

    // Draw the line chart
    ctx.beginPath();
    ctx.lineWidth = 2;

    balanceData.forEach((point, index) => {
        const x = padding.left + (index / (balanceData.length - 1)) * chartWidth;
        const y = padding.top + chartHeight - ((point.balance - yMin) / yRange * chartHeight);

        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    // Create gradient stroke based on balance value
    ctx.strokeStyle = '#3498db';
    ctx.stroke();

    // Draw points with color coding
    balanceData.forEach((point, index) => {
        const x = padding.left + (index / (balanceData.length - 1)) * chartWidth;
        const y = padding.top + chartHeight - ((point.balance - yMin) / yRange * chartHeight);

        // Determine color based on balance
        let color;
        if (point.balance < 0) {
            color = '#e74c3c'; // Red
        } else if (point.balance < 200) {
            color = '#f1c40f'; // Yellow
        } else {
            color = '#27ae60'; // Green
        }

        // Draw point every 7 days (weekly markers)
        if (index % 7 === 0) {
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw date label
            ctx.fillStyle = '#666';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            const dateLabel = point.date.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
            ctx.fillText(dateLabel, x, height - 5);
        }
    });

    // Draw current balance label
    const lastPoint = balanceData[balanceData.length - 1];
    const lastX = width - padding.right;
    const lastY = padding.top + chartHeight - ((lastPoint.balance - yMin) / yRange * chartHeight);

    ctx.fillStyle = lastPoint.balance < 0 ? '#e74c3c' : (lastPoint.balance < 200 ? '#f1c40f' : '#27ae60');
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(formatCurrency(lastPoint.balance), lastX + 5, lastY - 8);
}

/**
 * Navigate calendar by weeks
 */
function navigateCalendar(direction) {
    calendarWeekOffset += direction;
    renderCalendar();
}

/**
 * Reset calendar to today
 */
function goToToday() {
    calendarWeekOffset = 0;
    renderCalendar();
}

/**
 * Render expense lists by category
 */
function renderExpenseLists() {
    const monthlyList = document.getElementById('monthly-expenses');
    const weeklyList = document.getElementById('weekly-expenses');
    const flexList = document.getElementById('flex-expenses');
    const yearlyList = document.getElementById('yearly-expenses');

    const expenseData = getExpenses();
    const incomeData = getIncome();
    const flexData = getFlexExpenses();

    // Monthly expenses
    const monthlyExpenses = expenseData.filter(e => e.frequency === 'monthly');
    monthlyList.innerHTML = monthlyExpenses.map(e => `
        <li>
            <div>
                <span class="name">${e.name}</span>
                <span class="details">Day ${e.dayOfMonth}</span>
            </div>
            <span class="amount">${formatCurrency(e.amount)}</span>
        </li>
    `).join('') || '<li>No monthly expenses</li>';

    // Weekly expenses (including every-n-weeks)
    const weeklyExpenses = expenseData.filter(e =>
        e.frequency === 'weekly' || e.frequency === 'every-n-weeks'
    );
    weeklyList.innerHTML = weeklyExpenses.map(e => {
        let details = e.frequency === 'weekly'
            ? `Every ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][e.dayOfWeek]}`
            : `Every ${e.intervalWeeks} weeks`;
        return `
            <li>
                <div>
                    <span class="name">${e.name}</span>
                    <span class="details">${details}</span>
                </div>
                <span class="amount">${formatCurrency(e.amount)}</span>
            </li>
        `;
    }).join('') || '<li>No weekly expenses</li>';

    // Flex expenses (one-time planned expenses with specific dates)
    flexList.innerHTML = flexData.map(e => {
        const dateStr = e.date ? e.date.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) : 'TBD';
        return `
            <li>
                <div>
                    <span class="name">${e.name}</span>
                    <span class="details">${dateStr}</span>
                </div>
                <span class="amount">${formatCurrency(e.amount)}</span>
            </li>
        `;
    }).join('') || '<li>No flex expenses configured</li>';

    // Yearly expenses
    const yearlyExpenses = expenseData.filter(e => e.frequency === 'yearly');
    yearlyList.innerHTML = yearlyExpenses.map(e => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `
            <li>
                <div>
                    <span class="name">${e.name}</span>
                    <span class="details">${months[e.month - 1]} ${e.dayOfMonth}</span>
                </div>
                <span class="amount">${formatCurrency(e.amount)}</span>
            </li>
        `;
    }).join('') || '<li>No yearly expenses</li>';

    // Add income to monthly list if exists
    if (incomeData.length > 0) {
        const incomeHtml = incomeData.map(i => `
            <li class="income-item">
                <div>
                    <span class="name">${i.name}</span>
                    <span class="details">Day ${i.dayOfMonth}</span>
                </div>
                <span class="amount">+${formatCurrency(i.amount)}</span>
            </li>
        `).join('');
        monthlyList.innerHTML += incomeHtml;
    }
}

/**
 * Calculate and display summary totals
 */
function calculateSummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = addDays(today, 35);

    const expenseData = getExpenses();
    const incomeData = getIncome();
    const savingsData = getSavings();
    const flexData = getFlexExpenses();
    const accountData = getAccounts();

    // Calculate total expenses in next 5 weeks (excluding paid items)
    let totalExpenses = 0;
    expenseData.forEach(expense => {
        const occurrences = getExpenseOccurrences(expense, today, endDate);
        occurrences.forEach(o => {
            const dateKey = o.date.toISOString().split('T')[0];
            if (!isItemPaid('expense', o.name, dateKey)) {
                totalExpenses += o.amount;
            }
        });
    });

    // Add flex expenses that fall within the date range (excluding paid and savings category)
    let totalFlexSavings = 0;
    flexData.forEach(e => {
        if (e.date && e.date >= today && e.date <= endDate) {
            const dateKey = e.date.toISOString().split('T')[0];
            if (!isItemPaid('flex', e.name, dateKey)) {
                if (e.category && e.category.toLowerCase() === 'savings') {
                    // Savings category adds to income
                    totalFlexSavings += e.amount || 0;
                } else {
                    // Other flex items are expenses
                    totalExpenses += e.amount || 0;
                }
            }
        }
    });

    // Calculate total income in next 5 weeks (excluding received items)
    let totalIncome = 0;
    incomeData.forEach(incomeItem => {
        const occurrences = getIncomeOccurrences(incomeItem, today, endDate);
        occurrences.forEach(o => {
            const dateKey = o.date.toISOString().split('T')[0];
            if (!isItemPaid('income', o.name, dateKey)) {
                totalIncome += o.amount;
            }
        });
    });

    // Add flex savings to total income
    totalIncome += totalFlexSavings;

    // Include unconfirmed rollover items from the past 14 days
    const pendingItems = getPendingItems();
    pendingItems.forEach(p => {
        if (p.type === 'expense') totalExpenses += p.item.amount;
        else if (p.type === 'income') totalIncome += p.item.amount;
        else if (p.type === 'flex') {
            if (p.item.category && p.item.category.toLowerCase() === 'savings') {
                totalIncome += p.item.amount;
            } else {
                totalExpenses += p.item.amount;
            }
        }
    });

    // Get savings balance from savings tab
    const totalSavings = savingsData.reduce((sum, s) => sum + (s.currentAmount || s.monthlyAmount || 0), 0);

    // Calculate projected balance
    const currentBalance = accountData.reduce((sum, a) => sum + a.balance, 0);
    const projectedBalance = currentBalance + totalIncome - totalExpenses;

    // Update UI
    document.getElementById('total-income').textContent = formatCurrency(totalIncome);
    document.getElementById('total-expenses').textContent = formatCurrency(totalExpenses);
    document.getElementById('total-savings').textContent = formatCurrency(totalSavings);
    document.getElementById('projected-balance').textContent = formatCurrency(projectedBalance);

    // Color projected balance based on value
    const balanceEl = document.getElementById('projected-balance');
    if (projectedBalance < 0) {
        balanceEl.style.color = '#e74c3c';
    } else if (projectedBalance < 500) {
        balanceEl.style.color = '#f39c12';
    } else {
        balanceEl.style.color = '#27ae60';
    }
}

/**
 * Update last updated timestamp
 */
function updateTimestamp() {
    const el = document.getElementById('last-updated');
    el.textContent = new Date(lastUpdated).toLocaleString('en-IE', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
}

/**
 * Render all components
 */
function renderAll() {
    renderAccounts();
    renderCalendar();
    renderExpenseLists();
    calculateSummary();
    updateTimestamp();
}

/**
 * Initialize the application
 */
async function init() {
    // Load paid items from localStorage
    loadPaidItems();

    // Show loading state
    const container = document.querySelector('.container');
    container.classList.add('loading');

    try {
        // Try to load from Google Sheets
        await loadFromGoogleSheets();
    } catch (error) {
        console.warn('Failed to load from Google Sheets, using local data:', error);
    }

    // Render with whatever data we have
    renderAll();
    container.classList.remove('loading');

    // Update data source indicator
    if (dataLoadedFromSheets) {
        const footer = document.querySelector('footer');
        const indicator = document.createElement('p');
        indicator.className = 'data-source';
        indicator.innerHTML = '✓ Synced with Google Sheets';
        indicator.style.color = '#27ae60';
        footer.insertBefore(indicator, footer.firstChild);
    }

    // Set up calendar navigation
    document.getElementById('prev-week').addEventListener('click', () => navigateCalendar(-1));
    document.getElementById('next-week').addEventListener('click', () => navigateCalendar(1));
    document.getElementById('today-btn').addEventListener('click', goToToday);

    // Redraw chart on window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(renderBalanceChart, 100);
    });
}

// Run on page load
document.addEventListener('DOMContentLoaded', init);
