import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error.js';

/**
 * Course categories — Frontend, Backend, UI/UX, Project Management.
 *
 * Reading them is open to anyone signed in: the grouping shows on the
 * catalogue, on a lead's own list and on the candidate's browse page, so every
 * role needs the list. Changing them is an administrator's, because a category
 * is a fact about how the organisation is arranged rather than about any one
 * course, and a lead renaming one would move courses they do not run.
 */

/** A URL-safe stable key, so a category survives being renamed. */
const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Names are unique; say so plainly rather than letting the constraint 500. */
async function assertNameFree(name, exceptId) {
  const clash = await prisma.category.findFirst({
    // Case-insensitive: "Frontend" and "frontend" are the same category to
    // everyone except Postgres, and two of them in a grouped list is a bug the
    // person who typed it cannot see the cause of.
    where: { name: { equals: name, mode: 'insensitive' } },
  });
  if (clash && clash.id !== exceptId) {
    throw new AppError(409, `There is already a category called “${clash.name}”`);
  }
}

/** Every category, in display order, with how many courses each holds. */
export async function list() {
  const categories = await prisma.category.findMany({
    orderBy: { position: 'asc' },
    include: { _count: { select: { courses: true } } },
  });

  return categories.map(({ _count, ...category }) => ({
    ...category,
    courses: _count.courses,
  }));
}

export async function create({ name }) {
  await assertNameFree(name);

  // Appended, like topics and projects — the caller should not have to work out
  // where the end of the list is.
  const last = await prisma.category.findFirst({
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  return prisma.category.create({
    data: { name, slug: slugify(name), position: (last?.position ?? 0) + 1 },
  });
}

export async function update(categoryId, { name, position }) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new AppError(404, 'Category not found');

  if (name) await assertNameFree(name, categoryId);

  return prisma.category.update({
    where: { id: categoryId },
    // The slug follows the name, so a category renamed from a typo does not
    // keep the typo in its key for ever.
    data: { ...(name && { name, slug: slugify(name) }), ...(position != null && { position }) },
  });
}

/**
 * Removing a category. The courses in it are not removed with it — the foreign
 * key is SetNull, so they come back as uncategorised and can be filed again.
 *
 * The count goes back to the caller so the screen can say what just happened
 * rather than leaving somebody to notice later that four courses moved.
 */
export async function remove(categoryId) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { _count: { select: { courses: true } } },
  });
  if (!category) throw new AppError(404, 'Category not found');

  await prisma.category.delete({ where: { id: categoryId } });
  return { unfiled: category._count.courses };
}
