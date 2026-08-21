/**
 * Small shared primitives.
 *
 * Colour carries fixed meaning throughout the app, so it stays readable rather
 * than decorative:
 *
 *   indigo   primary actions, the brand, anything "current"
 *   sky      reading material — files, documents, slides
 *   violet   quizzes and questions
 *   emerald  success — passed, correct, published
 *   amber    outstanding — to do, draft, partially right
 *   rose     failure — wrong answers, destructive actions
 *   slate    neutral chrome and secondary text
 */

export function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  const styles = {
    primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50',
    subtle: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
    danger: 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50',
  }[variant];

  // A prop rather than a px-* override through className: Tailwind emits px-4
  // after px-3, so a smaller padding passed in silently loses to the base one.
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
  }[size];

  return (
    <button
      className={`rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${sizes} ${styles} ${className}`}
      {...props}
    />
  );
}

export function Input({ label, error, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <input
        className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${className}`}
        {...props}
      />
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

export function Select({ label, className = '', children, ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <select
        className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Textarea({ label, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <textarea
        rows={3}
        className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Card({ accent, className = '', ...props }) {
  // A 3px top edge in the accent hue — enough to group and signal, not enough
  // to compete with the content.
  const accents = {
    indigo: 'border-t-[3px] border-t-indigo-500',
    sky: 'border-t-[3px] border-t-sky-500',
    violet: 'border-t-[3px] border-t-violet-500',
    emerald: 'border-t-[3px] border-t-emerald-500',
    amber: 'border-t-[3px] border-t-amber-500',
    rose: 'border-t-[3px] border-t-rose-500',
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${
        accent ? accents[accent] : ''
      } ${className}`}
      {...props}
    />
  );
}

export function Alert({ children, tone = 'rose' }) {
  if (!children) return null;

  const tones = {
    rose: 'bg-rose-50 text-rose-800 ring-rose-200',
    amber: 'bg-amber-50 text-amber-900 ring-amber-200',
    indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  }[tone];

  return (
    <p role="alert" className={`rounded-lg px-3 py-2 text-sm ring-1 ${tones}`}>
      {children}
    </p>
  );
}

export function Empty({ children }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-5 py-8 text-center text-sm leading-relaxed text-slate-500">
      {children}
    </p>
  );
}

/**
 * A card-framed data table. `headers` is a list of { label, align } — pass an
 * empty label for an actions column that needs no heading.
 */
export function Table({ headers, children }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/60">
            {headers.map((h, index) => (
              <th
                key={h.label || index}
                className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                  h.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </Card>
  );
}

export const Row = ({ children }) => (
  <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">{children}</tr>
);

export const Cell = ({ children, align = 'left', className = '' }) => (
  <td
    className={`px-5 py-3.5 ${align === 'right' ? 'text-right' : ''} ${className}`}
    // Right-aligned cells are numbers; tabular figures keep the columns straight.
    style={align === 'right' ? { fontVariantNumeric: 'tabular-nums' } : undefined}
  >
    {children}
  </td>
);

/** "Priya Menon" -> "PM"; a single name gives one letter. */
export function initials(fullName) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** A name as a coloured disc of initials — faces scan faster than text. */
export function Avatar({ name, tone = 'slate', size = 'md' }) {
  const tones = {
    indigo: 'bg-indigo-100 text-indigo-700',
    sky: 'bg-sky-100 text-sky-700',
    violet: 'bg-violet-100 text-violet-700',
    amber: 'bg-amber-100 text-amber-800',
    slate: 'bg-slate-200 text-slate-600',
  }[tone];

  const sizes = {
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-14 w-14 text-base',
  }[size];

  return (
    <span
      title={name}
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${tones} ${sizes}`}
    >
      {initials(name)}
    </span>
  );
}

export function Badge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  }[tone];

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tones}`}>
      {children}
    </span>
  );
}

/** Score colour by band — used for percentages anywhere they appear. */
export function toneForScore(percentage) {
  if (percentage >= 80) return 'green';
  if (percentage >= 50) return 'amber';
  return 'rose';
}

export function formatBytes(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
