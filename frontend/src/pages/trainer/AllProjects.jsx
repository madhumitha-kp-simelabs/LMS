import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, Empty, Input, Select } from '../../components/ui';
import { groupByCategory, toneForCategory, useCollapsedCategories } from '../../lib/categories';
import CategoryHeading from '../../components/CategoryHeading';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Every project set anywhere in the organisation, grouped by subject.
 *
 * A lead runs one course but is answerable for how the programme hangs
 * together, and until now the only way to see what work had been set elsewhere
 * was to open each course in turn and count. This is that view.
 *
 * It shows what was set and how it is going — never who is doing it. Names and
 * handed-in work live on each course's own Projects and Work handed in screens,
 * with the people teaching those candidates.
 */
export default function AllProjects() {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const folds = useCollapsedCategories('lt.allProjects.collapsed');

  useEffect(() => {
    api('/projects/all')
      .then(({ projects }) => setProjects(projects))
      .catch((err) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return (projects ?? []).filter((project) => {
      if (scope === 'mine' && !project.mine) return false;
      if (scope === 'review' && project.awaitingReview === 0) return false;
      if (scope === 'unallotted' && project.allotted > 0) return false;
      if (!needle) return true;

      // Title, brief and course together — you rarely remember which of the
      // three the word you are looking for was in.
      return `${project.title} ${project.brief ?? ''} ${project.course.code} ${project.course.title}`
        .toLowerCase()
        .includes(needle);
    });
  }, [projects, query, scope]);

  if (!projects && !error) return <p className="text-sm text-slate-500">Loading projects…</p>;

  const mine = (projects ?? []).filter((p) => p.mine).length;
  const toReview = (projects ?? []).reduce((sum, p) => sum + (p.mine ? p.awaitingReview : 0), 0);
  const filtering = Boolean(query.trim() || scope !== 'all');

  // Grouped on the course's category, since that is what a project inherits —
  // a project has no subject of its own.
  const groups = groupByCategory(
    filtered.map((project) => ({ ...project, category: project.course.category })),
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Projects</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Every project set across the organisation. You can change the ones on courses you lead;
        the rest are here so you can see what is already being asked of people.
      </p>

      <div className="mt-6 space-y-4">
        <Alert>{error}</Alert>

        {projects?.length === 0 ? (
          <Empty>No projects have been set on any course yet.</Empty>
        ) : (
          <>
            {toReview > 0 && (
              <Alert tone="amber">
                {plural(toReview, 'submission')} waiting on you across your own courses.
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[16rem] flex-1">
                <Input
                  type="search"
                  placeholder="Search projects, briefs or courses…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>

              <div className="w-56">
                <Select value={scope} onChange={(event) => setScope(event.target.value)}>
                  <option value="all">Every course</option>
                  <option value="mine">Courses I lead ({mine})</option>
                  <option value="review">Waiting to be reviewed</option>
                  <option value="unallotted">Not given out yet</option>
                </Select>
              </div>

              {filtering && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery('');
                    setScope('all');
                  }}
                >
                  Clear
                </Button>
              )}
            </div>

            {filtering && (
              <p className="text-xs text-slate-500">
                {filtered.length === 0
                  ? 'Nothing matches.'
                  : `Showing ${filtered.length} of ${plural(projects.length, 'project')}.`}
              </p>
            )}

            {filtered.length === 0 ? (
              <Empty>No projects match those filters.</Empty>
            ) : (
              <div className="space-y-6">
                {groups.map((group) => (
                  <section key={group.category.id ?? 'none'}>
                    <CategoryHeading
                      category={group.category}
                      count={group.courses.length}
                      open={folds.isOpen(group.category)}
                      onToggle={() => folds.toggle(group.category)}
                    />

                    {folds.isOpen(group.category) && (
                    <div className="mt-3 space-y-3">
                      {group.courses.map((project) => (
                        <ProjectRow key={project.id} project={project} />
                      ))}
                    </div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project }) {
  const { course } = project;
  const done = project.allotted === 0 ? 0 : Math.round((project.completed / project.allotted) * 100);

  return (
    <Card
      // Only your own courses get an accent. On a page that is mostly other
      // people's work, the colour is what picks out the rows you can act on.
      accent={project.mine ? 'indigo' : undefined}
      className={project.mine ? '' : 'bg-slate-50/50'}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Link
              to={`/trainer/courses/${course.id}/projects`}
              className="text-xs font-semibold tracking-wide text-indigo-600 hover:underline"
            >
              {course.code}
            </Link>
            <span className="text-xs text-slate-500">{course.title}</span>
            {!course.isPublished && <Badge tone="slate">Draft course</Badge>}
          </div>

          <h2 className="mt-1 font-semibold text-slate-900">{project.title}</h2>

          {project.brief && (
            <p className="mt-1 line-clamp-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              {project.brief}
            </p>
          )}

          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{project.mine ? 'Yours' : `Led by ${course.owner?.fullName ?? 'nobody yet'}`}</span>
            {course.category && (
              <>
                <span className="text-slate-300">·</span>
                <Badge tone={toneForCategory(course.category)}>{course.category.name}</Badge>
              </>
            )}
            {project.dueAt && (
              <>
                <span className="text-slate-300">·</span>
                <span className={project.overdue ? 'font-medium text-rose-700' : 'text-amber-700'}>
                  Due {formatDate(project.dueAt)}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="shrink-0 text-right">
          {project.allotted === 0 ? (
            <Badge tone="amber">Not given out</Badge>
          ) : (
            <>
              <p className="text-sm text-slate-700">
                <strong className="tabular-nums">
                  {project.completed}/{project.allotted}
                </strong>{' '}
                finished
              </p>
              <span className="mt-1.5 block h-1.5 w-28 overflow-hidden rounded-full bg-slate-200">
                <span
                  className={`block h-full rounded-full transition-[width] ${
                    done === 100 ? 'bg-emerald-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${done}%` }}
                />
              </span>
              <p className="mt-1.5 text-xs text-slate-500">
                {project.handedIn} handed in · {project.evaluated} marked
              </p>
              {/* Actionable only on your own courses — on somebody else's it is
                  a fact about them, not a job for you. */}
              {project.awaitingReview > 0 &&
                (project.mine ? (
                  <Link
                    to={`/trainer/courses/${course.id}/submissions`}
                    className="mt-1 inline-block text-xs font-medium text-amber-700 underline hover:text-amber-800"
                  >
                    {project.awaitingReview} to review
                  </Link>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    {project.awaitingReview} awaiting their lead
                  </p>
                ))}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
