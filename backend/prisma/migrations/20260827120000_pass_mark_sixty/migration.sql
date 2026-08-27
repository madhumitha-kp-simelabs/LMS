-- The organisation's pass mark is 60%. The column defaulted to 0, which meant
-- every quiz created so far passes everyone who sits it.
ALTER TABLE "quizzes" ALTER COLUMN "passPercentage" SET DEFAULT 60;

-- Existing quizzes still on 0 are lifted to the standard. A deliberate 0 and a
-- never-set 0 are indistinguishable in the data, and 0 is not a pass mark
-- anybody means — it is the absence of one. Quizzes with any other value were
-- set on purpose and are left alone.
UPDATE "quizzes" SET "passPercentage" = 60 WHERE "passPercentage" = 0;
