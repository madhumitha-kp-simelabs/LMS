/**
 * JSON.stringify throws on BigInt, and Prisma returns BigInt for our file-size
 * column. File sizes are far below Number.MAX_SAFE_INTEGER, so emitting them as
 * numbers is lossless and keeps every route from having to convert by hand.
 *
 * Imported once for its side effect, from app.js.
 */
BigInt.prototype.toJSON = function toJSON() {
  return Number(this);
};
