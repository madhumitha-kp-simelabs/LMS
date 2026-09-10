-- Topics are no longer published.
--
-- Publishing a topic was a second gate in front of a candidate, behind
-- allotment: a topic could be written, allotted to three people and still reach
-- none of them because nobody had released it. Allotment is the only gate now
-- — a topic is available to whoever it has been handed to.
--
-- Everything already allotted stays allotted; dropping the column simply stops
-- unpublished topics being filtered out of the lists that carried them.
ALTER TABLE "topics" DROP COLUMN "isPublished";
