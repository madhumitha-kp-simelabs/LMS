-- A quiz's questions become a bank, and this is how many of them one sitting
-- draws. Null keeps the existing behaviour — serve everything — so no quiz
-- written before now changes shape.
ALTER TABLE "quizzes" ADD COLUMN     "questionsPerAttempt" INTEGER;
