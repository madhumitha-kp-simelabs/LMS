import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, Empty, Input, Select, Textarea } from '../../components/ui';
import { groupByCategory, toneForCategory, useCollapsedCategories } from '../../lib/categories';
import CategoryHeading from '../../components/CategoryHeading';
import DeleteCourse from './DeleteCourse';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The course catalogue: what courses exist, and what they are called.
 *
 * Creating one takes a code and a title and nothing else. Who runs it is
 * decided on the allotment page; the lead allotted to it then fills in the
 * duration, description, topics, material and quizzes.
 */
export default function AdminCourses() {
  const [courses, setCourses] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([api('/courses'), api('/categories')])
        .then(([{ courses }, { categories }]) => {
          setCourses(courses);
          setCategories(categories);
        })
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  /** Runs a write, refreshes the list, then reports the outcome. */
  async function run(request, done) {
    setBusy(true);
    setNotice(null);
    try {
      await request();
      await load();
      setNotice({ tone: 'indigo', text: done });
      return true;
    } catch (err) {
      setNotice({
        tone: 'rose',
        // A 422 carries the per-field reasons; "Validation failed" on its own
        // says nothing about which box is wrong.
        text: err.details?.length ? err.details.map((d) => d.message).join(' · ') : err.message,
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const create = ({ code, title, version, categoryId }) =>
    run(
      () =>
        api('/admin/courses', {
          method: 'POST',
          body: {
            code,
            title,
            version: Number(version) || 1,
            categoryId: categoryId || null,
          },
        }),
      `${code} v${Number(version) || 1} added. Allot it to a lead when you are ready.`,
    );

  const removeCourse = async (course, files) => {
    await load();
    setNotice({
      tone: 'indigo',
      text: `${course.code} v${course.version} deleted${files > 0 ? `, along with ${files} stored file${files === 1 ? '' : 's'}` : ''}.`,
    });
  };

  /**
   * Copying a course into its next version.
   *
   * Confirmed first: it is not destructive, but it produces a whole second
   * course, and somebody who clicked it by accident would find one they then
   * have to work out how to remove.
   */
  const duplicate = (course) => {
    if (
      !window.confirm(
        `Copy ${course.code} v${course.version} — its topics, material, quizzes and project briefs — into a new version? Nobody on the current one is affected.`,
      )
    ) {
      return Promise.resolve(false);
    }

    return run(async () => {
      const { course: copy } = await api(`/courses/${course.id}/duplicate`, { method: 'POST' });
      return copy;
    }, `${course.code} copied to v${course.version + 1}. It starts as a draft — revise it, then publish.`);
  };

  const addCategory = (name) =>
    run(() => api('/categories', { method: 'POST', body: { name } }), `"${name}" added.`);

  const renameCategory = (category, name) =>
    run(
      () => api(`/categories/${category.id}`, { method: 'PATCH', body: { name } }),
      `"${category.name}" is now "${name}".`,
    );

  /** The courses inside survive as uncategorised, so say how many moved. */
  const removeCategory = (category) =>
    run(async () => {
      const { unfiled } = await api(`/categories/${category.id}`, { method: 'DELETE' });
      return unfiled;
    }, `"${category.name}" removed.${category.courses > 0 ? ` ${plural(category.courses, 'course')} moved to Uncategorised.` : ''}`);

  /**
   * Editing a course record: code, title, description, duration. Only an admin
   * may change a code — it identifies the course to candidates and is quoted
   * outside the system — and the API enforces that; here it is one form.
   */
  const saveCourse = (course, fields) =>
    run(
      () => api(`/courses/${course.id}`, { method: 'PATCH', body: fields }),
      `${fields.code ?? course.code} updated.`,
    );

  if (error) {
    return (
      <div>
        <Heading />
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      </div>
    );
  }

  if (!courses) return <p className="text-sm text-slate-500">Loading courses…</p>;

  const unallotted = courses.filter((c) => !c.owner).length;

  return (
    <div>
      <Heading />

      <div className="mt-8 space-y-6">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

        {/* Side by side: adding a course and filing it under something are the
            same job, and the form was stretching a title box across a whole
            wide screen to be alone on its row. `items-start` so each keeps its
            own height — Categories grows tall when Manage is open, and pinning
            the form to match would leave it half empty. */}
        <div className="grid gap-6 items-start lg:grid-cols-[3fr_2fr]">
          <NewCourseForm busy={busy} categories={categories} onCreate={create} />

          <CategoryManager
            categories={categories}
            busy={busy}
            onAdd={addCategory}
            onRename={renameCategory}
            onRemove={removeCategory}
          />
        </div>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">All courses</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {plural(courses.length, 'course')}
            {unallotted > 0 && (
              <>
                {' · '}
                <Link to="/admin/allotment" className="font-medium text-amber-700 hover:underline">
                  {unallotted} waiting to be allotted
                </Link>
              </>
            )}
          </p>

          <div className="mt-4">
            <CourseCatalogue
              courses={courses}
              categories={categories}
              busy={busy}
              onSave={saveCourse}
              onDuplicate={duplicate}
              onDeleted={removeCourse}
              onError={(text) => setNotice({ tone: 'rose', text })}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

const Heading = () => (
  <div>
    <h1 className="text-2xl font-semibold text-slate-900">Courses</h1>
    <p className="mt-1 text-sm text-slate-500">
      Add a course with its code and title. Allotting it to a lead is the next step, and their team
      builds out the topics, material and quizzes from there. Use “+ Version” on an existing course
      to revise it as a new edition.
    </p>
  </div>
);

function NewCourseForm({ busy, categories, onCreate }) {
  const [form, setForm] = useState({ code: '', title: '', version: '1', categoryId: '' });

  async function handleSubmit(event) {
    event.preventDefault();
    const added = await onCreate(form);
    // The category survives the reset: adding three Frontend courses in a row
    // should not mean picking Frontend three times.
    if (added) setForm({ code: '', title: '', version: '1', categoryId: form.categoryId });
  }

  return (
    <Card accent="indigo">
      <h2 className="text-lg font-semibold text-slate-900">Add a course</h2>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-[150px_90px_1fr]">
          <Input
            label="Course code"
            placeholder="PM-103"
            required
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
          />
          {/* Usually 1. Typed rather than fixed because a course brought in
              from elsewhere may already be at its third edition. */}
          <Input
            label="Version"
            type="number"
            min={1}
            max={99}
            required
            value={form.version}
            onChange={(event) => setForm({ ...form, version: event.target.value })}
          />
          <Input
            label="Title"
            placeholder="Advanced Project Management"
            required
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[12rem] flex-1">
            <Select
              label="Category"
              value={form.categoryId}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
            >
              <option value="">Uncategorised</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>

          <Button type="submit" disabled={busy}>
            {busy ? 'Adding…' : 'Add course'}
          </Button>
        </div>
      </form>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        The code names the subject and the version says which edition — PM-101 v1 and v2 are two
        courses. Letters, numbers and hyphens; a code and version together must be unique.
        Everything here can be corrected later with Edit, and the course starts as a draft.
      </p>
    </Card>
  );
}

/**
 * Adding, renaming and removing the categories courses are filed under.
 *
 * It lives on the catalogue rather than getting a nav item of its own: nobody
 * sets out to "manage categories", they notice a missing one while filing a
 * course, and the fix should be on the screen where they noticed.
 */
function CategoryManager({ categories, busy, onAdd, onRename, onRemove }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);

  async function add(event) {
    event.preventDefault();
    if (!name.trim()) return;
    const added = await onAdd(name.trim());
    if (added) setName('');
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Categories</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            What a course is about. Every course list groups by these.
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={() => setOpen((was) => !was)}>
          {open ? 'Done' : 'Manage'}
        </Button>
      </div>

      {/* Closed, it is a row of chips — enough to see what exists without the
          machinery for changing it sitting on screen all day. */}
      {!open ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.length === 0 ? (
            <p className="text-sm text-slate-500">
              None yet. Add Frontend, Backend, UI/UX and the rest with Manage.
            </p>
          ) : (
            categories.map((category) => (
              <Badge key={category.id} tone={toneForCategory(category)}>
                {category.name} · {category.courses}
              </Badge>
            ))
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <ul className="divide-y divide-slate-100 border-y border-slate-100">
            {categories.map((category) =>
              category.id === editingId ? (
                <RenameRow
                  key={category.id}
                  category={category}
                  busy={busy}
                  onCancel={() => setEditingId(null)}
                  onSave={async (next) => {
                    const saved = await onRename(category, next);
                    if (saved) setEditingId(null);
                  }}
                />
              ) : (
                <li
                  key={category.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5"
                >
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium text-slate-900">{category.name}</span>
                    <span className="text-xs text-slate-500">
                      {category.courses === 0 ? 'empty' : plural(category.courses, 'course')}
                    </span>
                  </span>

                  <span className="flex gap-3">
                    <button
                      disabled={busy}
                      onClick={() => setEditingId(category.id)}
                      className="text-xs text-indigo-600 underline hover:text-indigo-700 disabled:opacity-50"
                    >
                      Rename
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => onRemove(category)}
                      // The courses survive, so this needs no confirmation
                      // dialog — the notice afterwards says where they went and
                      // filing them again is a dropdown.
                      title={
                        category.courses > 0
                          ? `${plural(category.courses, 'course')} would move to Uncategorised`
                          : undefined
                      }
                      className="text-xs text-rose-600 underline hover:text-rose-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </span>
                </li>
              ),
            )}
          </ul>

          <form onSubmit={add} className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Input
                label="New category"
                placeholder="Quality Assurance"
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {busy ? 'Adding…' : 'Add category'}
            </Button>
          </form>

          <p className="text-xs leading-relaxed text-slate-500">
            Removing a category never removes its courses — they come back as Uncategorised and can
            be filed again from Edit.
          </p>
        </div>
      )}
    </Card>
  );
}

/** Renaming in place. The slug follows the name, so typos do not outlive them. */
function RenameRow({ category, busy, onSave, onCancel }) {
  const [name, setName] = useState(category.name);
  const changed = name.trim() && name.trim() !== category.name;

  return (
    <li className="py-2.5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (changed) onSave(name.trim());
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="w-64">
          <Input
            label="Name"
            autoFocus
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={busy || !changed}>
          Save
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </form>
    </li>
  );
}

/**
 * One grid, shared by the column labels and every course row, so the columns
 * line up down the whole page even though the rows live in separate cards.
 * That is the trick that lets the catalogue be grouped and still be a table.
 */
const GRID =
  'grid grid-cols-[minmax(0,1fr)_136px_58px_86px_96px_216px] items-center gap-x-3';

/**
 * The catalogue, grouped by what each course is about.
 *
 * This was one table with grey banded heading rows, and it failed in a way that
 * only shows up once there are more categories than courses: three empty
 * headings stacked on top of each other, each a full-height band promising
 * content that never came. Empty categories are now a single quiet line at the
 * bottom, and each category that does hold something gets its own card.
 */
function CourseCatalogue({ courses, categories, busy, onSave, onDuplicate, onDeleted, onError }) {
  // One row at a time: two half-finished edits on screen is a way to save the
  // wrong one.
  const [editingId, setEditingId] = useState(null);
  const folds = useCollapsedCategories('lt.catalogue.collapsed');

  if (courses.length === 0) return <Empty>No courses yet. Add the first one above.</Empty>;

  const groups = groupByCategory(courses, { all: categories });
  const unused = categories.filter((category) => category.courses === 0);

  const anyOpen = groups.some((group) => folds.isOpen(group.category));

  return (
    // Sections sit close together: folded, they are single rows, and spacing
    // them as though they held content made a collapsed catalogue look like a
    // page that had failed to load.
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-4">
        {/* Only offered when there is more than one section to act on. */}
        {groups.length > 1 && (
          <button
            onClick={() =>
              folds.allOpen ? folds.closeAll(groups.map((group) => group.category)) : folds.openAll()
            }
            className="shrink-0 text-xs font-medium text-indigo-600 transition hover:text-indigo-700"
          >
            {folds.allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>

      {/* Labelled once, above everything, rather than repeated per card — and
          not rendered at all when there is nothing open for it to head. It used
          to go invisible, which left a band of empty page above the sections. */}
      {anyOpen && (
        <div
          className={`${GRID} px-5 text-[11px] font-semibold uppercase tracking-wide text-slate-400`}
        >
          <span>Course</span>
          <span>Lead</span>
          <span className="text-right">Topics</span>
          <span className="text-right">Candidates</span>
          <span>Status</span>
          <span />
        </div>
      )}

      {groups.map((group) => (
        <section key={group.category.id ?? 'none'} className={folds.isOpen(group.category) ? 'pb-3' : ''}>
          <CategoryHeading
            category={group.category}
            count={group.courses.length}
            open={folds.isOpen(group.category)}
            onToggle={() => folds.toggle(group.category)}
            // Enough to recognise what is in there without opening it. Capped,
            // because a heading that wraps to three lines is not a heading.
            preview={group.courses
              .slice(0, 6)
              .map((course) => `${course.code} v${course.version}`)
              .join(' · ')}
          />

          {folds.isOpen(group.category) && (
          <Card flush className="mt-2.5 overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {group.courses.map((course) => (
                <li key={course.id}>
                  {course.id === editingId ? (
                    <CourseEditForm
                      course={course}
                      categories={categories}
                      busy={busy}
                      onCancel={() => setEditingId(null)}
                      onSave={async (fields) => {
                        const saved = await onSave(course, fields);
                        if (saved) setEditingId(null);
                      }}
                    />
                  ) : (
                    <CourseRow
                      course={course}
                      busy={busy}
                      onEdit={() => setEditingId(course.id)}
                      onDuplicate={() => onDuplicate(course)}
                      onDeleted={onDeleted}
                      onError={onError}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Card>
          )}
        </section>
      ))}

      {/* The categories nobody has filed anything under. A sentence, because
          that is all the information is worth — the Categories card above is
          where you act on them. */}
      {unused.length > 0 && (
        <p className="text-xs text-slate-500">
          Nothing filed under{' '}
          <span className="font-medium text-slate-600">
            {unused.map((category) => category.name).join(' · ')}
          </span>{' '}
          yet.
        </p>
      )}
    </div>
  );
}

function CourseRow({ course, busy, onEdit, onDuplicate, onDeleted, onError }) {
  return (
    <div className={`${GRID} px-5 py-3.5 transition hover:bg-slate-50/70`}>
      <Link to={`/trainer/courses/${course.id}`} className="group min-w-0">
        <span className="flex items-baseline gap-1.5">
          <span className="text-xs font-semibold tracking-wide text-indigo-600">{course.code}</span>
          <span className="text-xs text-slate-400">v{course.version}</span>
        </span>
        <span className="block truncate font-medium text-slate-900 group-hover:text-indigo-700">
          {course.title}
        </span>
      </Link>

      <span className="truncate text-sm">
        {course.owner ? (
          <span className="text-slate-700">{course.owner.fullName}</span>
        ) : (
          <Badge tone="amber">No lead</Badge>
        )}
      </span>

      {/* Tabular figures, so the counts form a column rather than a ragged
          edge that has to be read one row at a time. */}
      <span className="text-right text-sm tabular-nums text-slate-700">
        {course._count.topics}
      </span>
      <span className="text-right text-sm tabular-nums text-slate-700">
        {course._count.enrollments}
      </span>

      <span>
        <Badge tone={course.isPublished ? 'green' : 'amber'}>
          {course.isPublished ? 'Published' : 'Draft'}
        </Badge>
      </span>

      <span className="flex justify-end gap-1.5">
        <Button variant="secondary" size="sm" disabled={busy} onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="subtle"
          size="sm"
          disabled={busy}
          onClick={onDuplicate}
          title={`Copy into v${course.version + 1} and revise it there`}
        >
          + Version
        </Button>
        <DeleteCourse course={course} onDeleted={onDeleted} onError={onError} />
      </span>
    </div>
  );
}

/**
 * The row turned into a form. It takes the full width of the card rather than
 * editing in place, so the title has room to be read and corrected.
 */
function CourseEditForm({ course, categories, busy, onSave, onCancel }) {
  const [form, setForm] = useState({
    code: course.code,
    title: course.title,
    description: course.description ?? '',
    // Kept as a string because the input hands one back; an empty box means
    // "no duration set" rather than zero weeks.
    durationWeeks: course.durationWeeks == null ? '' : String(course.durationWeeks),
    version: String(course.version),
    // '' rather than null, because that is what an unselected <select> holds.
    categoryId: course.category?.id ?? '',
  });

  const code = form.code.trim().toUpperCase();
  const title = form.title.trim();
  const description = form.description.trim();
  const durationWeeks = form.durationWeeks === '' ? null : Number(form.durationWeeks);
  const categoryId = form.categoryId || null;
  const version = Number(form.version) || 1;

  const was = {
    code: course.code,
    version: course.version,
    title: course.title,
    description: course.description ?? '',
    durationWeeks: course.durationWeeks ?? null,
    categoryId: course.category?.id ?? null,
  };

  const changed =
    code !== was.code ||
    version !== was.version ||
    title !== was.title ||
    description !== was.description ||
    durationWeeks !== was.durationWeeks ||
    categoryId !== was.categoryId;

  function handleSubmit(event) {
    event.preventDefault();
    if (!changed || !code || !title) return;

    // Send only what moved, so an untouched code is never re-checked for
    // clashes against itself.
    onSave({
      ...(code !== was.code && { code }),
      ...(version !== was.version && { version }),
      ...(title !== was.title && { title }),
      // null, not undefined — JSON drops undefined, so an emptied box would
      // never reach the API and the description could not be cleared.
      ...(description !== was.description && { description: description || null }),
      ...(durationWeeks !== was.durationWeeks && { durationWeeks }),
      // Same reason: null is how a course leaves its category.
      ...(categoryId !== was.categoryId && { categoryId }),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 bg-indigo-50/40 px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Input
            label="Course code"
            autoFocus
            required
            maxLength={20}
            className="uppercase"
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
          />
        </div>

        <div className="w-24">
          <Input
            label="Version"
            type="number"
            min={1}
            max={99}
            required
            value={form.version}
            onChange={(event) => setForm({ ...form, version: event.target.value })}
          />
        </div>

        <div className="min-w-[18rem] flex-1">
          <Input
            label="Title"
            required
            maxLength={200}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </div>

        <div className="w-52">
          <Select
            label="Category"
            value={form.categoryId}
            onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
          >
            <option value="">Uncategorised</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-36">
          <Input
            label="Duration (weeks)"
            type="number"
            min={1}
            max={104}
            placeholder="none"
            value={form.durationWeeks}
            onChange={(event) => setForm({ ...form, durationWeeks: event.target.value })}
          />
        </div>
      </div>

      <Textarea
        label="Description"
        rows={2}
        maxLength={2000}
        placeholder="What the course covers, in a sentence or two. Candidates see this when browsing."
        value={form.description}
        onChange={(event) => setForm({ ...form, description: event.target.value })}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={busy || !changed}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <p className="text-xs text-slate-500">
          Candidates see the code and description. A code is quoted outside the system, so change it
          only when it is genuinely wrong — letters, numbers and hyphens, and unique.
        </p>
      </div>
    </form>
  );
}
