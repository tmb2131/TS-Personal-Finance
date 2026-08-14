import * as React from "react"

import { cn } from "@/utils/cn"

/**
 * Tables carry most of this app's information, so they get the most attention.
 *
 * Three rules do the work:
 *  - the header is a band, not a row with a rule under it, so a long table
 *    still tells you what column you are in when it is stuck to the top;
 *  - rows are separated by an inset hairline rather than a full-bleed one,
 *    which keeps the eye travelling along the row instead of across the grid;
 *  - `numeric` on a cell is the single switch for right-alignment plus tabular
 *    figures, so a currency column cannot end up left-aligned in one table and
 *    right-aligned in the next.
 */
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { containerClassName?: string }
>(({ className, containerClassName, ...props }, ref) => (
  <div
    data-scroll-region
    className={cn("relative w-full overflow-auto scroll-touch", containerClassName)}
  >
    <table
      ref={ref}
      className={cn("w-full caption-bottom border-collapse text-body", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement> & {
    /** Pin the header while the table body scrolls under it. */
    sticky?: boolean
  }
>(({ className, sticky, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "[&_tr]:border-0",
      sticky && "sticky top-0 z-10 [&_th]:bg-sunken",
      className
    )}
    {...props}
  />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-border-strong bg-sunken font-semibold [&>tr]:border-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-border transition-colors",
      "hover:bg-accent/50 data-[state=selected]:bg-primary-tint",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(({ className, numeric, ...props }, ref) => (
  <th
    ref={ref}
    scope="col"
    className={cn(
      "h-9 whitespace-nowrap bg-sunken px-3 align-middle text-meta font-semibold uppercase tracking-[0.06em] text-muted-foreground",
      "first:rounded-l-md first:pl-4 last:rounded-r-md last:pr-4",
      numeric ? "text-right" : "text-left",
      "[&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(({ className, numeric, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "h-11 px-3 align-middle first:pl-4 last:pr-4",
      numeric && "num text-right",
      "[&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-3 text-meta text-muted-foreground", className)} {...props} />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
