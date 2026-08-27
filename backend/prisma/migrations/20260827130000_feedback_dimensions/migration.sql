-- Feedback splits into the parts a lead can act on. Nullable: entries left
-- before the split keep their overall rating and simply have no breakdown,
-- which is better than dropping them or inventing numbers for them.
ALTER TABLE "course_feedback" ADD COLUMN     "contentRating" INTEGER,
ADD COLUMN     "durationRating" INTEGER;
