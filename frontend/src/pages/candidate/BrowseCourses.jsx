import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, Empty } from '../../components/ui';
import { groupByCategory, toneForCategory, useCollapsedCategories } from '../../lib/categories';
import CategoryHeading from '../../components/CategoryHeading';

/**
 * The course catalogue.
 *
 * Summary information only — a candidate can see that a course exists and ask
 * to join it, but cannot open its topics, material or quizzes until a trainer
 * allots them.
 */
export default function BrowseCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const folds = useCollapsedCategories('lt.browse.collapsed');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const { courses } = await api('/learn/catalogue');
      setCourses(courses);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function subscribe(courseId) {
    setBusyId(courseId);
    setError(null);
    try {
      await api(`/learn/courses/${courseId}/subscribe`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function withdraw(courseId) {
    setBusyId(courseId);
    setError(null);
    try {
      await api(`/learn/courses/${courseId}/subscribe`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading courses…</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Browse courses</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every course in the organisation, by subject. Ask to join one and its lead will give you
        access; the ones you already work on are marked.
      </p>

      <div className="mt-4">
        <Alert>{error}</Alert>
      </div>

      {courses.length === 0 ? (
        <div className="mt-6">
          <Empty>No courses have been published yet.</Empty>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groupByCategory(courses).map((group) => (
            <section key={group.category.id ?? 'none'}>
              <CategoryHeading
                category={group.category}
                count={group.courses.length}
                open={folds.isOpen(group.category)}
                onToggle={() => folds.toggle(group.category)}
              />

              {folds.isOpen(group.category) && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {group.courses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    busy={busyId === course.id}
                    onSubscribe={() => subscribe(course.id)}
                    onWithdraw={() => withdraw(course.id)}
                  />
                ))}
              </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, busy, onSubscribe, onWithdraw }) {
  const { subscription, allottedTopics, topicCount } = course;

  /**
   * A course they have moved off or stopped.
   *
   * Greyed rather than hidden: seeing the old edition sitting there is what
   * explains why the new one has their attention, and their results on it are
   * still reachable. But it carries no accent and no action — the point of
   * dimming it is that nothing here is theirs to do any more.
   */
  const left = subscription === 'moved' || subscription === 'stopped';

  /**
   * An older edition, to somebody who is not on it.
   *
   * Dimmed and not joinable: there is no reason to start on material a lead has
   * already replaced. Anyone actually on it — mid-course, awaiting approval, or
   * staff — sees the card as normal, because for them it is still the course
   * they are on rather than a stale option.
   */
  const superseded = course.newerVersion != null && subscription === 'none' && !course.staff;

  const dim = left || superseded;

  const accent = { none: 'sky', pending: 'amber', active: 'emerald' }[subscription];

  return (
    <Card
      accent={accent}
      className={`flex h-full flex-col ${dim ? 'bg-slate-50/70 opacity-75' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5">
            <span className="text-base font-semibold tracking-wide text-indigo-600">
              {course.code}
            </span>
            <span className="text-xs text-slate-400">v{course.version}</span>
          </p>
          <h2 className="mt-0.5 font-semibold text-slate-900">{course.title}</h2>
        </div>
        <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {course.category && (
            <Badge tone={toneForCategory(course.category)}>{course.category.name}</Badge>
          )}
          {course.staff === 'lead' && <Badge tone="indigo">You lead this</Badge>}
          {course.staff === 'trainer' && <Badge tone="sky">On the team</Badge>}
          {subscription === 'active' && <Badge tone="green">Enrolled</Badge>}
          {subscription === 'pending' && <Badge tone="amber">Requested</Badge>}
          {/* Named, not just dimmed. A grey card with no explanation reads as
              unavailable or broken, and somebody would reasonably wonder why
              they cannot open a course they think they are on. */}
          {subscription === 'moved' && <Badge tone="slate">Moved to a later version</Badge>}
          {subscription === 'stopped' && <Badge tone="slate">You stopped this</Badge>}
          {superseded && <Badge tone="slate">Replaced by v{course.newerVersion}</Badge>}
        </span>
      </div>

      {course.description && (
        <p className="mt-2 text-sm text-slate-600">{course.description}</p>
      )}

      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="text-violet-700">{topicCount} topics</span>
        {course.durationWeeks && (
          <>
            <span className="text-slate-300">·</span>
            <span className="text-amber-700">{course.durationWeeks} weeks</span>
          </>
        )}
        <span className="text-slate-300">·</span>
        <span>{course.trainerName ? `Trainer: ${course.trainerName}` : 'No lead yet'}</span>
      </p>

      <div className="mt-auto pt-4">
        {/* Checked before subscription, because staff never have one — and a
            course you run is somewhere to go, not somewhere to apply. */}
        {course.staff ? (
          <Link to={`/trainer/courses/${course.id}`}>
            <Button variant="subtle">
              {course.staff === 'lead' ? 'Open your course' : 'Open the course'}
            </Button>
          </Link>
        ) : (
          <>
        {subscription === 'none' &&
          (superseded ? (
            // Says where to go instead. A dimmed card with no button and no
            // sentence reads as something broken rather than something old.
            <p className="text-xs text-slate-500">
              An older edition. Version {course.newerVersion} is the current one — join that.
            </p>
          ) : (
            <Button onClick={onSubscribe} disabled={busy}>
              {busy ? 'Sending…' : 'Ask to join'}
            </Button>
          ))}

        {subscription === 'pending' && (
          <div>
            <p className="mb-2 text-xs text-amber-700">
              Waiting for {course.trainerName} to approve your request.
            </p>
            <Button variant="secondary" onClick={onWithdraw} disabled={busy}>
              {busy ? 'Withdrawing…' : 'Withdraw request'}
            </Button>
          </div>
        )}

        {subscription === 'active' &&
          (allottedTopics > 0 ? (
            <Link to="/my-courses">
              <Button variant="subtle">
                Open {allottedTopics} of {topicCount} topics
              </Button>
            </Link>
          ) : (
            <p className="text-xs text-slate-500">
              You&apos;re enrolled. Your trainer hasn&apos;t shared any topics with you yet.
            </p>
          ))}

        {/* My progress, not My courses: this course is no longer listed there,
            so the old "Open topics" button led to a page it was missing from. */}
        {left && (
          <Link to="/my-progress" className="text-sm text-indigo-600 hover:text-indigo-700">
            See what you did here →
          </Link>
        )}
          </>
        )}
      </div>
    </Card>
  );
}
