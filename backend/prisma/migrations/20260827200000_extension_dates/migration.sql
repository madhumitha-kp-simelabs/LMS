-- Extensions are asked for as a date, not a number of days: people ask for
-- time because of something with a date on it, and converting to days and back
-- only invites arguments about which day was meant.
--
-- The table is empty, so the columns are replaced outright rather than
-- migrated. If that stops being true, this needs a data step first.
ALTER TABLE "extension_requests" DROP COLUMN "days",
DROP COLUMN "grantedDays",
ADD COLUMN     "requestedUntil" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "grantedUntil" TIMESTAMP(3);
