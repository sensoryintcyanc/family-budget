# Budget Tracker – Project Context for Claude

## What This Is
A local family budget tracker webpage that pulls live data from Google Sheets and displays a 5-week rolling financial overview. No framework — plain HTML, CSS, and vanilla JS. Must be served via a local HTTP server (not opened as a file directly) due to CORS restrictions on the Google Sheets fetch calls.

## How to Run
```bash
cd ~/Desktop/Budget\ Tracker
python3 -m http.server 8080
```
Then open: `http://localhost:8080`

---

## Project Files

| File | Purpose |
|------|---------|
| `index.html` | Main page structure |
| `styles.css` | All styling, CSS variables, calendar layout |
| `app.js` | All application logic — data fetching, rendering, chart |
| `budget-data.js` | Google Sheets config (URLs, GIDs) + fallback hardcoded data |
| `CLAUDE.md` | This file |

---

## Google Sheets Integration

**Sheet URL base** (in `budget-data.js`):
```
https://docs.google.com/spreadsheets/d/e/2PACX-1vQ2NJPOV1W2uaT5N2AkzUfMzc7x3HWFjCJsxNVNkTOGl1aszR8Gov42AFMAOXFoXM61OTbmUdxQEBg8/pub?output=csv
```

**Tab GIDs** (in `budget-data.js → SHEET_GIDS`):
| Tab | GID |
|-----|-----|
| Accounts | 0 |
| Expenses | 1857018512 |
| Income | 1941434530 |
| Savings | 1489417062 |
| Flex | 1845212077 |

URLs are cache-busted with `&_t=${Date.now()}` on every fetch.

---

## Google Sheets Tab Structures

### Accounts tab
Columns: `name`, `balance`, `type`, `last_updated`
- `balance` may be formatted as `€4,576.99` — parsed by `parseNumber()`
- `last_updated` is parsed by `parseLastUpdated()` and displayed as relative time ("2 hours ago") on the account card
- If `last_updated` is more than 2 days old, it turns red (`.stale` class)

### Expenses tab
Columns: `name`, `amount`, `frequency`, `day_of_month`, `day_of_week`, `interval_weeks`, `start_date`, `month`, `category`
- `frequency` values: `monthly`, `weekly`, `every-n-weeks`, `yearly`

### Income tab
Columns: `name`, `amount`, `frequency`, `day_of_month`

### Savings tab
Columns: `name`, `monthly_amount`, `target_amount`, `current_amount`

### Flex tab
Columns: `name`, `amount`, `category`, `date`
- `date` format: `M/D` (e.g. `2/27`) or `YYYY-MM-DD`
- If date has already passed, `parseFlexDate()` assumes next year
- **Special rule:** if `category` is `savings`, the item is treated as **income** (adds to running balance) and shown in teal (`#0d9384`) with a `+` prefix. All other categories are treated as expenses (subtracts from balance) and shown in purple.

---

## Key Features & Behaviours

### Calendar
- Displays 6 rows × 7 days starting from Sunday of the current week
- Week navigation: Prev / Today / Next buttons (`calendarWeekOffset` variable)
- Each day shows: income items (green, `+` prefix), expenses (red/category-coloured), flex items (purple or teal)
- Running balance shown at the bottom of each future day, colour-coded:
  - Green: > €500
  - Orange: €0–€500
  - Red: < €0

### Paid / Received Toggle
- Click any calendar item to mark it as paid (expenses/flex) or received (income)
- Paid items: grey background, strikethrough, 50% opacity
- Paid items are **excluded from the running balance**
- State persisted to `localStorage` under key `budgetTracker_paidItems`
- Auto-cleans entries older than 60 days on load
- Key format: `{type}_{name}_{dateKey}` e.g. `expense_Rent_2026-02-28`

### Running Balance Calculation
- Starts from total of all account balances
- Walks forward day by day from today
- Adds: `income + flexSavings` — Subtracts: `expenses + flex`
- Paid/received items are skipped in all calculations
- Pre-calculates balance up to `viewStart` when navigated to a future week

### Summary Cards (top of page)
- **Expected Income**: sum of all unpaid income occurrences in next 35 days + flex items with category `savings`
- **Expected Expenses**: sum of all unpaid expense occurrences in next 35 days + non-savings flex items in range
- **Projected Balance**: `currentAccountBalance + totalIncome - totalExpenses`
- **Savings**: sum of `currentAmount` (falls back to `monthlyAmount`) from Savings tab

### Balance Line Chart
- Canvas-based, 200px tall, rendered below the calendar
- Shows daily running balance for the next 35 days
- Background zones: green (>€200), yellow (€0–€200), red (<€0)
- Dashed reference lines at €0 and €200 with labels
- Weekly dot markers colour-coded by zone
- End balance label shown on right
- Redraws on window resize (debounced 100ms)
- Respects paid item state (same logic as calendar)

---

## CSS Variables (in `styles.css :root`)
```css
--primary-color: #2c3e50
--secondary-color: #3498db
--success-color: #27ae60
--warning-color: #f39c12
--danger-color: #e74c3c
--flex-color: #a43ce7          /* purple – flex expenses */
--flex-savings-color: #0d9384  /* teal – flex savings/income */
--expense-color: #e74c3c
--grocery-color: #e7843c
```

---

## Known Quirks / Watch Out For
- `parseNumber()` strips `€`, `$`, `£` and handles both `1,234.56` (US) and `1.234,56` (European) formats
- The fallback data in `budget-data.js` is used if Google Sheets fetch returns 0 rows — useful for offline testing
- `renderCalendar()` calls `renderBalanceChart()` at the end, so the chart always stays in sync
- `calculateSummary()` must be kept in sync with the balance logic in `renderCalendar()` and `renderBalanceChart()` — all three implement the same income/expense/flex-savings split logic
- The Savings card label was customised to "Ally Savings" in `index.html`
