import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * The app's persistence schema.
 *
 * Scope is deliberately narrow: **user-owned data only.** Congressional records are not stored here and are not
 * mirrored — they stay attributable to Congress.gov, which remains their source of truth (see `docs/data-policy.md`).
 * What lives here is what Congress.gov has no opinion about: which person saved which bill.
 *
 * @see docs/architecture.md's "Persistence Plan" for the ingestion tables this intentionally defers.
 */

/** A registered person. The only identity this app stores, and the owner of every row in {@link savedBills}. */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A user's saved bills.
 *
 * Composite-keyed on the user plus the bill's natural identifier (congress + type + number) rather than a surrogate id.
 * That identifier is already unique and stable under Congress.gov's own scheme, so a surrogate key would add a column
 * without adding a guarantee — and the composite key gives "a user can't save the same bill twice" for free, as a
 * database constraint rather than as application logic that has to remember to check.
 *
 * The secondary index covers the query this table exists to serve: every bill one user saved, newest first.
 */
export const savedBills = pgTable(
  "saved_bills",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Stored as text, matching `BillRouteParams` — these are identifiers, never operands for arithmetic. */
    congress: text("congress").notNull(),
    billType: text("bill_type").notNull(),
    billNumber: text("bill_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.congress, table.billType, table.billNumber] }),
    index("saved_bills_user_created_idx").on(table.userId, table.createdAt),
  ],
);
