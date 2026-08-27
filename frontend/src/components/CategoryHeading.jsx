import { toneForCategory } from '../lib/categories';

/**
 * The heading above one category's courses, on the screens that group them.
 *
 * Shared rather than copied because the whole point of grouping is that the
 * same subject looks the same wherever you meet it — a lead who learns the
 * shape on their own list should recognise it on the browse page.
 *
 * A coloured rule rather than a big title: these sit between grids of cards,
 * and a heavy heading competes with the cards it is meant to organise.
 *
 * Pass `onToggle` to make the whole heading a fold control. Without it the
 * heading stays a plain label, so a page with two categories is not given
 * machinery it has no use for.
 */
const RULES = {
  indigo: 'bg-indigo-400',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
  amber: 'bg-amber-400',
  green: 'bg-emerald-400',
  rose: 'bg-rose-400',
  slate: 'bg-slate-300',
};

export default function CategoryHeading({ category, count, open = true, onToggle }) {
  const rule = RULES[toneForCategory(category)];

  const inside = (
    <>
      {onToggle && (
        // Rotated rather than swapped for a second glyph, so the change reads
        // as the same control moving instead of two different ones.
        <svg
          viewBox="0 0 12 12"
          className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${
            open ? 'rotate-90' : ''
          }`}
          aria-hidden
        >
          <path d="M4 2.5 L8 6 L4 9.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}

      <span className={`h-4 w-1 shrink-0 rounded-full ${rule}`} aria-hidden />
      <h2 className="text-sm font-semibold text-slate-900">{category.name}</h2>

      {count != null && (
        <span className="text-xs text-slate-500">
          {count} course{count === 1 ? '' : 's'}
          {/* Only worth saying while it is hidden — the courses themselves say
              it the rest of the time. */}
          {!open && <span className="text-slate-400"> · hidden</span>}
        </span>
      )}

      {/* Fills the rest of the row so the heading reads as a divider between
          groups rather than a label floating above the first card. */}
      <span className="h-px flex-1 bg-slate-200" aria-hidden />
    </>
  );

  if (!onToggle) return <div className="flex items-center gap-3">{inside}</div>;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="group flex w-full items-center gap-3 rounded-lg py-1 text-left transition hover:bg-slate-50"
    >
      {inside}
    </button>
  );
}
