# Full Table View

## Scope

- **Tables:** Annual Trends, Monthly Trends, Budget (Expenses).
- **Activation:** Per-table toggle in each card header: "Full table view" opens the table in a pop-out overlay; "Default view" returns to the normal in-page table.

## Behavior

- **Default view:** Table is shown in place as usual (scrollable within the card, same density and styling).
- **Full table view:** When toggled on, the table appears in a **pop-out** overlay: dimmed backdrop, centered card (rounded, shadow). Table **keeps its column widths and styles**; only font size and row height are reduced (11px text, ~28px rows) so more fits on screen. A "Default view" button on the card closes the overlay. Clicking the backdrop also closes.

## Implementation

- `FullTableViewToggle`: Button that shows "Full table view" or "Default view" with maximize/minimize icon.
- `FullTableViewWrapper`: When `fullView` is true, renders children in a pop-out (backdrop + centered card) with denser table styling applied via wrapper classes. When false, renders children in place with optional `className`.
