import {
  type ExtraConfigColumn,
  type PrimaryKeyBuilder,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** User-owned data only. Authoritative congressional records stay attributable to Congress.gov. */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Join table for a user's saved bills. Composite-keyed on the bill's natural identifier (congress + type + number)
 * rather than a surrogate id, since that identifier is already unique and stable per Congress.gov's own scheme.
 */
export const savedBills = pgTable(
  "saved_bills",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    congress: text("congress").notNull(),
    billType: text("bill_type").notNull(),
    billNumber: text("bill_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table: {
    userId: ExtraConfigColumn;
    congress: ExtraConfigColumn;
    billType: ExtraConfigColumn;
    billNumber: ExtraConfigColumn;
    createdAt: ExtraConfigColumn;
  }): PrimaryKeyBuilder[] => [
    primaryKey({ columns: [table.userId, table.congress, table.billType, table.billNumber] }),
  ],
);
