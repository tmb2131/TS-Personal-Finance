# Mobile UI Recommendations

Recommendations to make the mobile experience polished and surface only the most relevant insights.

**Implemented (current):**
- Safe area padding for bottom nav and main content on mobile (notch/home indicator).
- Bottom nav: 4 primary items (Key Insights, Dashboard, Accounts, More); "More" opens a bottom sheet with Kids Accounts, Analysis, Recurring.
- Dashboard in-page nav: shorter labels on mobile (Net Worth, Budget, Annual, Monthly); smaller icons and gap.
- Annual and Monthly Trends: mobile-only note “Full category table on larger screens” so behaviour is clear.
- **Collapsible Expenses on mobile:** Budget section shows Budget Tracker + Income by default; Expenses card is collapsed with "Show breakdown" / "Hide" so the default view is summary-only.
- **At a glance strip (mobile only):** Three compact cards at the top—Net Worth (latest year total), Budget (Under/Over + amount), Income vs Expenses (totals)—each tappable to scroll to the relevant section.

---

## 1. **Dashboard: Summary-first, less scroll** (High impact)

**Current:** Full desktop layout on mobile — Net Worth, Income vs Expenses, full Budget (Tracker + Income + Expenses tables), Annual Trends (summary cards + table hidden), Monthly Trends (summary cards + table hidden). Long scroll.

**Recommendations:**
- **At a glance strip (mobile only):** Optional top section with 3–4 key numbers only (e.g. Net worth, Budget status, Income vs Expenses) as compact cards that link/scroll to the corresponding section.
- **Condense in-page nav:** Keep the 4 jump buttons (Net Worth, Budget, Annual, Monthly) but on mobile use a single row of icons or 2×2 grid with shorter labels to save vertical space.
- **Budget on mobile:** Keep Budget Tracker + Income cards (already compact). Consider making the Expenses table collapsible (“Show expenses breakdown”) so the default view is summary-only.
- **Trends on mobile:** Summary cards are already shown; tables are hidden. Add a short line under each: “Full category table on larger screens” so the behaviour is clear.

**Files:** `app/page.tsx`, `components/dashboard/dashboard-navigation.tsx`, `components/dashboard/budget-table.tsx`.

---

## 2. **Safe area and touch targets** (Quick win)

**Current:** `main` has `pb-44 md:pb-6` for the bottom nav. On notched devices the nav can sit in the safe area.

**Recommendations:**
- Add safe-area padding so the bottom nav and content clear the notch/home indicator: e.g. `pb-[max(11rem,env(safe-area-inset-bottom)+6rem)]` on `main` for mobile, or use `env(safe-area-inset-bottom)` in the nav container.
- Ensure tappable targets (nav items, buttons, cards) are at least 44×44px. Bottom nav items already use `min-h-[72px]`; keep that or similar.

**Files:** `app/layout.tsx`, `components/sidebar.tsx`.

---

## 3. **Bottom navigation** (Medium effort)

**Current:** 6 items in a 3-column grid (Key Insights, Dashboard, Accounts, Kids, Analysis, Recurring). Works but can feel tight.

**Recommendations:**
- **Option A:** Keep 6 items; ensure spacing and touch targets are comfortable; consider slightly smaller labels on very small screens.
- **Option B:** Reduce to 4 primary items (e.g. Key Insights, Dashboard, Accounts, More). “More” opens a sheet/drawer with Kids, Analysis, Recurring. Fewer taps for main flows, detail in “More”.

**Files:** `components/sidebar.tsx`.

---

## 4. **Surfacing “most relevant” insights on mobile** (High impact)

**Recommendations:**
- **Dashboard:** Order sections by relevance on mobile: e.g. Net Worth → Income vs Expenses → Budget summary (Tracker + Income; Expenses collapsible) → Annual summary cards → Monthly summary cards. No change to data, just order and what’s expanded by default.
- **Key Insights:** On mobile, show a single column; consider “Top 3” insights first with “See all” to expand or navigate.
- **Accounts / Kids:** Tables are now visible on mobile (we fixed `hidden md:block`). Keep horizontal scroll and consider sticky column(s) for the first column if needed.

---

## 5. **Charts and dense tables on mobile** (Ongoing)

**Current:** Charts use `isMobile` for height/font size; some tables are `hidden md:block` (e.g. Annual/Monthly trend tables).

**Recommendations:**
- Keep trend tables hidden on small screens; summary cards are enough. Optionally add horizontal scroll for a minimal table (e.g. top 5 categories) instead of full table.
- Charts: keep responsive height and readable axis labels; avoid tiny fonts.

---

## 6. **Header and global chrome** (Quick win)

**Current:** Header has currency toggle, refresh, sync; some labels hidden on small screens.

**Recommendations:**
- On mobile, keep only essential actions (e.g. refresh, currency if used often). Move “Sync” or secondary actions to a menu or dashboard-only.
- Ensure header is sticky and doesn’t take too much vertical space so content is prominent.

**Files:** `components/header.tsx`.

---

## Implementation priority

| Priority | Item                                      | Effort   | Impact   |
|----------|-------------------------------------------|----------|----------|
| 1        | Safe area padding for bottom nav          | Low      | High     |
| 2        | Dashboard: condensed nav, optional collapse for Expenses | Medium | High     |
| 3        | “Full table on larger screens” for trends | Low      | Medium   |
| 4        | Bottom nav: 4 items + “More” (optional)   | Medium   | Medium   |
| 5        | Key Insights mobile “Top 3” (optional)    | Medium   | Medium   |

Implementing **safe area padding** and **dashboard mobile tweaks** (condensed nav + “Full table on larger screens”) gives the biggest improvement for the least change.
