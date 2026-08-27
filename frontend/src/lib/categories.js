import { useState } from 'react';

/**
 * Grouping courses by category, for the four screens that show a course list.
 *
 * They all group the same way on purpose. A lead who learns the catalogue's
 * order and then opens their own list should find the same shape, not a second
 * arrangement to learn — so the ordering rule lives here once rather than being
 * re-decided in each page.
 */

/** The bucket for courses nobody has filed yet. Not an error, just a state. */
export const UNCATEGORISED = {
  id: null,
  name: 'Uncategorised',
  // Sorts after every real category, however many get added later.
  position: Number.MAX_SAFE_INTEGER,
};

/**
 * Splits courses into `{ category, courses }` groups in display order.
 *
 * Empty categories are dropped: a heading with nothing under it is a promise
 * the page does not keep. The catalogue passes `keepEmpty` because an
 * administrator filing courses needs to see the category they are filing into,
 * even before anything is in it.
 */
export function groupByCategory(courses, { all = [], keepEmpty = false } = {}) {
  const groups = new Map();

  // Seeded from the full category list first, so the order comes from
  // `position` rather than from whichever course happened to load first.
  for (const category of [...all].sort((a, b) => a.position - b.position)) {
    groups.set(category.id, { category, courses: [] });
  }

  for (const course of courses) {
    const category = course.category ?? UNCATEGORISED;
    if (!groups.has(category.id)) groups.set(category.id, { category, courses: [] });
    groups.get(category.id).courses.push(course);
  }

  return [...groups.values()]
    .filter((group) => keepEmpty || group.courses.length > 0)
    .sort((a, b) => a.category.position - b.category.position);
}

/**
 * A stable colour per category, so the same subject looks the same on every
 * screen. Hashed from the id rather than stored: a colour column would be one
 * more thing to set when adding a category, and a wrong-looking colour is not
 * worth a form field.
 */
const TONES = ['indigo', 'sky', 'violet', 'amber', 'green', 'rose', 'slate'];

export function toneForCategory(category) {
  if (!category?.id) return 'slate';

  let hash = 0;
  for (const char of category.id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return TONES[Math.abs(hash) % TONES.length];
}

/**
 * Which category sections are folded shut, remembered per browser.
 *
 * Kept in localStorage rather than in React state alone because the shape you
 * leave a long catalogue in is the shape you expect to come back to — folding
 * the same four sections away on every visit is not a feature.
 *
 * Every read and write is wrapped: a private window, cleared site data, or a
 * browser set to block storage all throw here, and none of them are a reason
 * for the page not to render.
 */
export function useCollapsedCategories(storageKey) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return new Set(saved ? JSON.parse(saved) : []);
    } catch {
      return new Set();
    }
  });

  const persist = (next) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
    setCollapsed(next);
  };

  /** Uncategorised has no id, so it needs a key of its own to be remembered. */
  const keyOf = (category) => category.id ?? 'uncategorised';

  return {
    isOpen: (category) => !collapsed.has(keyOf(category)),
    toggle: (category) => {
      const key = keyOf(category);
      const next = new Set(collapsed);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persist(next);
    },
    allOpen: collapsed.size === 0,
    openAll: () => persist(new Set()),
    closeAll: (categories) => persist(new Set(categories.map(keyOf))),
  };
}
