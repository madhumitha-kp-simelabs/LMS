-- Feedback on how the course was taught, not only on what was in it.
--
-- Nullable like the other two dimensions: feedback left before this existed has
-- only the overall score, and asking those candidates to come back and fill in
-- the rest is not worth losing what they already said.
ALTER TABLE "course_feedback" ADD COLUMN     "trainerRating" INTEGER;
